import { BadRequestException } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationType } from './schemas/conversation.schema';
import { ParticipantRole } from './schemas/participant.schema';

const makeConversation = (type: ConversationType) => ({
  _id: 'conv-1',
  type,
  participants: [
    { externalUserId: 'user-1', role: ParticipantRole.Admin, joinedAt: new Date() },
    { externalUserId: 'user-2', role: ParticipantRole.Member, joinedAt: new Date() },
  ],
  participantIds: ['user-1', 'user-2'],
  toObject() {
    return { ...this };
  },
});

describe('ConversationsController', () => {
  const conversationsService = {
    create: jest.fn(),
    findAllForUser: jest.fn(),
    findByIdForUser: jest.fn(),
    delete: jest.fn(),
    leave: jest.fn(),
    addParticipant: jest.fn(),
    updateParticipantRole: jest.fn(),
    removeParticipant: jest.fn(),
  };

  const usersService = {
    findManyByExternalIds: jest.fn(),
  };

  let controller: ConversationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ConversationsController(conversationsService as any, usersService as any);
  });

  it('creates conversation using current user', async () => {
    const conversation = makeConversation(ConversationType.Direct);
    conversationsService.create.mockResolvedValue(conversation);
    usersService.findManyByExternalIds.mockResolvedValue([
      { externalUserId: 'user-1', displayName: 'User 1', avatarUrl: 'a' },
      { externalUserId: 'user-2', displayName: 'User 2', avatarUrl: 'b' },
    ]);

    const result = await controller.create(
      { externalUserId: 'user-1', claims: {} } as any,
      { type: ConversationType.Direct, participantIds: ['user-1', 'user-2'] } as any,
    );

    expect(conversationsService.create).toHaveBeenCalledWith('user-1', expect.anything());
    expect(result.participants[0].profile).toEqual({ displayName: 'User 1', avatarUrl: 'a' });
  });

  it('lists conversations with pagination and profiles', async () => {
    const conversation = makeConversation(ConversationType.Group);
    conversationsService.findAllForUser.mockResolvedValue({
      data: [conversation],
      pagination: { hasMore: false, nextCursor: null },
    });
    usersService.findManyByExternalIds.mockResolvedValue([
      { externalUserId: 'user-1', displayName: 'User 1', avatarUrl: 'a' },
      { externalUserId: 'user-2', displayName: 'User 2', avatarUrl: 'b' },
    ]);

    const result = await controller.list(
      { externalUserId: 'user-1', claims: {} } as any,
      {
        limit: 10,
      } as any,
    );

    expect(result.pagination.hasMore).toBe(false);
    expect(result.data[0].participants[1].profile).toEqual({
      displayName: 'User 2',
      avatarUrl: 'b',
    });
  });

  it('defaults delete mode to leave for group', async () => {
    const conversation = makeConversation(ConversationType.Group);
    conversationsService.findByIdForUser.mockResolvedValue(conversation);

    await controller.remove({ externalUserId: 'user-1', claims: {} } as any, 'conv-1');

    expect(conversationsService.leave).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(conversationsService.delete).not.toHaveBeenCalled();
  });

  it('defaults delete mode to delete for direct', async () => {
    const conversation = makeConversation(ConversationType.Direct);
    conversationsService.findByIdForUser.mockResolvedValue(conversation);

    await controller.remove({ externalUserId: 'user-1', claims: {} } as any, 'conv-1');

    expect(conversationsService.delete).toHaveBeenCalledWith('conv-1', 'user-1');
  });

  it('blocks leave mode for direct conversations', async () => {
    const conversation = makeConversation(ConversationType.Direct);
    conversationsService.findByIdForUser.mockResolvedValue(conversation);

    await expect(
      controller.remove({ externalUserId: 'user-1', claims: {} } as any, 'conv-1', 'leave'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
