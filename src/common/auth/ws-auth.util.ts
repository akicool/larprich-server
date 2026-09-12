import { IncomingMessage } from 'http';

/**
 * MVP auth only: the bearer token is trusted as-is and used directly as the
 * userId. There is no signature verification — see README "Known
 * limitations". Real verification is out of scope for this signaling MVP.
 */
export function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }

  const url = req.url ?? '';
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return null;

  const token = new URLSearchParams(url.slice(queryIndex + 1)).get('token');
  return token && token.length > 0 ? token : null;
}
