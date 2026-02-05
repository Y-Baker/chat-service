import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationsService } from '../conversations/conversations.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { Message, MessageDocument, Reaction } from '../messages/schemas/message.schema';

@Injectable()
export class ReactionsService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway?: ChatGateway,
  ) {}

  async addReaction(messageId: string, userId: string, emoji: string): Promise<Reaction[]> {
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

    const reaction = message.reactions.find((item) => item.emoji === emoji);
    if (reaction) {
      if (!reaction.userIds.includes(userId)) {
        reaction.userIds.push(userId);
      }
    } else {
      message.reactions.push({ emoji, userIds: [userId] } as Reaction);
    }

    await message.save();

    const updatedReaction = message.reactions.find((item) => item.emoji === emoji);
    const totalCount = updatedReaction?.userIds.length ?? 0;

    this.chatGateway?.emitToConversation(message.conversationId.toString(), 'reaction:added', {
      messageId: message._id.toString(),
      conversationId: message.conversationId.toString(),
      emoji,
      userId,
      totalCount,
      timestamp: new Date().toISOString(),
    });

    return message.reactions;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<Reaction[]> {
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

    const reaction = message.reactions.find((item) => item.emoji === emoji);
    if (!reaction) {
      return message.reactions;
    }

    reaction.userIds = reaction.userIds.filter((id) => id !== userId);
    if (reaction.userIds.length === 0) {
      message.reactions = message.reactions.filter((item) => item.emoji !== emoji);
    }

    await message.save();

    const updatedReaction = message.reactions.find((item) => item.emoji === emoji);
    const totalCount = updatedReaction?.userIds.length ?? 0;

    this.chatGateway?.emitToConversation(message.conversationId.toString(), 'reaction:removed', {
      messageId: message._id.toString(),
      conversationId: message.conversationId.toString(),
      emoji,
      userId,
      totalCount,
      timestamp: new Date().toISOString(),
    });

    return message.reactions;
  }

  async getReactions(messageId: string, userId: string): Promise<Reaction[]> {
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

    return message.reactions ?? [];
  }
}
