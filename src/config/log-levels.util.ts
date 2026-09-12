import { LogLevel } from '@nestjs/common';

// Ordered least -> most verbose. Enabling a level enables everything to its
// left too (e.g. 'warn' enables fatal+error+warn, not just warn).
const ORDERED_LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export function resolveLogLevels(minLevel: string): LogLevel[] {
  const index = ORDERED_LEVELS.indexOf(minLevel as LogLevel);
  return index === -1
    ? ORDERED_LEVELS.slice(0, 4) // fallback: fatal..log
    : ORDERED_LEVELS.slice(0, index + 1);
}
