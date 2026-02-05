import { RoomService } from './room.service';

const createSocket = () => ({
  join: jest.fn().mockResolvedValue(undefined),
  leave: jest.fn().mockResolvedValue(undefined),
  user: {
    externalUserId: 'user-1',
    conversationIds: [],
    connectedAt: new Date(),
  },
});

describe('RoomService', () => {
  it('joins user rooms and tracks conversation ids', async () => {
    const conversationsService = {
      findAllIdsForUser: jest.fn().mockResolvedValue(['conv-1', 'conv-2']),
    };

    const service = new RoomService(conversationsService as any);
    const socket = createSocket();

    const rooms = await service.joinUserRooms(socket as any);

    expect(rooms).toEqual(['conversation:conv-1', 'conversation:conv-2', 'user:user-1']);
    expect(socket.join).toHaveBeenCalledWith(rooms);
    expect(socket.user.conversationIds).toEqual(['conv-1', 'conv-2']);
  });

  it('joins and leaves a conversation room', async () => {
    const service = new RoomService({} as any);
    const socket = createSocket();

    await service.joinConversationRoom(socket as any, 'conv-1');
    expect(socket.join).toHaveBeenCalledWith('conversation:conv-1');
    expect(socket.user.conversationIds).toContain('conv-1');

    await service.leaveConversationRoom(socket as any, 'conv-1');
    expect(socket.leave).toHaveBeenCalledWith('conversation:conv-1');
    expect(socket.user.conversationIds).not.toContain('conv-1');
  });
});
