import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WsReactionDto {
  @IsMongoId()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji!: string;
}
