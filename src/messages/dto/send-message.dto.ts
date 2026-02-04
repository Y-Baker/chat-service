import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
  @IsString()
  @IsNotEmpty()
  externalFileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@ValidatorConstraint({ name: 'contentOrAttachments', async: false })
class ContentOrAttachmentsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as SendMessageDto;
    const hasContent = typeof dto.content === 'string' && dto.content.trim().length > 0;
    const hasAttachments = Array.isArray(dto.attachments) && dto.attachments.length > 0;

    return hasContent || hasAttachments;
  }

  defaultMessage(): string {
    return 'content is required unless attachments are provided';
  }
}

export class SendMessageDto {
  @IsString()
  @MaxLength(5000)
  @Validate(ContentOrAttachmentsConstraint)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsMongoId()
  replyTo?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
