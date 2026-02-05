import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import { RedisIoAdapter } from './../src/gateway/adapters/redis-io.adapter';
import { REDIS_CLIENT } from './../src/redis/redis.module';

const USER_1 = { externalUserId: 'user-1', displayName: 'User One' };
const USER_2 = { externalUserId: 'user-2', displayName: 'User Two' };

describe('WebSocket gateway (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let jwtService: JwtService;
  let connection: Connection;
  let redisClient: { quit: () => Promise<void>; on?: (event: string, cb: () => void) => void };
  let wsAdapter: RedisIoAdapter;
  let wsPort = 0;

  const jwtSecret = 'test-secret-should-be-32-characters-long';
  const jwtIssuer = 'master-service';
  const internalSecret = 'internal-secret-should-be-32-characters-long';
  const mongoUri = 'mongodb://localhost:27017/chat-service-test';
  const redisUrl = 'redis://localhost:6379';

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

  const connectSocket = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(`http://localhost:${wsPort}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timed out waiting for WS connection'));
      }, 5000);

      socket.on('connected', () => {
        clearTimeout(timeout);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 5000) =>
    new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${event}`));
      }, timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

  const emitWithAck = <T>(
    socket: Socket,
    event: string,
    payload: unknown,
    timeoutMs = 5000,
  ) =>
    new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ack on ${event}`));
      }, timeoutMs);
      socket.emit(event, payload, (response: T) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoUri;
    process.env.REDIS_URL = redisUrl;
    process.env.AUTH_JWT_SECRET = jwtSecret;
    process.env.AUTH_JWT_ISSUER = jwtIssuer;
    process.env.INTERNAL_API_SECRET = internalSecret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    wsAdapter = new RedisIoAdapter(app, redisUrl);
    await wsAdapter.connectToRedis();
    app.useWebSocketAdapter(wsAdapter);
    await app.listen(0);

    jwtService = new JwtService({ secret: jwtSecret, signOptions: { issuer: jwtIssuer } });
    connection = app.get<Connection>(getConnectionToken());
    redisClient = app.get(REDIS_CLIENT);
    if (redisClient && 'on' in redisClient) {
      redisClient.on?.('error', () => undefined);
    }

    const address = app.getHttpServer().address();
    if (address && typeof address === 'object') {
      wsPort = address.port;
    }
  });

  beforeEach(async () => {
    await connection.dropDatabase();
    await syncUser(USER_1);
    await syncUser(USER_2);
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
    await connection.close();
  });

  it('connects with valid token and rejects invalid token', async () => {
    const socket = await connectSocket(signToken(USER_1.externalUserId));
    expect(socket.connected).toBe(true);
    socket.disconnect();

    const badSocket = io(`http://localhost:${wsPort}`, {
      auth: { token: 'bad-token' },
      transports: ['websocket'],
      reconnection: false,
    });

    const error = await Promise.race([
      waitForEvent<{ code: string }>(badSocket, 'error'),
      waitForEvent<{ code: string }>(badSocket, 'connect_error'),
    ]);

    expect(error.code).toBe('UNAUTHORIZED');
    badSocket.disconnect();
  });

  it('broadcasts message:new on websocket send and REST send', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket1 = await connectSocket(signToken(USER_1.externalUserId));
    const socket2 = await connectSocket(signToken(USER_2.externalUserId));

    const received = waitForEvent<any>(socket2, 'message:new');

    const ack = await emitWithAck<any>(socket1, 'message:send', {
      conversationId: conversation._id,
      content: 'Hi from WS',
    });

    expect(ack.success).toBe(true);
    const message = await received;
    expect(message.content).toBe('Hi from WS');

    const receivedRest = waitForEvent<any>(socket2, 'message:new');

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Hi from REST' })
      .expect(201);

    const restMessage = await receivedRest;
    expect(restMessage.content).toBe('Hi from REST');

    socket1.disconnect();
    socket2.disconnect();
  });

  it('syncs missed messages after reconnect', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket = await connectSocket(signToken(USER_1.externalUserId));

    const first = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'First' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Second' })
      .expect(201);

    const sync = await emitWithAck<any>(socket, 'messages:sync', {
      conversationId: conversation._id,
      lastMessageId: first.body._id,
    });

    expect(sync.success).toBe(true);
    expect(sync.messages.some((msg: any) => msg._id === second.body._id)).toBe(true);

    socket.disconnect();
  });

  it('handles room:join and room:leave for participants', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket = await connectSocket(signToken(USER_1.externalUserId));

    const joinAck = await emitWithAck<any>(socket, 'room:join', {
      conversationId: conversation._id,
    });
    expect(joinAck.success).toBe(true);

    const leaveAck = await emitWithAck<any>(socket, 'room:leave', {
      conversationId: conversation._id,
    });
    expect(leaveAck.success).toBe(true);

    socket.disconnect();
  });

  it('broadcasts user:online and user:offline', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket1 = await connectSocket(signToken(USER_1.externalUserId));

    const onlineEvent = waitForEvent<any>(socket1, 'user:online');

    const socket2 = await connectSocket(signToken(USER_2.externalUserId));
    const onlinePayload = await onlineEvent;
    expect(onlinePayload.userId).toBe(USER_2.externalUserId);
    expect(onlinePayload.conversationId).toBe(conversation._id);

    const offlineEvent = waitForEvent<any>(socket1, 'user:offline');

    socket2.disconnect();
    const offlinePayload = await offlineEvent;
    expect(offlinePayload.userId).toBe(USER_2.externalUserId);
    expect(offlinePayload.conversationId).toBe(conversation._id);

    socket1.disconnect();
  });

  it('broadcasts message:updated and message:deleted', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket1 = await connectSocket(signToken(USER_1.externalUserId));
    const socket2 = await connectSocket(signToken(USER_2.externalUserId));

    const sendAck = await emitWithAck<any>(socket1, 'message:send', {
      conversationId: conversation._id,
      content: 'Edit me',
    });

    const messageId = sendAck.message?._id;
    expect(messageId).toBeDefined();

    const updatedEvent = waitForEvent<any>(socket2, 'message:updated');

    await emitWithAck<any>(socket1, 'message:edit', { messageId, content: 'Edited' });

    const updatedPayload = await updatedEvent;
    expect(updatedPayload.messageId).toBe(messageId);
    expect(updatedPayload.content).toBe('Edited');

    const deletedEvent = waitForEvent<any>(socket2, 'message:deleted');

    await emitWithAck<any>(socket1, 'message:delete', { messageId });

    const deletedPayload = await deletedEvent;
    expect(deletedPayload.messageId).toBe(messageId);
    expect(deletedPayload.conversationId).toBe(conversation._id);

    socket1.disconnect();
    socket2.disconnect();
  });

  it('rejects room:join for non-participants', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket = await connectSocket(signToken('user-3'));

    socket.emit('room:join', { conversationId: conversation._id });
    const error = await Promise.race([
      waitForEvent<any>(socket, 'error'),
      waitForEvent<any>(socket, 'exception'),
    ]);

    const errorCode = error?.code ?? error?.error?.code;
    const errorMessage = error?.message ?? error?.error?.message;
    expect(errorCode === 'FORBIDDEN' || /forbidden/i.test(errorMessage ?? '')).toBe(true);
    socket.disconnect();
  });

  it('rejects message:send for non-participants', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket = await connectSocket(signToken('user-3'));

    socket.emit('message:send', { conversationId: conversation._id, content: 'Nope' });
    const error = await Promise.race([
      waitForEvent<any>(socket, 'error'),
      waitForEvent<any>(socket, 'exception'),
    ]);

    const errorCode = error?.code ?? error?.error?.code;
    const errorMessage = error?.message ?? error?.error?.message;
    expect(errorCode === 'FORBIDDEN' || /forbidden/i.test(errorMessage ?? '')).toBe(true);
    socket.disconnect();
  });

  it('messages:sync returns empty when no new messages', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const socket = await connectSocket(signToken(USER_1.externalUserId));

    const last = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Only message' })
      .expect(201);

    const sync = await emitWithAck<any>(socket, 'messages:sync', {
      conversationId: conversation._id,
      lastMessageId: last.body._id,
    });

    expect(sync.success).toBe(true);
    expect(sync.messages).toHaveLength(0);

    socket.disconnect();
  });
});
