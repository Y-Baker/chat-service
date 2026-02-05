import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationsService } from '../conversations/conversations.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { UsersService } from '../users/users.service';
import { Message, MessageDocument, ReadReceipt } from '../messages/schemas/message.schema';

@Injectable()
export class ReadReceiptsService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway?: ChatGateway,
  ) {}

  async markAsRead(messageId: string, userId: string): Promise<{ readAt: Date | null }> {
    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isParticipant = await this.conversationsService.isParticipant(
      message.conversationId.toString(),
      userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    if (message.senderId === userId) {
      return { readAt: null };
    }

    const existing = message.readBy.find((entry) => entry.userId === userId);
    if (existing) {
      return { readAt: existing.readAt };
    }

    const readAt = new Date();
    message.readBy.push({ userId, readAt } as ReadReceipt);
    await message.save();

    this.chatGateway?.emitToConversation(message.conversationId.toString(), 'message:read', {
      messageId: message._id.toString(),
      conversationId: message.conversationId.toString(),
      userId,
      readAt: readAt.toISOString(),
    });

    return { readAt };
  }

  async markConversationAsRead(
    conversationId: string,
    userId: string,
    upToMessageId?: string,
  ): Promise<{ markedCount: number }>
  {
    const isParticipant = await this.conversationsService.isParticipant(conversationId, userId);
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const query: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId },
      isDeleted: false,
    };

    if (upToMessageId) {
      query._id = { $lte: new Types.ObjectId(upToMessageId) };
    }

    const readAt = new Date();
    const result = await this.messageModel.updateMany(query, {
      $push: { readBy: { userId, readAt } },
    });

    const markedCount = result.modifiedCount ?? 0;

    this.chatGateway?.emitToConversation(conversationId, 'conversation:read', {
      conversationId,
      userId,
      upToMessageId,
      count: markedCount,
      readAt: readAt.toISOString(),
    });

    return { markedCount };
  }

  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    return this.messageModel.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId },
      isDeleted: false,
    });
  }

  async getUnreadCounts(conversationIds: string[], userId: string): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const results = await this.messageModel.aggregate([
      {
        $match: {
          conversationId: { $in: conversationIds.map((id) => new Types.ObjectId(id)) },
          senderId: { $ne: userId },
          'readBy.userId': { $ne: userId },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 },
        },
      },
    ]);

    const map = new Map<string, number>();
    results.forEach((item) => {
      map.set(item._id.toString(), item.count as number);
    });

    return map;
  }

  async getReadReceipts(messageId: string, userId: string) {
    const message = await this.messageModel.findById(messageId).lean();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isParticipant = await this.conversationsService.isParticipant(
      message.conversationId.toString(),
      userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }

    const readerIds = (message.readBy ?? []).map((entry) => entry.userId);
    const profiles = await this.usersService.findManyByExternalIds(readerIds);
    const profileMap = new Map(profiles.map((profile) => [profile.externalUserId, profile]));

    const readBy = (message.readBy ?? []).map((entry) => {
      const profile = profileMap.get(entry.userId);
      return {
        userId: entry.userId,
        readAt: entry.readAt,
        user: profile
          ? {
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
            }
          : null,
      };
    });

    const totalParticipants = await this.conversationsService.getParticipantCount(
      message.conversationId.toString(),
    );

    return {
      readBy,
      totalParticipants,
      readCount: readBy.length,
      unreadCount: Math.max(totalParticipants - 1 - readBy.length, 0),
    };
  }
}
