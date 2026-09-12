import { Module } from '@nestjs/common';
import { IceServersService } from './ice-servers.service';

@Module({
  providers: [IceServersService],
  exports: [IceServersService],
})
export class IceServersModule {}
