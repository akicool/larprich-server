import { WebSocket } from 'ws';
import { UserProfile } from '../common/types/signaling.types';

export type ConnectionPhase = 'idle' | 'searching' | 'in-session';

export interface ConnectionState {
  userId: string;
  profile?: UserProfile;
  phase: ConnectionPhase;
  sessionId?: string;
  /** Flipped false right before each heartbeat ping, set true on `pong`;
   * a socket still false at the next tick is presumed dead and terminated. */
  isAlive: boolean;
}

/** Per-socket bookkeeping the gateway needs (phase, current session,
 * heartbeat liveness) — separate from `SessionsService`/`MatchmakingService`,
 * which track the call/queue domain, not connection housekeeping. */
export class SocketRegistry {
  private readonly entriesByClient = new Map<WebSocket, ConnectionState>();

  register(client: WebSocket, userId: string): ConnectionState {
    const state: ConnectionState = { userId, phase: 'idle', isAlive: true };
    this.entriesByClient.set(client, state);
    return state;
  }

  get(client: WebSocket): ConnectionState | undefined {
    return this.entriesByClient.get(client);
  }

  remove(client: WebSocket): void {
    this.entriesByClient.delete(client);
  }

  entries(): IterableIterator<[WebSocket, ConnectionState]> {
    return this.entriesByClient.entries();
  }
}
