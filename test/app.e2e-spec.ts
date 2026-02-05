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
const USER_3 = { externalUserId: 'user-3', displayName: 'User Three' };

describe('Messages flow (e2e)', () => {
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
  let wsPort = 0;

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

  const getConversation = async (userId: string, conversationId: string) =>
    request(app.getHttpServer())
      .get(`/api/conversations/${conversationId}`)
      .set(authHeader(userId))
      .expect(200);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoUri;
    process.env.REDIS_URL = redisUrl;
    process.env.AUTH_JWT_SECRET = jwtSecret;
    process.env.AUTH_JWT_ISSUER = jwtIssuer;
    process.env.INTERNAL_API_SECRET = internalSecret;
    process.env.WS_PORT = wsPort.toString();
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
      (redisClient as any).on('error', () => undefined);
    }

    const httpServer = app.getHttpServer();
    const address = httpServer.address();
    if (address && typeof address === 'object') {
      wsPort = address.port;
    }
  });

  beforeEach(async () => {
    await connection.dropDatabase();
    await syncUser(USER_1);
    await syncUser(USER_2);
    await syncUser(USER_3);
  });

  it('sends, replies, edits, deletes, and fetches messages', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const sendResponse = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Hello world' })
      .expect(201);

    const messageId = sendResponse.body._id;

    const replyResponse = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_2.externalUserId))
      .send({ content: 'Reply', replyTo: messageId })
      .expect(201);

    expect(replyResponse.body.replyToMessage).toBeDefined();

    const getMessage = await request(app.getHttpServer())
      .get(`/api/messages/${replyResponse.body._id}`)
      .set(authHeader(USER_2.externalUserId))
      .expect(200);

    expect(getMessage.body.replyToMessage).toBeDefined();

    const history = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}/messages?limit=10`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(history.body.data.length).toBeGreaterThanOrEqual(2);

    const edited = await request(app.getHttpServer())
      .patch(`/api/messages/${messageId}`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Hello world (edited)' })
      .expect(200);

    expect(edited.body.isEdited).toBe(true);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/messages/${messageId}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(deleted.body.deleted).toBe(true);
  });

  it('blocks non-senders and non-participants', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const sendResponse = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'Hello world' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/messages/${sendResponse.body._id}`)
      .set(authHeader(USER_2.externalUserId))
      .send({ content: 'Nope' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_3.externalUserId))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/messages/${sendResponse.body._id}`)
      .set(authHeader(USER_3.externalUserId))
      .expect(403);
  });

  it('paginates with before and after', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const message1 = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'm1' })
      .expect(201);

    const message2 = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'm2' })
      .expect(201);

    const message3 = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'm3' })
      .expect(201);

    const latestPage = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}/messages?limit=2`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(latestPage.body.pagination.hasMore).toBe(true);
    expect(latestPage.body.data[0].content).toBe('m3');

    const beforePage = await request(app.getHttpServer())
      .get(
        `/api/conversations/${conversation._id}/messages?limit=2&before=${latestPage.body.pagination.oldestId}`,
      )
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(beforePage.body.data[0].content).toBe('m1');

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'm4' })
      .expect(201);

    const afterPage = await request(app.getHttpServer())
      .get(
        `/api/conversations/${conversation._id}/messages?limit=2&after=${latestPage.body.pagination.newestId}`,
      )
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(afterPage.body.data[0].content).toBe('m4');
    expect(afterPage.body.data[afterPage.body.data.length - 1].content).toBe('m4');
  });

  it('promotes oldest member when admin leaves group', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/participants`)
      .set(authHeader(USER_1.externalUserId))
      .send({ externalUserId: USER_3.externalUserId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_2.externalUserId))
      .expect(200);

    const user2 = refreshed.body.participants.find(
      (participant: { externalUserId: string }) => participant.externalUserId === USER_2.externalUserId,
    );
    const user3 = refreshed.body.participants.find(
      (participant: { externalUserId: string }) => participant.externalUserId === USER_3.externalUserId,
    );

    expect(user2.role).toBe('admin');
    expect(user3.role).toBe('member');
    expect(
      refreshed.body.participants.find(
        (participant: { externalUserId: string }) =>
          participant.externalUserId === USER_1.externalUserId,
      ),
    ).toBeUndefined();
  });

  it('enforces admin-only delete for group conversations', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}?mode=delete`)
      .set(authHeader(USER_2.externalUserId))
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}?mode=delete`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(404);
  });

  it('blocks non-admin from adding or removing participants', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/participants`)
      .set(authHeader(USER_2.externalUserId))
      .send({ externalUserId: USER_3.externalUserId })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}/participants/${USER_1.externalUserId}`)
      .set(authHeader(USER_2.externalUserId))
      .expect(403);
  });

  it('blocks add/remove/leave for direct conversations', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/participants`)
      .set(authHeader(USER_1.externalUserId))
      .send({ externalUserId: USER_3.externalUserId })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}/participants/${USER_2.externalUserId}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}?mode=leave`)
      .set(authHeader(USER_1.externalUserId))
      .expect(400);
  });

  it('promotes oldest member when last admin is removed', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
      USER_3.externalUserId,
    ]);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}/participants/${USER_1.externalUserId}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_2.externalUserId))
      .expect(200);

    const user2 = refreshed.body.participants.find(
      (participant: { externalUserId: string }) => participant.externalUserId === USER_2.externalUserId,
    );
    const user3 = refreshed.body.participants.find(
      (participant: { externalUserId: string }) => participant.externalUserId === USER_3.externalUserId,
    );

    expect(user2.role).toBe('admin');
    expect(user3.role).toBe('member');
  });

  it('allows either participant to delete a direct conversation', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_2.externalUserId))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(404);
  });

  it('returns 404 when removing non-existent participant', async () => {
    const conversation = await createGroupConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    await request(app.getHttpServer())
      .delete(`/api/conversations/${conversation._id}/participants/${USER_3.externalUserId}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(404);
  });

  it('updates lastMessage on send/edit/delete', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const message1 = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'first message' })
      .expect(201);

    const afterFirst = await getConversation(USER_1.externalUserId, conversation._id);
    expect(afterFirst.body.lastMessage.messageId).toBe(message1.body._id);

    const message2 = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'second message' })
      .expect(201);

    const afterSecond = await getConversation(USER_1.externalUserId, conversation._id);
    expect(afterSecond.body.lastMessage.messageId).toBe(message2.body._id);

    await request(app.getHttpServer())
      .patch(`/api/messages/${message2.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'second message edited' })
      .expect(200);

    const afterEdit = await getConversation(USER_1.externalUserId, conversation._id);
    expect(afterEdit.body.lastMessage.content).toBe('second message edited');

    await request(app.getHttpServer())
      .delete(`/api/messages/${message2.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const afterDelete = await getConversation(USER_1.externalUserId, conversation._id);
    expect(afterDelete.body.lastMessage.messageId).toBe(message1.body._id);

    await request(app.getHttpServer())
      .delete(`/api/messages/${message1.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const afterDeleteAll = await getConversation(USER_1.externalUserId, conversation._id);
    expect(afterDeleteAll.body.lastMessage).toBeUndefined();
  });

  it('includes deleted messages only when includeDeleted=true', async () => {
    const conversation = await createConversation(USER_1.externalUserId, [
      USER_1.externalUserId,
      USER_2.externalUserId,
    ]);

    const message = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation._id}/messages`)
      .set(authHeader(USER_1.externalUserId))
      .send({ content: 'to be deleted' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/messages/${message.body._id}`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    const withoutDeleted = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}/messages?limit=10`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(withoutDeleted.body.data).toHaveLength(0);

    const withDeleted = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation._id}/messages?limit=10&includeDeleted=true`)
      .set(authHeader(USER_1.externalUserId))
      .expect(200);

    expect(withDeleted.body.data).toHaveLength(1);
    expect(withDeleted.body.data[0].isDeleted).toBe(true);
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

    const error = await new Promise<{ code: string }>((resolve) => {
      badSocket.on('error', (payload) => resolve(payload));
    });

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

    const received = new Promise<any>((resolve) => {
      socket2.once('message:new', (message) => resolve(message));
    });

    const ack = await new Promise<any>((resolve) => {
      socket1.emit(
        'message:send',
        { conversationId: conversation._id, content: 'Hi from WS' },
        (response: any) => resolve(response),
      );
    });

    expect(ack.success).toBe(true);
    const message = await received;
    expect(message.content).toBe('Hi from WS');

    const receivedRest = new Promise<any>((resolve) => {
      socket2.once('message:new', (payload) => resolve(payload));
    });

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

    const sync = await new Promise<any>((resolve) => {
      socket.emit(
        'messages:sync',
        { conversationId: conversation._id, lastMessageId: first.body._id },
        (response: any) => resolve(response),
      );
    });

    expect(sync.success).toBe(true);
    expect(sync.messages.some((msg: any) => msg._id === second.body._id)).toBe(true);

    socket.disconnect();
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
});
