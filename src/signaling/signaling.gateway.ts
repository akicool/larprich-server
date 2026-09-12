import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { RawData, WebSocket } from 'ws';
import { AuthenticatedRequest } from '../common/ws/signaling-ws.adapter';
import {
  AnswerMessageDto,
  CancelFindMessageDto,
  FindMessageDto,
  IceCandidateMessageDto,
  LeaveMessageDto,
  OfferMessageDto,
  PingMessageDto,
} from '../common/ws/ws-envelope.dto';
import { validateDto } from '../common/ws/ws-validation';
import { WsBusinessException } from '../common/ws/ws-exception';
import { rawDataToString } from '../common/ws/raw-data.util';
import { AppConfig } from '../config/configuration';
import { ErrorCode } from '../common/types/signaling.types';
import { IceServersService } from '../ice-servers/ice-servers.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { Session } from '../sessions/session.model';
import { SessionsService } from '../sessions/sessions.service';
import { SocketRegistry } from './socket-registry';

/**
 * The one signaling endpoint. Deliberately bypasses `@SubscribeMessage`:
 * that binding expects incoming frames shaped `{event, data}`, but the wire
 * contract here is a flat `{type, ...fields}` envelope (simpler for the iOS
 * client — one flat `Decodable`, no nesting). So each connection gets a
 * single raw `client.on('message', ...)` listener that JSON.parses once and
 * switches on `type`, calling straight into the injected services. This is
 * a well-understood pattern for gateways that want full control of wire
 * format — Nest's DI/testability is unaffected, only the auto message
 * binding is skipped.
 */
