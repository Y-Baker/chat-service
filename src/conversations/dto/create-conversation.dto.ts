import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ConversationType } from '../schemas/conversation.schema';

@ValidatorConstraint({ name: 'participantCount', async: false })
class ParticipantCountConstraint implements ValidatorConstraintInterface {
  validate(value: string[] | undefined, args: ValidationArguments): boolean {
    const dto = args.object as CreateConversationDto;
    if (!Array.isArray(value)) {
      return false;
    }

    if (dto.type === ConversationType.Direct) {
      return value.length === 2;
    }

    if (dto.type === ConversationType.Group) {
      return value.length >= 2;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateConversationDto;
    if (dto.type === ConversationType.Direct) {
      return 'participantIds must include exactly 2 users for direct conversations';
    }
    return 'participantIds must include at least 2 users';
  }
}

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType, example: ConversationType.Direct })
  @IsEnum(ConversationType)
  type!: ConversationType;

  @ApiPropertyOptional({ example: 'Team Chat', maxLength: 100 })
  @ValidateIf((dto) => dto.type === ConversationType.Group)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: ['user_1', 'user_2'] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Validate(ParticipantCountConstraint)
  participantIds!: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
