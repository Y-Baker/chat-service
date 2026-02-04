import { IsEnum } from 'class-validator';
import { ParticipantRole } from '../schemas/participant.schema';

export class UpdateParticipantRoleDto {
  @IsEnum(ParticipantRole)
  role!: ParticipantRole;
}
