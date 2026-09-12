import { Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { IncomingMessage } from 'http';
import { Server } from 'ws';
import { extractBearerToken } from '../auth/ws-auth.util';

const logger = new Logger('SignalingWsAdapter');

export interface AuthenticatedRequest extends IncomingMessage {
  userId?: string;
}

/**
 * `create()` runs when Nest actually starts listening (inside `app.listen`),
 * well after `ConfigModule` has loaded `.env` into `process.env` — unlike a
 * `@WebSocketGateway({...})` decorator argument, which is evaluated at
 * import time, before any config is loaded. Reading env here avoids that
 * ordering trap.
 */
export class SignalingWsAdapter extends WsAdapter {
  create(
    port: number,
    options?: Record<string, unknown> & { path?: string },
  ): Server {
    const allowedOrigins = (process.env.CORS_ORIGIN ?? '*')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    return super.create(port, {
      ...options,
      verifyClient: (
        info: { origin: string; req: AuthenticatedRequest },
        callback: (result: boolean, code?: number, message?: string) => void,
      ) => {
        const remoteAddress = info.req.socket.remoteAddress;
        logger.log(
          `upgrade attempt from ${remoteAddress} origin=${info.origin || '(none)'} url=${info.req.url}`,
        );

        if (
          !allowedOrigins.includes('*') &&
          info.origin &&
          !allowedOrigins.includes(info.origin)
        ) {
          logger.warn(`rejected ${remoteAddress}: origin not allowed`);
          callback(false, 403, 'Origin not allowed');
          return;
        }

        const userId = extractBearerToken(info.req);
        if (!userId) {
          logger.warn(`rejected ${remoteAddress}: missing bearer token`);
          callback(false, 401, 'Missing bearer token');
          return;
        }

        info.req.userId = userId;
        callback(true);
      },
    }) as Server;
  }
}
