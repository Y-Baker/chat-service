import { UsersService } from './users.service';
import { UserProfile } from './schemas/user-profile.schema';

describe('UsersService', () => {
  const createModelMock = () => ({
    findOneAndUpdate: jest.fn(),
    bulkWrite: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sync upserts a user and updates syncedAt', async () => {
    const model = createModelMock();
    const mockUser = { externalUserId: 'user-1' } as UserProfile;

    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockUser),
    });

    const service = new UsersService(model as never);

    const result = await service.sync({
      externalUserId: 'user-1',
      displayName: 'User One',
      avatarUrl: 'https://example.com/avatar.png',
      metadata: { role: 'admin' },
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { externalUserId: 'user-1' },
      {
        $set: {
          displayName: 'User One',
          avatarUrl: 'https://example.com/avatar.png',
          metadata: { role: 'admin' },
          isActive: true,
          syncedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      },
      { new: true, upsert: true },
    );

    expect(result).toBe(mockUser);
  });

  it('syncBatch upserts multiple users and returns results', async () => {
    const model = createModelMock();
    const mockUsers = [{ externalUserId: 'user-1' }, { externalUserId: 'user-2' }] as UserProfile[];

    model.bulkWrite.mockResolvedValue({});
    model.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockUsers),
    });

    const service = new UsersService(model as never);

    const result = await service.syncBatch({
      users: [
        { externalUserId: 'user-1', displayName: 'User One' },
        { externalUserId: 'user-2', displayName: 'User Two' },
      ],
    });

    expect(model.bulkWrite).toHaveBeenCalled();
    expect(model.find).toHaveBeenCalledWith({ externalUserId: { $in: ['user-1', 'user-2'] } });
    expect(result).toBe(mockUsers);
  });

  it('findByExternalId filters inactive users', async () => {
    const model = createModelMock();
    const mockUser = { externalUserId: 'user-1' } as UserProfile;

    model.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockUser),
    });

    const service = new UsersService(model as never);

    const result = await service.findByExternalId('user-1');

    expect(model.findOne).toHaveBeenCalledWith({ externalUserId: 'user-1', isActive: true });
    expect(result).toBe(mockUser);
  });

  it('remove performs a soft delete', async () => {
    const model = createModelMock();
    const mockUser = { externalUserId: 'user-1', isActive: false } as UserProfile;

    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockUser),
    });

    const service = new UsersService(model as never);

    const result = await service.remove('user-1');

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { externalUserId: 'user-1' },
      { $set: { isActive: false } },
      { new: true },
    );
    expect(result).toBe(mockUser);
  });

  it('hardRemove deletes a user permanently', async () => {
    const model = createModelMock();

    model.deleteOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    const service = new UsersService(model as never);

    await service.hardRemove('user-1');

    expect(model.deleteOne).toHaveBeenCalledWith({ externalUserId: 'user-1' });
  });
});
