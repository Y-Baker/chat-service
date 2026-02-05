import { IsMongoId, IsOptional } from 'class-validator';

export class WsMessageReadDto {
  @IsMongoId()
  messageId!: string;
}

export class WsConversationReadDto {
  @IsMongoId()
  conversationId!: string;

  @IsOptional()
  @IsMongoId()
  upToMessageId?: string;
}
