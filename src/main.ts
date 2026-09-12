import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SignalingWsAdapter } from './common/ws/signaling-ws.adapter';
import { AppConfig } from './config/configuration';
import { resolveLogLevels } from './config/log-levels.util';

async function bootstrap() {
  // bufferLogs: hold bootstrap logs until useLogger() below applies the
  // configured LOG_LEVEL, instead of logging at Nest's hardcoded default.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const appConfig = config.get<AppConfig>('app')!;

  app.useLogger(resolveLogLevels(appConfig.logLevel));
  app.enableShutdownHooks();

  app.enableCors({
    origin:
      appConfig.corsOrigin === '*'
        ? true
        : appConfig.corsOrigin.split(',').map((origin) => origin.trim()),
  });
  app.useWebSocketAdapter(new SignalingWsAdapter(app));

  await app.listen(appConfig.port);
  Logger.log(
    `Signaling server listening on port ${appConfig.port} (ws path: /signaling)`,
    'Bootstrap',
  );
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.stack : err, 'Bootstrap');
  process.exit(1);
});
