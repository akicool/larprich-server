export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  searchTimeoutMs: number;
  heartbeatIntervalMs: number;
  stunUrls: string[];
  turnUrls: string[];
  turnSharedSecret: string;
  turnCredentialTtlSeconds: number;
  logLevel: string;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '3001', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    searchTimeoutMs: parseInt(process.env.SEARCH_TIMEOUT_MS ?? '50000', 10),
    heartbeatIntervalMs: parseInt(
      process.env.HEARTBEAT_INTERVAL_MS ?? '15000',
      10,
    ),
    stunUrls: splitList(
      process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302',
    ),
    turnUrls: splitList(process.env.TURN_URLS),
    turnSharedSecret: process.env.TURN_SHARED_SECRET ?? '',
    turnCredentialTtlSeconds: parseInt(
      process.env.TURN_CREDENTIAL_TTL_SECONDS ?? '3600',
      10,
    ),
    logLevel: process.env.LOG_LEVEL ?? 'debug',
  },
});
