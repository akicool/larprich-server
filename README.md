# larprich-signaling-server

A minimal WebRTC **signaling** server for LarpRich's "Live" video-chat-roulette
feature. It does exactly two things: matches two waiting users, then relays
SDP offer/answer and ICE candidates between them over a plain WebSocket.
**Actual audio/video never touches this server** — once two peers are
matched, media flows directly between the two phones (through a TURN relay
only when a direct connection isn't possible).

This is a standalone project, deliberately kept outside the LarpRich iOS repo
— see that repo's plan for how `RealLiveService` talks to it.

## What's here

```
src/
├── main.ts                 bootstrap: CORS, the custom ws adapter, listen
├── app.module.ts
├── config/                 typed env config + Joi validation (fail-fast boot)
├── health/                 GET /health
├── common/
│   ├── types/               shared wire-format types (GenderFilter, etc.)
│   ├── ws/                   envelope DTOs, validation, the custom WsAdapter
│   └── auth/                 bearer-token extraction (MVP: unverified)
├── ice-servers/             STUN list + coturn TURN credential minting
├── sessions/                active session registry (2 peers, relay target lookup)
├── matchmaking/             waiting queue + pairing by requested GenderFilter
└── signaling/               the one gateway: connection lifecycle + message routing
```

## Known, deliberate limitations (MVP scope)

- **No real gender verification.** The client's `User` model has no gender
  field today, so matchmaking only buckets by the *requested* filter
  (`male`/`female`/`any`) and pairs first-come-first-served among compatible
  requests — it can't verify anyone's actual gender.
- **Bearer token is trusted as-is**, no signature verification. Fine for local
  dev/testing; would need real auth before this is exposed beyond that.
- **Single in-memory process.** A restart drops all queues/sessions. Scaling
  to multiple instances would need a shared store (e.g. Redis) — not built
  here.
- **No reconnection/resume.** If a socket drops mid-search or mid-call, the
  client must start over (a fresh `find`), not resume a session.

## Setup

```bash
npm install
cp .env.example .env
# Generate a real TURN secret and put it in both .env (TURN_SHARED_SECRET)
# and docker/coturn/turnserver.conf (static-auth-secret) — they must match.
npm run turn:secret

docker compose up -d coturn   # local TURN/STUN relay
npm run start:dev             # ws://localhost:3001/signaling, http://localhost:3001/health
```

For a physical iPhone to reach this server, point the app at your Mac's LAN
IP (not `localhost`) — both devices need to be reachable from each other.

## Environment variables

See `.env.example` (dev) / `.env.production.example` (prod). `TURN_SHARED_SECRET`
is required (the app fails fast at boot if it's missing); everything else has
a sane default.

## Production deployment

Production runs on a VPS managed by [Dokploy](https://dokploy.com): its Traefik
terminates TLS for `wss://` and proxies to the app, while coturn runs alongside
on host networking, unproxied. `docker-compose.prod.yml` describes those two
services; TLS, routing and environment variables are configured in Dokploy
rather than in this repo. See [DEPLOYMENT.md](DEPLOYMENT.md) for access, the
redeploy flow, the port map and diagnostics.

## Wire protocol

One WebSocket per client at `/signaling`, authenticated via
`Authorization: Bearer <userId>` (or `?token=` query param) at connect time.
Every message is a flat JSON envelope, discriminated by `type`:

**Client → server:** `find`, `cancel-find`, `offer`, `answer`,
`ice-candidate`, `leave`, `ping`.

**Server → client:** `matched`, `search-timeout`, `offer` / `answer` /
`ice-candidate` (relayed near-verbatim), `peer-left`, `error`, `pong`.

See `src/common/ws/ws-envelope.dto.ts` (incoming shapes) and
`src/common/types/signaling.types.ts` (outgoing shapes) for exact fields, and
`src/signaling/signaling.gateway.ts` for the full message-routing logic.

A full call lifecycle: both clients connect → each sends `find` → once two
compatible searchers are queued, both get `matched` (one `role: "offerer"`,
one `"answerer"`, plus per-user ICE servers) → the offerer sends `offer`,
relayed to the answerer → answerer replies `answer`, relayed back → both
trickle `ice-candidate`s, relayed as they arrive → either side's `leave` (or a
dropped connection) ends the session and sends the other peer `peer-left`.

## Testing

```bash
npm test          # unit tests: matchmaking pairing/timeout/cancel, session registry
npm run test:e2e  # boots the real Nest app + two real `ws` clients through
                   # the actual gateway: full find→matched→offer→answer→
                   # ice-candidate→leave→peer-left flow, plus the
                   # no-bearer-token rejection and disconnect→peer-left paths
```

Gotcha if you add more e2e specs that build an `INestApplication` from
`AppModule`: this app has a `@WebSocketGateway` in its module tree, so Nest
requires *some* WS adapter registered before `app.init()` — even for
HTTP-only tests — or it hard-`process.exit(1)`s looking for
`@nestjs/platform-socket.io`. Always call
`app.useWebSocketAdapter(new SignalingWsAdapter(app))` before `init()`/`listen()`.

## Manual smoke test

```bash
npm run start:dev
# in another terminal, with wscat (npm i -g wscat) or any ws client:
wscat -c "ws://localhost:3001/signaling" -H "Authorization: Bearer user-a"
> {"type":"find","requestId":"r1","genderFilter":"any","profile":{"id":"user-a","username":"Alice","avatarURL":null}}
# repeat in a second terminal with "user-b" — both should receive a "matched" message
```
