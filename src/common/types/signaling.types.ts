export interface UserProfile {
  id: string;
  username: string;
  avatarURL: string | null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export type ErrorCode =
  | 'INVALID_MESSAGE'
  | 'UNAUTHENTICATED'
  | 'ALREADY_SEARCHING'
  | 'NOT_SEARCHING'
  | 'NOT_IN_SESSION'
  | 'SESSION_NOT_FOUND'
  | 'INTERNAL';

export type CallRole = 'offerer' | 'answerer';

// ---- Server -> client message shapes (client -> server shapes live as DTOs
// in `ws-envelope.dto.ts`, validated on the way in) ----

export interface MatchedMessage {
  type: 'matched';
  requestId: string;
  sessionId: string;
  role: CallRole;
  opponent: UserProfile;
  iceServers: IceServer[];
}

export interface SearchTimeoutMessage {
  type: 'search-timeout';
  requestId: string;
}

export interface PeerLeftMessage {
  type: 'peer-left';
  sessionId: string;
  reason: 'ended' | 'disconnected';
}

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
  requestId?: string;
}

export interface PongMessage {
  type: 'pong';
  ts: number;
}
