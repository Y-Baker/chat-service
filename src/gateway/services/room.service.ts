import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { ConversationsService } from '../../conversations/conversations.service';
import { AuthenticatedSocket } from '../interfaces/authenticated-socket.interface';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private server?: Server;

  constructor(private readonly conversationsService: ConversationsService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async joinUserRooms(socket: AuthenticatedSocket): Promise<string[]> {
    const userId = socket.user.externalUserId;
    const conversationIds = await this.conversationsService.findAllIdsForUser(userId);

    const conversationRooms = conversationIds.map((id) => this.getConversationRoom(id));
    const userRoom = this.getUserRoom(userId);

    const roomsToJoin = [...conversationRooms, userRoom];

    if (roomsToJoin.length > 0) {
      await socket.join(roomsToJoin);
    }

    socket.user.conversationIds = conversationIds;
    this.logger.debug(`Joined ${roomsToJoin.length} rooms for ${userId}`);

    return roomsToJoin;
  }

  async joinConversationRoom(socket: AuthenticatedSocket, conversationId: string): Promise<void> {
    const room = this.getConversationRoom(conversationId);
    await socket.join(room);

    if (!socket.user.conversationIds.includes(conversationId)) {
      socket.user.conversationIds.push(conversationId);
    }
  }

  async leaveConversationRoom(socket: AuthenticatedSocket, conversationId: string): Promise<void> {
    const room = this.getConversationRoom(conversationId);
    await socket.leave(room);
    socket.user.conversationIds = socket.user.conversationIds.filter((id) => id !== conversationId);
  }

  getConversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(this.getConversationRoom(conversationId)).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(this.getUserRoom(userId)).emit(event, payload);
  }
}
