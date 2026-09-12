import { WebSocket } from 'ws';
import { SessionsService } from './sessions.service';

function fakeSocket(): WebSocket {
  return {} as unknown as WebSocket;
}

describe('SessionsService', () => {
  it('creates a session with offerer/answerer roles and looks it up by either client', () => {
    const service = new SessionsService();
    const clientA = fakeSocket();
    const clientB = fakeSocket();

    const session = service.create(
      {
        userId: 'a',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: clientA,
      },
      {
        userId: 'b',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: clientB,
      },
    );

    expect(session.peers[0].role).toBe('offerer');
    expect(session.peers[1].role).toBe('answerer');
    expect(service.getByClient(clientA)?.id).toBe(session.id);
    expect(service.getByClient(clientB)?.id).toBe(session.id);
    expect(service.otherPeer(session, clientA)?.userId).toBe('b');
    expect(service.otherPeer(session, clientB)?.userId).toBe('a');
  });

  it('end() removes the session for both clients; a second end() is a no-op', () => {
    const service = new SessionsService();
    const clientA = fakeSocket();
    const clientB = fakeSocket();
    const session = service.create(
      {
        userId: 'a',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: clientA,
      },
      {
        userId: 'b',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: clientB,
      },
    );

    service.end(session.id);
    expect(service.getByClient(clientA)).toBeUndefined();
    expect(service.getByClient(clientB)).toBeUndefined();

    expect(() => service.end(session.id)).not.toThrow();
  });

  it('removeByClient() ends the session and returns it', () => {
    const service = new SessionsService();
    const clientA = fakeSocket();
    const clientB = fakeSocket();
    const session = service.create(
      {
        userId: 'a',
        profile: { id: 'a', username: 'Alice', avatarURL: null },
        client: clientA,
      },
      {
        userId: 'b',
        profile: { id: 'b', username: 'Bob', avatarURL: null },
        client: clientB,
      },
    );

    const removed = service.removeByClient(clientA);
    expect(removed?.id).toBe(session.id);
    expect(service.getByClient(clientB)).toBeUndefined();
    expect(service.removeByClient(clientA)).toBeUndefined();
  });
});
