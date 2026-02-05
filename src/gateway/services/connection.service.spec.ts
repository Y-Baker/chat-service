import { ConnectionService } from './connection.service';

const createRedisMock = () => {
  const pipeline = {
    sadd: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    srem: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  return {
    pipeline: jest.fn().mockReturnValue(pipeline),
    scard: jest.fn().mockResolvedValue(0),
    sismember: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue(['socket-1']),
    quit: jest.fn().mockResolvedValue(undefined),
    __pipeline: pipeline,
  };
};

describe('ConnectionService', () => {
  it('registers and removes connections', async () => {
    const redis = createRedisMock();
    const service = new ConnectionService(redis as any);

    await service.registerConnection('socket-1', 'user-1');

    expect(redis.pipeline).toHaveBeenCalled();
    expect(redis.__pipeline.sadd).toHaveBeenCalledWith('ws:connections:user-1', 'socket-1');
    expect(redis.__pipeline.hset).toHaveBeenCalled();
    expect(redis.__pipeline.exec).toHaveBeenCalled();

    await service.removeConnection('socket-1', 'user-1');
    expect(redis.__pipeline.srem).toHaveBeenCalledWith('ws:connections:user-1', 'socket-1');
    expect(redis.__pipeline.del).toHaveBeenCalledWith('ws:socket:socket-1');
  });

  it('returns online users', async () => {
    const redis = createRedisMock();
    const pipeline = {
      sismember: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 1],
        [null, 0],
      ]),
    };
    redis.pipeline.mockReturnValue(pipeline);

    const service = new ConnectionService(redis as any);
    const result = await service.getOnlineUsers(['user-1', 'user-2']);

    expect(result).toEqual(['user-1']);
  });
});
