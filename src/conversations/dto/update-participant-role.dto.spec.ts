import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateParticipantRoleDto } from './update-participant-role.dto';

describe('UpdateParticipantRoleDto', () => {
  it('rejects invalid role', async () => {
    const dto = plainToInstance(UpdateParticipantRoleDto, {
      role: 'invalid',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
