import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SignalingWsAdapter } from './../src/common/ws/signaling-ws.adapter';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The app has a WS gateway (SignalingModule) anywhere in its tree, so
    // Nest requires *some* WS adapter before `init()` — even for a
    // HTTP-only test — or it falls back to looking for
    // @nestjs/platform-socket.io and hard-`process.exit(1)`s when it's not
    // installed.
    app.useWebSocketAdapter(new SignalingWsAdapter(app));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: { status: string } }) => {
        expect(body.status).toBe('ok');
      });
  });
});
