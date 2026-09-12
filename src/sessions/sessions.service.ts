import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { UserProfile } from '../common/types/signaling.types';
import { Peer, Session } from './session.model';

interface PeerInput {
  userId: string;
  profile: UserProfile;
  client: WebSocket;
}

/** Active call registry: a session is exactly two peers relaying signaling
 * through the server. Single in-memory process — fine at MVP scale; a
 * restart drops all sessions (documented limitation, not solved here). */
@Injectable()
export class SessionsService {
  private readonly sessionsById = new Map<string, Session>();
  private readonly sessionIdByClient = new Map<WebSocket, string>();

  create(offerer: PeerInput, answerer: PeerInput): Session {
    const offererPeer: Peer = { ...offerer, role: 'offerer' };
    const answererPeer: Peer = { ...answerer, role: 'answerer' };
    const session: Session = {
      id: randomUUID(),
      peers: [offererPeer, answererPeer],
      createdAt: Date.now(),
    };

    this.sessionsById.set(session.id, session);
    this.sessionIdByClient.set(offererPeer.client, session.id);
    this.sessionIdByClient.set(answererPeer.client, session.id);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessionsById.get(sessionId);
  }

  getByClient(client: WebSocket): Session | undefined {
    const sessionId = this.sessionIdByClient.get(client);
    return sessionId ? this.sessionsById.get(sessionId) : undefined;
  }

  otherPeer(session: Session, client: WebSocket): Peer | undefined {
    return session.peers.find((peer) => peer.client !== client);
  }

  /** Ends a session if it still exists; a second call for an
   * already-ended id is a quiet no-op (both peers often send `leave`
   * near-simultaneously). */
  end(sessionId: string): void {
    const session = this.sessionsById.get(sessionId);
    if (!session) return;
    for (const peer of session.peers) {
      this.sessionIdByClient.delete(peer.client);
    }
    this.sessionsById.delete(sessionId);
  }

  /** Used on disconnect: ends whatever session this socket was in, if any,
   * returning it so the caller can notify the other peer. */
  removeByClient(client: WebSocket): Session | undefined {
    const session = this.getByClient(client);
    if (session) this.end(session.id);
    return session;
  }
}
