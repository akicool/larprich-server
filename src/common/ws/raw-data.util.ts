import { RawData } from 'ws';

/** `RawData` can be a string, Buffer, ArrayBuffer, or Buffer[] (fragmented
 * frames) — a bare `.toString()` gives the wrong result for the latter two,
 * so this normalizes all four to UTF-8 text before `JSON.parse`. */
export function rawDataToString(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  return Buffer.from(raw).toString('utf8'); // raw: ArrayBuffer
}
