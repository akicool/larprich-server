import { randomBytes } from 'crypto';

// Prints a fresh secret to paste into both .env (TURN_SHARED_SECRET) and
// docker/coturn/turnserver.conf (static-auth-secret) — they must match.
console.log(randomBytes(24).toString('hex'));
