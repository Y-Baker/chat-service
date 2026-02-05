import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ParticipantRole } from '../schemas/participant.schema';

export class AddParticipantDto {
  @ApiProperty({ example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  externalUserId!: string;

  @ApiPropertyOptional({ enum: ParticipantRole, default: ParticipantRole.Member })
  @IsOptional()
  @IsEnum(ParticipantRole)
  role: ParticipantRole = ParticipantRole.Member;
}
