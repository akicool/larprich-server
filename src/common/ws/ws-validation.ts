import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { WsBusinessException } from './ws-exception';

/** Validates an already-JSON-parsed payload against one envelope DTO.
 * Called from the gateway's manual `type` switch — see signaling.gateway.ts
 * for why we bypass `@SubscribeMessage`. */
export function validateDto<T extends object>(
  cls: new () => T,
  payload: unknown,
): T {
  const instance = plainToInstance(cls, payload);
  const errors = validateSync(instance as object, { whitelist: true });
  if (errors.length > 0) {
    const requestId = (payload as { requestId?: string } | null)?.requestId;
    const detail = errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .join(' | ');
    throw new WsBusinessException(
      'INVALID_MESSAGE',
      `Message failed validation: ${detail}`,
      requestId,
    );
  }
  return instance;
}
