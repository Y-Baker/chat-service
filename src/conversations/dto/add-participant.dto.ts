import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ParticipantRole } from '../schemas/participant.schema';

export class AddParticipantDto {
  @IsString()
  @IsNotEmpty()
  externalUserId!: string;

  @IsOptional()
  @IsEnum(ParticipantRole)
  role: ParticipantRole = ParticipantRole.Member;
}
