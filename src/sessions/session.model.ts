import { WebSocket } from 'ws';
import { CallRole, UserProfile } from '../common/types/signaling.types';

export interface Peer {
  userId: string;
  profile: UserProfile;
  client: WebSocket;
  role: CallRole;
}

export interface Session {
  id: string;
  peers: [Peer, Peer];
  createdAt: number;
}
