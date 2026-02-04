import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddParticipantDto } from './add-participant.dto';
import { ParticipantRole } from '../schemas/participant.schema';

describe('AddParticipantDto', () => {
  it('defaults role to member', async () => {
    const dto = plainToInstance(AddParticipantDto, {
      externalUserId: 'user-1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.role).toBe(ParticipantRole.Member);
  });

  it('rejects invalid role', async () => {
    const dto = plainToInstance(AddParticipantDto, {
      externalUserId: 'user-1',
      role: 'invalid',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
