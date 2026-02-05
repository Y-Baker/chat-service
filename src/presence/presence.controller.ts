import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ConversationsService } from '../conversations/conversations.service';
import { GetBatchPresenceDto } from './dto/get-batch-presence.dto';
import { PresenceService } from './presence.service';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Get('users/:userId/presence')
  async getPresence(@Param('userId') userId: string) {
    return this.presenceService.getPresenceStatus(userId);
  }

  @Get('conversations/:conversationId/presence')
  async getConversationPresence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    const conversation = await this.conversationsService.findByIdForUser(
      conversationId,
      user.externalUserId,
    );

    const participantIds = conversation.participants.map((p) => p.externalUserId);
    return this.presenceService.getConversationPresence(conversationId, participantIds);
  }

  @Post('presence/batch')
  async getBatchPresence(@Body() dto: GetBatchPresenceDto) {
    const presences = await this.presenceService.getPresenceStatuses(dto.userIds);
    return { presences };
  }
}
