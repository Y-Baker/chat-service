import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class MarkConversationReadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  upToMessageId?: string;
}
