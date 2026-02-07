import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import http, { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { AppModule } from './../src/app.module';
import { RedisIoAdapter } from './../src/gateway/adapters/redis-io.adapter';
import { REDIS_CLIENT } from './../src/redis/redis.module';

const USER_1 = { externalUserId: 'user-1', displayName: 'User One' };
const USER_2 = { externalUserId: 'user-2', displayName: 'User Two' };
const USER_3 = { externalUserId: 'user-3', displayName: 'User Three' };

type ReceiverMode = 'alwaysOk' | 'failOnce';

interface ReceivedRequest {
  headers: IncomingMessage['headers'];
  body: string;
  timestamp: string;
  attemptIndex: number;
}

describe('Webhooks (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let jwtService: JwtService;
  let connection: Connection;
  let redisClient: { quit: () => Promise<void> };
  let wsAdapter: RedisIoAdapter;

  const jwtSecret = 'test-secret-should-be-32-characters-long';
  const jwtIssuer = 'master-service';
  const internalSecret = 'internal-secret-should-be-32-characters-long';
  const mongoUri = 'mongodb://localhost:27017/chat-service-test';
  const redisUrl = 'redis://localhost:6379';

  const webhookSecret = 'webhook-secret-should-be-32-characters-long';
  let webhookServer: http.Server;
  let webhookUrl: string;
  let receiverMode: ReceiverMode = 'alwaysOk';
  let failOnceUsed = false;
  let received: ReceivedRequest[] = [];

  const signToken = (externalUserId: string) =>
    jwtService.sign({ externalUserId }, { issuer: jwtIssuer });

  const authHeader = (externalUserId: string) => ({
    Authorization: `Bearer ${signToken(externalUserId)}`,
  });

  const syncUser = async (user: { externalUserId: string; displayName: string }) =>
    request(app.getHttpServer())
      .post('/api/users/sync')
      .set('x-internal-secret', internalSecret)
      .send(user)
      .expect(201);

  const createConversation = async (userId: string, participantIds: string[]) => {
    const response = await request(app.getHttpServer())
      .post('/api/conversations')
      .set(authHeader(userId))
      .send({
        type: participantIds.length === 2 ? 'direct' : 'group',
        name: participantIds.length > 2 ? 'Team' : undefined,
        participantIds,
      })
      .expect(201);

    return response.body;
  };

  const createGroupConversation = async (userId: string, participantIds: string[]) => {
    const response = await request(app.getHttpServer())
      .post('/api/conversations')
      .set(authHeader(userId))
      .send({
        type: 'group',
        name: 'Team',
        participantIds,
      })
      .expect(201);

    return response.body;
  };

  const waitForDeliveries = async (count: number, timeoutMs = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (received.length >= count) {
        return received;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${count} webhook deliveries`);
  };

  const resetReceiver = (mode: ReceiverMode) => {
    receiverMode = mode;
    failOnceUsed = false;
    received = [];
  };

  beforeAll(async () => {
    webhookServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const attemptIndex = received.length + 1;
        received.push({
          headers: req.headers,
          body,
          timestamp: new Date().toISOString(),
          attemptIndex,
        });

        if (receiverMode === 'failOnce' && !failOnceUsed) {
          failOnceUsed = true;
          res.writeHead(500);
          res.end('fail');
          return;
        }

        res.writeHead(204);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      webhookServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = webhookServer.address();
    if (address && typeof address === 'object') {
      webhookUrl = `http://127.0.0.1:${address.port}/webhooks`;
    } else {
      throw new Error('Failed to start webhook receiver');
    }

    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoUri;
    process.env.REDIS_URL = redisUrl;
    process.env.AUTH_JWT_SECRET = jwtSecret;
    process.env.AUTH_JWT_ISSUER = jwtIssuer;
    process.env.INTERNAL_API_SECRET = internalSecret;
    process.env.WEBHOOK_ENABLED = 'true';
    process.env.WEBHOOK_URL = webhookUrl;
    process.env.WEBHOOK_SECRET = webhookSecret;
    process.env.WEBHOOK_TIMEOUT_MS = '1000';
    process.env.WEBHOOK_RETRY_ATTEMPTS = '2';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    wsAdapter = new RedisIoAdapter(app, redisUrl);
    await wsAdapter.connectToRedis();
    app.useWebSocketAdapter(wsAdapter);
    await app.listen(0);

    jwtService = new JwtService({ secret: jwtSecret, signOptions: { issuer: jwtIssuer } });
    connection = app.get<Connection>(getConnectionToken());
    redisClient = app.get(REDIS_CLIENT);
    if (redisClient && 'on' in redisClient) {
      (redisClient as any).on('error', () => undefined);
    }
  });

  beforeEach(async () => {
    if (redisClient && (redisClient as any).flushdb) {
      await (redisClient as any).flushdb();
    }
    await connection.dropDatabase();
    await syncUser(USER_1);
    await syncUser(USER_2);
    await syncUser(USER_3);
    resetReceiver('alwaysOk');
    process.env.WEBHOOK_EVENTS = '';
  });

  afterEach(() => {
    resetReceiver('alwaysOk');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (wsAdapter) {
      await wsAdapter.close();
    }
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {
        // ignore redis shutdown errors in tests
      }
      try {
        (redisClient as any).disconnect?.();
      } catch {
        // ignore redis shutdown errors in tests
      }
    }
    if (connection) {
      await connection.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  });

  it('delivers message.created with valid signature', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Hello webhook' })
      .expect(201);

    const deliveries = await waitForDeliveries(2);
    const delivery = deliveries.find((item) => {
      try {
        return JSON.parse(item.body).type === 'message.created';
      } catch {
        return false;
      }
    });

    if (!delivery) {
      throw new Error('Expected message.created webhook');
    }
    const signature = delivery.headers['x-webhook-signature'] as string;
    const eventType = delivery.headers['x-webhook-event'] as string;
    const eventId = delivery.headers['x-webhook-id'] as string;

    expect(signature).toBeTruthy();
    expect(eventType).toBe('message.created');
    expect(eventId).toBeTruthy();

    const expected = crypto.createHmac('sha256', webhookSecret).update(delivery.body).digest('hex');

    expect(signature).toBe(`sha256=${expected}`);

    const payload = JSON.parse(delivery.body);
    expect(payload.type).toBe('message.created');
    expect(payload.data.conversationId).toBe(conversation._id);
    expect(payload.data.content).toBe('Hello webhook');
  });

  it('delivers message.updated and message.deleted', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const message = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Edit me' })
      .expect(201);

    await waitForDeliveries(1);
    resetReceiver('alwaysOk');

    await request(app.getHttpServer())
      .patch(`/api/messages/${message.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Edited' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/messages/${message.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const deliveries = await waitForDeliveries(2);
    const types = deliveries.map((item) => JSON.parse(item.body).type);
    expect(types).toContain('message.updated');
    expect(types).toContain('message.deleted');
  });

  it('respects WEBHOOK_EVENTS filtering', async () => {
    const previousEvents = process.env.WEBHOOK_EVENTS;
    process.env.WEBHOOK_EVENTS = 'message.created';

    const isolatedModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const isolatedApp = isolatedModule.createNestApplication();
    isolatedApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const isolatedAdapter = new RedisIoAdapter(isolatedApp, redisUrl);
    await isolatedAdapter.connectToRedis();
    isolatedApp.useWebSocketAdapter(isolatedAdapter);
    await isolatedApp.listen(0);

    try {
      if (redisClient && (redisClient as any).flushdb) {
        await (redisClient as any).flushdb();
      }
      await connection.dropDatabase();
      await syncUser(USER_1);
      await syncUser(USER_2);
      resetReceiver('alwaysOk');

      const conversation = await request(isolatedApp.getHttpServer())
        .post('/api/conversations')
        .set(authHeader(USER_1.externalUserId))
        .send({
          type: 'direct',
          participantIds: [USER_1.externalUserId, USER_2.externalUserId],
        })
        .expect(201);

      const message = await request(isolatedApp.getHttpServer())
        .post(`/api/conversations/${conversation.body._id}/messages`)
        .set(authHeader(USER_1.externalUserId))
        .send({ content: 'Filtered' })
        .expect(201);

      await request(isolatedApp.getHttpServer())
        .post(`/api/messages/${message.body._id}/reactions`)
        .set(authHeader(USER_2.externalUserId))
        .send({ emoji: '👍' })
        .expect(201);

      const deliveries = await waitForDeliveries(1);
      const payload = JSON.parse(deliveries[0].body);
      expect(payload.type).toBe('message.created');
      expect(deliveries).toHaveLength(1);
    } finally {
      await isolatedApp.close();
      await isolatedAdapter.close();
      process.env.WEBHOOK_EVENTS = previousEvents;
    }
  });

  it('delivers participant and conversation deletion events', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await waitForDeliveries(1);
    resetReceiver('alwaysOk');

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/participants`)
      .set(authHeader(USER_1.externalUserId))
      .send({ externalUserId: USER_3.externalUserId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}/participants/${USER_3.externalUserId}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}?mode=delete`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const deliveries = await waitForDeliveries(3);
    const types = deliveries.map((item) => JSON.parse(item.body).type);
    expect(types).toContain('participant.added');
    expect(types).toContain('participant.removed');
    expect(types).toContain('conversation.deleted');
  });

  it('retries delivery on failure', async () => {
    resetReceiver('failOnce');

    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Retry me' })
      .expect(201);

    const deliveries = await waitForDeliveries(2);
    const eventIds = deliveries.map((item) => item.headers['x-webhook-id']);
    expect(eventIds[0]).toBe(eventIds[1]);
  });
});
