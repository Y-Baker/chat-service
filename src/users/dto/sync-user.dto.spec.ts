import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SyncUserDto } from './sync-user.dto';

describe('SyncUserDto', () => {
  it('validates a correct payload', async () => {
    const dto = plainToInstance(SyncUserDto, {
      externalUserId: 'user-1',
      displayName: 'User One',
      avatarUrl: 'https://example.com/avatar.png',
      metadata: { role: 'admin' },
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing required fields', async () => {
    const dto = plainToInstance(SyncUserDto, { displayName: '' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid avatarUrl', async () => {
    const dto = plainToInstance(SyncUserDto, {
      externalUserId: 'user-1',
      displayName: 'User One',
      avatarUrl: 'not-a-url',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
