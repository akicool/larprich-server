import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { AppConfig } from '../config/configuration';
import { genderFiltersCompatible } from '../common/types/gender-filter.enum';
import { Session } from '../sessions/session.model';
import { SessionsService } from '../sessions/sessions.service';
import { WaitingEntry } from './waiting-entry.model';

type SearchEntry = Omit<WaitingEntry, 'timeoutHandle'>;

/** Waiting queue + pairing. Linear scan, oldest-first — fine at MVP scale
 * (tens/hundreds of concurrent searchers). No real gender field exists on
 * the client's User today, so this only pairs by requested filter
 * compatibility, not verified gender — see gender-filter.enum.ts. */
@Injectable()
export class MatchmakingService {
  private readonly queue: WaitingEntry[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
  ) {}

  /** Enqueues `entry`, immediately pairing it with a compatible waiter if one
   * exists. `onMatched` receives (offerer, answerer, session) — the entry
   * that was already waiting becomes the offerer. `onTimeout` fires if
   * nobody compatible shows up within the configured window. */
  enqueue(
    entry: SearchEntry,
    onTimeout: (entry: SearchEntry) => void,
    onMatched: (
      offerer: SearchEntry,
      answerer: SearchEntry,
      session: Session,
    ) => void,
  ): void {
    const matchIndex = this.queue.findIndex(
      (waiting) =>
        waiting.userId !== entry.userId &&
        genderFiltersCompatible(waiting.genderFilter, entry.genderFilter),
    );

    if (matchIndex !== -1) {
      const [offerer] = this.queue.splice(matchIndex, 1);
      clearTimeout(offerer.timeoutHandle);

      const session = this.sessions.create(
        {
          userId: offerer.userId,
          profile: offerer.profile,
          client: offerer.client,
        },
        { userId: entry.userId, profile: entry.profile, client: entry.client },
      );

      onMatched(offerer, entry, session);
      return;
    }

    const searchTimeoutMs = this.config.get<AppConfig>('app')!.searchTimeoutMs;
    const timeoutHandle = setTimeout(() => {
      this.removeByClient(entry.client);
      onTimeout(entry);
    }, searchTimeoutMs);

    this.queue.push({ ...entry, timeoutHandle });
  }

  /** Removes `client` from the queue if it's waiting. Returns whether it was
   * actually removed (a no-op cancel is common and not an error). */
  cancel(client: WebSocket): boolean {
    return this.removeByClient(client);
  }

  isSearching(client: WebSocket): boolean {
    return this.queue.some((entry) => entry.client === client);
  }

  private removeByClient(client: WebSocket): boolean {
    const index = this.queue.findIndex((entry) => entry.client === client);
    if (index === -1) return false;
    const [entry] = this.queue.splice(index, 1);
    clearTimeout(entry.timeoutHandle);
    return true;
  }
}
