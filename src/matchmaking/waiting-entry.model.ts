import { WebSocket } from 'ws';
import { GenderFilter } from '../common/types/gender-filter.enum';
import { UserProfile } from '../common/types/signaling.types';

export interface WaitingEntry {
  userId: string;
  requestId: string;
  genderFilter: GenderFilter;
  profile: UserProfile;
  client: WebSocket;
  timeoutHandle: NodeJS.Timeout;
}
