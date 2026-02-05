import {
  Logger,
  UseFilters,
  UsePipes,
  ValidationPipe,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { ConnectionService } from './services/connection.service';
import { RoomService } from './services/room.service';
import { MessagesService } from '../messages/messages.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReactionsService } from '../reactions/reactions.service';
import { ReadReceiptsService } from '../read-receipts/read-receipts.service';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { AuthenticatedSocket } from './interfaces/authenticated-socket.interface';
import { SocketUserData } from './interfaces/socket-user-data.interface';
import { WsSendMessageDto } from './dto/ws-send-message.dto';
import { WsEditMessageDto } from './dto/ws-edit-message.dto';
import { WsDeleteMessageDto } from './dto/ws-delete-message.dto';
import { WsReactionDto } from './dto/ws-reaction.dto';
import { WsMessageReadDto, WsConversationReadDto } from './dto/ws-message-read.dto';

interface JwtPayload {
  externalUserId?: string;
  sub?: string;
}

@UseFilters(WsExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
const envWsPort = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : undefined;
const wsPort =
  process.env.NODE_ENV === 'test'
    ? undefined
    : Number.isFinite(envWsPort)
      ? envWsPort
      : 3001;

const gatewayOptions = {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  path: '/socket.io',
};

const GatewayDecorator =
  wsPort === undefined ? WebSocketGateway(gatewayOptions) : WebSocketGateway(wsPort, gatewayOptions);

@GatewayDecorator
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly connectionService: ConnectionService,
    private readonly roomService: RoomService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly reactionsService: ReactionsService,
    private readonly readReceiptsService: ReadReceiptsService,
  ) {}

  afterInit(server: Server): void {
    this.roomService.setServer(server);
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(@ConnectedSocket() socket: AuthenticatedSocket): Promise<void> {
    const user = this.authenticateSocket(socket);
    if (!user) {
      socket.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token',
        timestamp: new Date().toISOString(),
      });
      socket.disconnect(true);
      return;
    }

    socket.user = user;
    await this.connectionService.registerConnection(socket.id, user.externalUserId);
    const rooms = await this.roomService.joinUserRooms(socket);

    socket.emit('connected', {
      userId: user.externalUserId,
      socketId: socket.id,
      rooms: rooms.length,
      timestamp: new Date().toISOString(),
    });

    await this.broadcastUserOnline(socket);
    this.logger.log(`WS connected user=${user.externalUserId} socket=${socket.id}`);
  }

  async handleDisconnect(@ConnectedSocket() socket: AuthenticatedSocket): Promise<void> {
    if (!socket.user) {
      return;
    }

    const userId = socket.user.externalUserId;
    await this.connectionService.removeConnection(socket.id, userId);

    if (this.shuttingDown) {
      return;
    }

    const stillOnline = await this.connectionService.isUserOnline(userId);
    if (!stillOnline) {
      await this.broadcastUserOffline(socket);
    }

    this.logger.log(`WS disconnected user=${userId} socket=${socket.id}`);
  }

  @SubscribeMessage('message:send')
  async handleSend(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsSendMessageDto,
  ) {
    const userId = socket.user.externalUserId;

    const isParticipant = await this.conversationsService.isParticipant(dto.conversationId, userId);
    if (!isParticipant) {
      throw new WsException({ code: 'FORBIDDEN', message: 'Not a participant in this conversation' });
    }

    const message = await this.messagesService.send(dto.conversationId, userId, {
      content: dto.content,
      attachments: dto.attachments,
      replyTo: dto.replyTo,
    });

    return { success: true, message };
  }

  @SubscribeMessage('message:edit')
  async handleEdit(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsEditMessageDto,
  ) {
    const userId = socket.user.externalUserId;
    const message = await this.messagesService.edit(dto.messageId, userId, { content: dto.content });

    return { success: true, message };
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsDeleteMessageDto,
  ) {
    const userId = socket.user.externalUserId;
    const message = await this.messagesService.findById(dto.messageId);

    if (!message) {
      throw new WsException({ code: 'NOT_FOUND', message: 'Message not found' });
    }

    await this.messagesService.delete(dto.messageId, userId);

    return { success: true };
  }

  @SubscribeMessage('reaction:add')
  async handleReactionAdd(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsReactionDto,
  ) {
    const userId = socket.user.externalUserId;
    const reactions = await this.reactionsService.addReaction(dto.messageId, userId, dto.emoji);
    return { success: true, reactions };
  }

  @SubscribeMessage('reaction:remove')
  async handleReactionRemove(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsReactionDto,
  ) {
    const userId = socket.user.externalUserId;
    const reactions = await this.reactionsService.removeReaction(dto.messageId, userId, dto.emoji);
    return { success: true, reactions };
  }

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsMessageReadDto,
  ) {
    const userId = socket.user.externalUserId;
    const result = await this.readReceiptsService.markAsRead(dto.messageId, userId);
    return { success: true, readAt: result.readAt };
  }

  @SubscribeMessage('conversation:read')
  async handleConversationRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: WsConversationReadDto,
  ) {
    const userId = socket.user.externalUserId;
    const result = await this.readReceiptsService.markConversationAsRead(
      dto.conversationId,
      userId,
      dto.upToMessageId,
    );
    return { success: true, count: result.markedCount };
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = socket.user.externalUserId;
    const isParticipant = await this.conversationsService.isParticipant(data.conversationId, userId);
    if (!isParticipant) {
      throw new WsException({ code: 'FORBIDDEN', message: 'Not a participant in this conversation' });
    }

    await this.roomService.joinConversationRoom(socket, data.conversationId);
    return { success: true, room: data.conversationId };
  }

  @SubscribeMessage('room:leave')
  async handleLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    await this.roomService.leaveConversationRoom(socket, data.conversationId);
    return { success: true };
  }

  @SubscribeMessage('messages:sync')
  async handleSync(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; lastMessageId: string },
  ) {
    const userId = socket.user.externalUserId;
    const isParticipant = await this.conversationsService.isParticipant(data.conversationId, userId);
    if (!isParticipant) {
      throw new WsException({ code: 'FORBIDDEN', message: 'Not a participant in this conversation' });
    }

    const result = await this.messagesService.findByConversation(
      data.conversationId,
      {
        limit: 50,
        after: data.lastMessageId,
        includeDeleted: false,
      },
      userId,
    );

    return { success: true, messages: result.data };
  }

  @SubscribeMessage('ping')
  handlePing() {
    return { event: 'pong', timestamp: Date.now() };
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.roomService.emitToConversation(conversationId, event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.roomService.emitToUser(userId, event, payload);
  }

  async notifyNewConversation(conversationId: string, participantIds: string[]): Promise<void> {
    const conversation = await this.conversationsService.findById(conversationId);
    if (!conversation) return;

    const socketsByUser = await this.connectionService.getUsersSockets(participantIds);

    for (const participantId of participantIds) {
      const sockets = socketsByUser.get(participantId) ?? [];
      for (const socketId of sockets) {
        const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
        if (!socket) continue;
        await this.roomService.joinConversationRoom(socket, conversationId);
        socket.emit('conversation:new', conversation);
      }
    }
  }

  async notifyUserAdded(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationsService.findById(conversationId);
    if (!conversation) return;

    const sockets = await this.connectionService.getUserSockets(userId);
    for (const socketId of sockets) {
      const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
      if (!socket) continue;
      await this.roomService.joinConversationRoom(socket, conversationId);
      socket.emit('conversation:joined', conversation);
    }

    this.emitToConversation(conversationId, 'participant:added', {
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  async notifyUserRemoved(conversationId: string, userId: string): Promise<void> {
    const sockets = await this.connectionService.getUserSockets(userId);
    for (const socketId of sockets) {
      const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
      if (!socket) continue;
      await this.roomService.leaveConversationRoom(socket, conversationId);
      socket.emit('conversation:removed', { conversationId });
    }

    this.emitToConversation(conversationId, 'participant:removed', {
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  private authenticateSocket(socket: AuthenticatedSocket): SocketUserData | null {
    const token = this.extractToken(socket);
    if (!token) return null;

    try {
      const secret = this.configService.getOrThrow<string>('auth.jwtSecret');
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      const externalUserId = payload.externalUserId ?? payload.sub;
      if (!externalUserId) return null;

      return {
        externalUserId,
        conversationIds: [],
        connectedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  private extractToken(socket: AuthenticatedSocket): string | null {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }

    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken) {
      return queryToken;
    }

    const authHeader = socket.handshake.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  private async broadcastUserOnline(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.user.externalUserId;
    const conversationIds = socket.user.conversationIds;

    await Promise.all(
      conversationIds.map((conversationId) =>
        this.emitToConversation(conversationId, 'user:online', {
          userId,
          conversationId,
          timestamp: new Date().toISOString(),
        }),
      ),
    );
  }

  private async broadcastUserOffline(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.user.externalUserId;
    const conversationIds = socket.user.conversationIds;

    await Promise.all(
      conversationIds.map((conversationId) =>
        this.emitToConversation(conversationId, 'user:offline', {
          userId,
          conversationId,
          timestamp: new Date().toISOString(),
        }),
      ),
    );
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
  }
}
