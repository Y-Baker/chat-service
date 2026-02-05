import { IsMongoId, IsOptional } from 'class-validator';

export class MarkConversationReadDto {
  @IsOptional()
  @IsMongoId()
  upToMessageId?: string;
}
