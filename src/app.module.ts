import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IceServersModule } from './ice-servers/ice-servers.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { SessionsModule } from './sessions/sessions.module';
import { SignalingModule } from './signaling/signaling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    HealthModule,
    IceServersModule,
    SessionsModule,
    MatchmakingModule,
    SignalingModule,
  ],
})
export class AppModule {}