@WebSocketGateway({ path: '/signaling' })
export class SignalingGateway
  implements
    OnGatewayConnection<WebSocket>,
    OnGatewayDisconnect<WebSocket>,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(SignalingGateway.name);
  private readonly registry = new SocketRegistry();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly sessions: SessionsService,
    private readonly iceServers: IceServersService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const heartbeatIntervalMs =
      this.config.get<AppConfig>('app')!.heartbeatIntervalMs;
    this.heartbeatTimer = setInterval(
      () => this.pingAll(),
      heartbeatIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  handleConnection(client: WebSocket, request: AuthenticatedRequest): void {
    // `verifyClient` in SignalingWsAdapter already rejected connections
    // without a bearer token before we get here; `userId` is always set.
    const userId = request.userId ?? 'unknown';
    this.registry.register(client, userId);
    this.logger.log(`connected userId=${userId}`);

    client.on('pong', () => {
      const state = this.registry.get(client);
      if (state) state.isAlive = true;
    });
    client.on('message', (raw) => this.onMessage(client, raw));
    client.on('error', (err) =>
      this.logger.warn(`socket error userId=${userId}: ${err.message}`),
    );
    client.on('close', (code, reason) =>
      this.logger.log(
        `closed userId=${userId} code=${code} reason=${reason.toString()}`,
      ),
    );
  }

  handleDisconnect(client: WebSocket): void {
    const state = this.registry.get(client);
    this.matchmaking.cancel(client);

    const session = this.sessions.removeByClient(client);
    if (session) {
      const other = this.sessions.otherPeer(session, client);
      this.safeSend(other?.client, {
        type: 'peer-left',
        sessionId: session.id,
        reason: 'disconnected',
      });
    }

    this.registry.remove(client);
    this.logger.log(`disconnected userId=${state?.userId ?? 'unknown'}`);
  }

  // MARK: - Message routing

  private onMessage(client: WebSocket, raw: RawData): void {
    let payload: unknown;
    try {
      payload = JSON.parse(rawDataToString(raw));
    } catch {
      this.sendError(client, 'INVALID_MESSAGE', 'Message is not valid JSON');
      return;
    }

    const type = (payload as { type?: unknown } | null)?.type;
    if (typeof type !== 'string') {
      this.sendError(client, 'INVALID_MESSAGE', 'Missing "type" field');
      return;
    }

    try {
      switch (type) {
        case 'find':
          this.handleFind(client, validateDto(FindMessageDto, payload));
          return;
        case 'cancel-find':
          this.handleCancelFind(
            client,
            validateDto(CancelFindMessageDto, payload),
          );
          return;
        case 'offer':
          this.handleRelay(client, validateDto(OfferMessageDto, payload));
          return;
        case 'answer':
          this.handleRelay(client, validateDto(AnswerMessageDto, payload));
          return;
        case 'ice-candidate':
          this.handleRelay(
            client,
            validateDto(IceCandidateMessageDto, payload),
          );
          return;
        case 'leave':
          this.handleLeave(client, validateDto(LeaveMessageDto, payload));
          return;
        case 'ping':
          this.handlePing(client, validateDto(PingMessageDto, payload));
          return;
        default:
          this.sendError(
            client,
            'INVALID_MESSAGE',
            `Unknown message type "${type}"`,
          );
      }
    } catch (err) {
      if (err instanceof WsBusinessException) {
        this.sendError(client, err.code, err.message, err.requestId);
      } else {
        this.logger.error(
          'Unhandled error while processing message',
          err as Error,
        );
        this.sendError(client, 'INTERNAL', 'Internal error');
      }
    }
  }

  // MARK: - Handlers

  private handleFind(client: WebSocket, msg: FindMessageDto): void {
    const state = this.registry.get(client);
    if (!state) return;
    if (state.phase !== 'idle') {
      throw new WsBusinessException(
        'ALREADY_SEARCHING',
        'Already searching or already in a session',
        msg.requestId,
      );
    }

    state.phase = 'searching';
    state.profile = msg.profile;

    this.matchmaking.enqueue(
      {
        userId: state.userId,
        requestId: msg.requestId,
        genderFilter: msg.genderFilter,
        profile: msg.profile,
        client,
      },
      (entry) => {
        const waitingState = this.registry.get(entry.client);
        if (waitingState) waitingState.phase = 'idle';
        this.safeSend(entry.client, {
          type: 'search-timeout',
          requestId: entry.requestId,
        });
      },
      (offerer, answerer, session) =>
        this.onMatched(offerer, answerer, session),
    );
  }

  private onMatched(
    offerer: { requestId: string; client: WebSocket; userId: string },
    answerer: { requestId: string; client: WebSocket; userId: string },
    session: Session,
  ): void {
    this.logger.log(
      `onMatched sessionId=${session.id} offerer=${offerer.userId} answerer=${answerer.userId}`,
    );
    for (const peer of session.peers) {
      const state = this.registry.get(peer.client);
      if (state) {
        state.phase = 'in-session';
        state.sessionId = session.id;
      }
    }

    const opponentOf = (client: WebSocket) =>
      this.sessions.otherPeer(session, client)!.profile;

    this.safeSend(offerer.client, {
      type: 'matched',
      requestId: offerer.requestId,
      sessionId: session.id,
      role: 'offerer',
      opponent: opponentOf(offerer.client),
      iceServers: this.iceServers.getIceServers(offerer.userId),
    });
    this.safeSend(answerer.client, {
      type: 'matched',
      requestId: answerer.requestId,
      sessionId: session.id,
      role: 'answerer',
      opponent: opponentOf(answerer.client),
      iceServers: this.iceServers.getIceServers(answerer.userId),
    });
  }

  private handleCancelFind(client: WebSocket, msg: CancelFindMessageDto): void {
    const removed = this.matchmaking.cancel(client);
    const state = this.registry.get(client);
    if (state && removed) state.phase = 'idle';
    this.logger.log(
      `cancel-find requestId=${msg.requestId} userId=${state?.userId}`,
    );
  }

  /** Pure relay for offer/answer/ice-candidate: forward verbatim to the
   * other peer in the same session. The server never parses SDP/ICE. */
  private handleRelay(
    client: WebSocket,
    msg: OfferMessageDto | AnswerMessageDto | IceCandidateMessageDto,
  ): void {
    const session = this.sessions.getByClient(client);
    if (!session || session.id !== msg.sessionId) {
      throw new WsBusinessException(
        'SESSION_NOT_FOUND',
        'No active session with that id',
      );
    }
    const other = this.sessions.otherPeer(session, client);
    this.safeSend(other?.client, msg);
  }

  private handleLeave(client: WebSocket, msg: LeaveMessageDto): void {
    const state = this.registry.get(client);
    this.logger.log(
      `session ended sessionId=${msg.sessionId} userId=${state?.userId} larpsGiven=${msg.larpsGiven ?? 0}`,
    );

    const session = this.sessions.get(msg.sessionId);
    if (!session) return; // already ended by the other peer — quiet no-op

    const other = this.sessions.otherPeer(session, client);
    this.sessions.end(session.id);

    for (const peer of session.peers) {
      const peerState = this.registry.get(peer.client);
      if (peerState) {
        peerState.phase = 'idle';
        peerState.sessionId = undefined;
      }
    }

    this.safeSend(other?.client, {
      type: 'peer-left',
      sessionId: session.id,
      reason: 'ended',
    });
  }

  private handlePing(client: WebSocket, msg: PingMessageDto): void {
    this.safeSend(client, { type: 'pong', ts: msg.ts });
  }

  // MARK: - Helpers

  private sendError(
    client: WebSocket,
    code: ErrorCode,
    message: string,
    requestId?: string,
  ): void {
    this.safeSend(client, { type: 'error', code, message, requestId });
  }

  private safeSend(client: WebSocket | undefined, payload: unknown): void {
    if (!client || client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify(payload));
  }

  private pingAll(): void {
    for (const [client, state] of this.registry.entries()) {
      if (!state.isAlive) {
        client.terminate();
        continue;
      }
      state.isAlive = false;
      client.ping();
    }
  }
}
