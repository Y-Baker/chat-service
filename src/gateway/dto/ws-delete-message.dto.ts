import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class WsDeleteMessageDto {
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  messageId!: string;
}
