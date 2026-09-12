import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { IceServer } from '../common/types/signaling.types';
import { generateTurnCredentials } from './turn-credentials.util';

@Injectable()
export class IceServersService {
  constructor(private readonly config: ConfigService) {}

  getIceServers(userId: string): IceServer[] {
    const app = this.config.get<AppConfig>('app')!;
    const servers: IceServer[] = [];

    if (app.stunUrls.length > 0) {
      servers.push({ urls: app.stunUrls });
    }

    if (app.turnUrls.length > 0 && app.turnSharedSecret) {
      const { username, credential } = generateTurnCredentials(
        userId,
        app.turnSharedSecret,
        app.turnCredentialTtlSeconds,
      );
      servers.push({ urls: app.turnUrls, username, credential });
    }

    return servers;
  }
}
