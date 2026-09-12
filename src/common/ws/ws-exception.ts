import { ErrorCode } from '../types/signaling.types';

/** Thrown while handling one inbound WS message; caught by the gateway and
 * turned into an `error` envelope sent back on the same socket — never
 * closes the connection over one bad message. */
export class WsBusinessException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}
