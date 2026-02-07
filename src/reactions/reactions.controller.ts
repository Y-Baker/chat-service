import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AddReactionDto } from './dto/add-reaction.dto';
import { ReactionsService } from './reactions.service';

@ApiTags('reactions')
@ApiBearerAuth()
@Controller('api/messages')
@UseGuards(JwtAuthGuard)
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionsService) {}

  @Post(':messageId/reactions')
  @ApiOperation({ summary: 'Add a reaction to a message' })
  async addReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Body() dto: AddReactionDto,
  ) {
    const reactions = await this.reactionsService.addReaction(
      messageId,
      user.externalUserId,
      dto.emoji,
    );
    return { success: true, reactions };
  }

  @Delete(':messageId/reactions/:emoji')
  @ApiOperation({ summary: 'Remove a reaction from a message' })
  async removeReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    const reactions = await this.reactionsService.removeReaction(
      messageId,
      user.externalUserId,
      emoji,
    );
    return { success: true, reactions };
  }

  @Get(':messageId/reactions')
  @ApiOperation({ summary: 'List reactions for a message' })
  async getReactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ) {
    const reactions = await this.reactionsService.getReactions(messageId, user.externalUserId);
    return { reactions };
  }
}
