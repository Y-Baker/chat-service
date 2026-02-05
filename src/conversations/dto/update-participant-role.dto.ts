import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ParticipantRole } from '../schemas/participant.schema';

export class UpdateParticipantRoleDto {
  @ApiProperty({ enum: ParticipantRole })
  @IsEnum(ParticipantRole)
  role!: ParticipantRole;
}
