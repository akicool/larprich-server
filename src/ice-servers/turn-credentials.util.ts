import { createHmac } from 'crypto';

/** coturn's standard "TURN REST API" convention: a username of
 * `<unix-expiry>:<userId>` and an HMAC-SHA1(secret, username) credential,
 * base64-encoded. No DB or caching needed — computed fresh per match. */
export function generateTurnCredentials(
  userId: string,
  sharedSecret: string,
  ttlSeconds: number,
): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = createHmac('sha1', sharedSecret)
    .update(username)
    .digest('base64');
  return { username, credential };
}
