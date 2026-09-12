import { Module } from '@nestjs/common';
import { IceServersModule } from '../ice-servers/ice-servers.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SignalingGateway } from './signaling.gateway';

@Module({
  imports: [MatchmakingModule, SessionsModule, IceServersModule],
  providers: [SignalingGateway],
})
export class SignalingModule {}
