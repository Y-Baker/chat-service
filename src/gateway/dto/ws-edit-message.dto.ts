import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WsEditMessageDto {
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
