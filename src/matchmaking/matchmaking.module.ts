import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { MatchmakingService } from './matchmaking.service';

@Module({
  imports: [SessionsModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
