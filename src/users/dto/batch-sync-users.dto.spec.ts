import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BatchSyncUsersDto } from './batch-sync-users.dto';

describe('BatchSyncUsersDto', () => {
  it('validates nested users payload', async () => {
    const dto = plainToInstance(BatchSyncUsersDto, {
      users: [
        { externalUserId: 'user-1', displayName: 'User One' },
        { externalUserId: 'user-2', displayName: 'User Two' },
      ],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects when nested user is invalid', async () => {
    const dto = plainToInstance(BatchSyncUsersDto, {
      users: [{ externalUserId: 'user-1', displayName: '' }],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
