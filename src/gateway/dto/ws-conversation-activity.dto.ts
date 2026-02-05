import { IsMongoId } from 'class-validator';

export class WsConversationActivityDto {
  @IsMongoId()
  conversationId!: string;
}
