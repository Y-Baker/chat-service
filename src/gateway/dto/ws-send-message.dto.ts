import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class WsAttachmentDto {
  @IsString()
  @IsNotEmpty()
  externalFileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}

export class WsSendMessageDto {
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => WsAttachmentDto)
  attachments?: WsAttachmentDto[];

  @IsOptional()
  @IsMongoId()
  replyTo?: string;
}
