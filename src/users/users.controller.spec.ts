import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const serviceMock = {
    sync: jest.fn(),
    syncBatch: jest.fn(),
    findByExternalId: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = serviceMock as unknown as UsersService;
    controller = new UsersController(service);
  });

  it('delegates sync to service', async () => {
    serviceMock.sync.mockResolvedValue({ externalUserId: 'user-1' });

    const result = await controller.sync({
      externalUserId: 'user-1',
      displayName: 'User One',
    });

    expect(serviceMock.sync).toHaveBeenCalled();
    expect(result).toEqual({ externalUserId: 'user-1' });
  });

  it('delegates syncBatch to service', async () => {
    serviceMock.syncBatch.mockResolvedValue([{ externalUserId: 'user-1' }]);

    const result = await controller.syncBatch({
      users: [{ externalUserId: 'user-1', displayName: 'User One' }],
    });

    expect(serviceMock.syncBatch).toHaveBeenCalled();
    expect(result).toEqual([{ externalUserId: 'user-1' }]);
  });

  it('delegates getByExternalId to service', async () => {
    serviceMock.findByExternalId.mockResolvedValue({ externalUserId: 'user-1' });

    const result = await controller.getByExternalId('user-1');

    expect(serviceMock.findByExternalId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ externalUserId: 'user-1' });
  });

  it('delegates remove to service', async () => {
    serviceMock.remove.mockResolvedValue({ externalUserId: 'user-1', isActive: false });

    const result = await controller.remove('user-1');

    expect(serviceMock.remove).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ externalUserId: 'user-1', isActive: false });
  });
});
