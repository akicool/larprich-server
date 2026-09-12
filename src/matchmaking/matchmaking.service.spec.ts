import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { SessionsService } from '../sessions/sessions.service';
import { MatchmakingService } from './matchmaking.service';

function fakeSocket(): WebSocket {
  return {} as unknown as WebSocket;
}

function fakeConfig(searchTimeoutMs = 50000): ConfigService {
  return { get: () => ({ searchTimeoutMs }) } as unknown as ConfigService;
}

describe('MatchmakingService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pairs two compatible waiters, marking the first as offerer', () => {
    const service = new MatchmakingService(fakeConfig(), new SessionsService());
    const onTimeout = jest.fn();
    const onMatched = jest.fn();

    const clientA = fakeSocket();
    const clientB = fakeSocket();

    service.enqueue(
      {
        userId: 'a',
        requestId: 'r1',
        genderFilter: 'any',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: clientA,
      },
      onTimeout,
      onMatched,
    );
    expect(onMatched).not.toHaveBeenCalled();

    service.enqueue(
      {
        userId: 'b',
        requestId: 'r2',
        genderFilter: 'any',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: clientB,
      },
      onTimeout,
      onMatched,
    );

    expect(onMatched).toHaveBeenCalledTimes(1);
    const [offerer, answerer, session] = onMatched.mock.calls[0] as [
      { userId: string },
      { userId: string },
      { peers: { userId: string }[] },
    ];
    expect(offerer.userId).toBe('a');
    expect(answerer.userId).toBe('b');
    expect(session.peers.map((p) => p.userId)).toEqual(['a', 'b']);
  });

  it('does not pair incompatible gender filters', () => {
    const service = new MatchmakingService(fakeConfig(), new SessionsService());
    const onTimeout = jest.fn();
    const onMatched = jest.fn();

    service.enqueue(
      {
        userId: 'a',
        requestId: 'r1',
        genderFilter: 'male',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: fakeSocket(),
      },
      onTimeout,
      onMatched,
    );
    service.enqueue(
      {
        userId: 'b',
        requestId: 'r2',
        genderFilter: 'female',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: fakeSocket(),
      },
      onTimeout,
      onMatched,
    );

    expect(onMatched).not.toHaveBeenCalled();
  });

  it('fires onTimeout after the configured window if nobody compatible arrives', () => {
    const service = new MatchmakingService(
      fakeConfig(1000),
      new SessionsService(),
    );
    const onTimeout = jest.fn();
    const onMatched = jest.fn();

    service.enqueue(
      {
        userId: 'a',
        requestId: 'r1',
        genderFilter: 'any',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: fakeSocket(),
      },
      onTimeout,
      onMatched,
    );

    jest.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('cancel() removes a waiting entry and prevents a later match', () => {
    const service = new MatchmakingService(fakeConfig(), new SessionsService());
    const onTimeout = jest.fn();
    const onMatched = jest.fn();
    const clientA = fakeSocket();

    service.enqueue(
      {
        userId: 'a',
        requestId: 'r1',
        genderFilter: 'any',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: clientA,
      },
      onTimeout,
      onMatched,
    );
    expect(service.cancel(clientA)).toBe(true);
    expect(service.cancel(clientA)).toBe(false);
    expect(service.isSearching(clientA)).toBe(false);

    service.enqueue(
      {
        userId: 'b',
        requestId: 'r2',
        genderFilter: 'any',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: fakeSocket(),
      },
      onTimeout,
      onMatched,
    );
    expect(onMatched).not.toHaveBeenCalled();
  });
});
