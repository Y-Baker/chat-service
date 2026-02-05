import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { MarkConversationReadDto } from './dto/mark-conversation-read.dto';
import { ReadReceiptsService } from './read-receipts.service';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class ReadReceiptsController {
  constructor(private readonly readReceiptsService: ReadReceiptsService) {}

  @Put('messages/:messageId/read')
  async markMessageRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.readReceiptsService.markAsRead(messageId, user.externalUserId);
    return { success: true, readAt: result.readAt };
  }

  @Put('conversations/:conversationId/read')
  async markConversationRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: MarkConversationReadDto,
  ) {
    const result = await this.readReceiptsService.markConversationAsRead(
      conversationId,
      user.externalUserId,
      dto.upToMessageId,
    );
    return { success: true, markedCount: result.markedCount };
  }

  @Get('messages/:messageId/read')
  async getReadReceipts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ) {
    return this.readReceiptsService.getReadReceipts(messageId, user.externalUserId);
  }

  @Get('conversations/:conversationId/unread-count')
  async getUnreadCount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    const unreadCount = await this.readReceiptsService.getUnreadCount(conversationId, user.externalUserId);
    return { conversationId, unreadCount };
  }
}
