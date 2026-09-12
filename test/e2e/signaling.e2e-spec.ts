import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { RawData, WebSocket } from 'ws';
import { AppModule } from '../../src/app.module';
import { rawDataToString } from '../../src/common/ws/raw-data.util';
import { SignalingWsAdapter } from '../../src/common/ws/signaling-ws.adapter';

interface Envelope {
  type: string;
  [key: string]: unknown;
}

function connect(port: number, userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/signaling`, {
      headers: { Authorization: `Bearer ${userId}` },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(
  socket: WebSocket,
  predicate?: (msg: Envelope) => boolean,
  timeoutMs = 5000,
): Promise<Envelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);

    function onMessage(raw: RawData) {
      const msg = JSON.parse(rawDataToString(raw)) as Envelope;
      if (predicate && !predicate(msg)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(msg);
    }

    socket.on('message', onMessage);
  });
}

describe('Signaling gateway (e2e)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    process.env.SEARCH_TIMEOUT_MS = '2000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new SignalingWsAdapter(app));
    await app.init();
    await app.listen(0);
    port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches two searchers and relays offer/answer/ice-candidate/leave', async () => {
    const alice = await connect(port, 'alice');
    const bob = await connect(port, 'bob');

    alice.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r1',
        genderFilter: 'any',
        profile: { id: 'alice', username: 'Alice', avatarURL: null },
      }),
    );
    bob.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r2',
        genderFilter: 'any',
        profile: { id: 'bob', username: 'Bob', avatarURL: null },
      }),
    );

    const [aliceMatched, bobMatched] = await Promise.all([
      nextMessage(alice, (m) => m.type === 'matched'),
      nextMessage(bob, (m) => m.type === 'matched'),
    ]);

    expect(aliceMatched.role).toBe('offerer');
    expect(bobMatched.role).toBe('answerer');
    expect(aliceMatched.sessionId).toBe(bobMatched.sessionId);
    expect((aliceMatched.opponent as { username: string }).username).toBe(
      'Bob',
    );
    expect((bobMatched.opponent as { username: string }).username).toBe(
      'Alice',
    );
    expect((aliceMatched.iceServers as unknown[]).length).toBeGreaterThan(0);

    const sessionId = aliceMatched.sessionId as string;

    alice.send(
      JSON.stringify({ type: 'offer', sessionId, sdp: 'fake-offer-sdp' }),
    );
    const offerAtBob = await nextMessage(bob, (m) => m.type === 'offer');
    expect(offerAtBob.sdp).toBe('fake-offer-sdp');

    bob.send(
      JSON.stringify({ type: 'answer', sessionId, sdp: 'fake-answer-sdp' }),
    );
    const answerAtAlice = await nextMessage(alice, (m) => m.type === 'answer');
    expect(answerAtAlice.sdp).toBe('fake-answer-sdp');

    alice.send(
      JSON.stringify({
        type: 'ice-candidate',
        sessionId,
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      }),
    );
    const candidateAtBob = await nextMessage(
      bob,
      (m) => m.type === 'ice-candidate',
    );
    expect((candidateAtBob.candidate as { sdpMid: string }).sdpMid).toBe('0');

    alice.send(JSON.stringify({ type: 'leave', sessionId, larpsGiven: 2 }));
    const peerLeft = await nextMessage(bob, (m) => m.type === 'peer-left');
    expect(peerLeft.reason).toBe('ended');

    alice.close();
    bob.close();
  });

  it('rejects a connection with no bearer token', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/signaling`);
        socket.once('open', () => resolve(undefined));
        socket.once('unexpected-response', (_req, res) =>
          reject(new Error(`rejected with status ${res.statusCode}`)),
        );
        socket.once('error', reject);
      }),
    ).rejects.toThrow(/rejected with status 401/);
  });

  it('notifies the other peer with reason "disconnected" when a socket drops mid-session', async () => {
    const alice = await connect(port, 'alice2');
    const bob = await connect(port, 'bob2');

    alice.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r3',
        genderFilter: 'any',
        profile: { id: 'alice2', username: 'Alice2', avatarURL: null },
      }),
    );
    bob.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r4',
        genderFilter: 'any',
        profile: { id: 'bob2', username: 'Bob2', avatarURL: null },
      }),
    );

    await Promise.all([
      nextMessage(alice, (m) => m.type === 'matched'),
      nextMessage(bob, (m) => m.type === 'matched'),
    ]);

    const peerLeftAtBob = nextMessage(bob, (m) => m.type === 'peer-left');
    alice.terminate();
    const msg = await peerLeftAtBob;
    expect(msg.reason).toBe('disconnected');

    bob.close();
  });

  it('relays offer/ice-candidate when the client echoes the session id in uppercase', async () => {
    // Swift's `UUID.uuidString` always renders uppercase, regardless of the
    // case a UUID string was originally parsed from — an iOS client relays
    // this server's (lowercase, `crypto.randomUUID()`) session id back in
    // uppercase on every subsequent message. A strict string comparison
    // against the stored (lowercase) session id would reject every one of
    // them with SESSION_NOT_FOUND the instant a real iOS client connects.
    const alice = await connect(port, 'alice3');
    const bob = await connect(port, 'bob3');

    alice.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r6',
        genderFilter: 'any',
        profile: { id: 'alice3', username: 'Alice3', avatarURL: null },
      }),
    );
    bob.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r7',
        genderFilter: 'any',
        profile: { id: 'bob3', username: 'Bob3', avatarURL: null },
      }),
    );

    const [aliceMatched] = await Promise.all([
      nextMessage(alice, (m) => m.type === 'matched'),
      nextMessage(bob, (m) => m.type === 'matched'),
    ]);

    const upperSessionId = (aliceMatched.sessionId as string).toUpperCase();

    alice.send(
      JSON.stringify({
        type: 'offer',
        sessionId: upperSessionId,
        sdp: 'fake-offer-sdp',
      }),
    );
    const offerAtBob = await nextMessage(bob, (m) => m.type === 'offer');
    expect(offerAtBob.sdp).toBe('fake-offer-sdp');

    alice.send(
      JSON.stringify({
        type: 'ice-candidate',
        sessionId: upperSessionId,
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      }),
    );
    const candidateAtBob = await nextMessage(
      bob,
      (m) => m.type === 'ice-candidate',
    );
    expect((candidateAtBob.candidate as { sdpMid: string }).sdpMid).toBe('0');

    alice.close();
    bob.close();
  });

  it('sends search-timeout when nobody compatible ever shows up', async () => {
    const solo = await connect(port, 'solo');
    solo.send(
      JSON.stringify({
        type: 'find',
        requestId: 'r5',
        genderFilter: 'male',
        profile: { id: 'solo', username: 'Solo', avatarURL: null },
      }),
    );

    const timeout = await nextMessage(
      solo,
      (m) => m.type === 'search-timeout',
      4000,
    );
    expect(timeout.requestId).toBe('r5');

    solo.close();
  });
});
