import { NotFoundException } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessageType } from './schemas/message.schema';

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  _id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: 'hello',
  type: MessageType.Text,
  replyTo: undefined,
  ...overrides,
});

describe('MessagesController', () => {
  const messagesService = {
    send: jest.fn(),
    findByConversation: jest.fn(),
    findById: jest.fn(),
    edit: jest.fn(),
    delete: jest.fn(),
    populateReplyPreview: jest.fn(),
    populateMessageWithSender: jest.fn(),
  };

  const conversationsService = {
    findByIdForUser: jest.fn(),
  };

  let controller: MessagesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MessagesController(messagesService as any, conversationsService as any);
  });

  it('sends message and returns reply preview when replyTo set', async () => {
    const message = makeMessage({ replyTo: 'msg-0' });
    messagesService.send.mockResolvedValue(message);
    messagesService.populateReplyPreview.mockResolvedValue({ ...message, replyToMessage: null });

    const result = await controller.send(
      { externalUserId: 'user-1', claims: {} } as any,
      'conv-1',
      { content: 'Hi', replyTo: 'msg-0' } as any,
    );

    expect(messagesService.send).toHaveBeenCalledWith('conv-1', 'user-1', expect.anything());
    expect(messagesService.populateReplyPreview).toHaveBeenCalled();
    expect(result).toHaveProperty('replyToMessage');
  });

  it('lists messages with membership check', async () => {
    conversationsService.findByIdForUser.mockResolvedValue({});
    messagesService.findByConversation.mockResolvedValue({
      data: [],
      pagination: { hasMore: false },
    });

    const result = await controller.list(
      { externalUserId: 'user-1', claims: {} } as any,
      'conv-1',
      { limit: 10 } as any,
    );

    expect(conversationsService.findByIdForUser).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(result).toHaveProperty('data');
  });

  it('get single message enforces membership and returns reply preview', async () => {
    const message = makeMessage({ conversationId: 'conv-1', replyTo: 'msg-0' });
    messagesService.findById.mockResolvedValue(message);
    messagesService.populateMessageWithSender.mockResolvedValue(message);
    messagesService.populateReplyPreview.mockResolvedValue({ ...message, replyToMessage: null });
    conversationsService.findByIdForUser.mockResolvedValue({});

    const result = await controller.findOne(
      { externalUserId: 'user-1', claims: {} } as any,
      'msg-1',
    );

    expect(conversationsService.findByIdForUser).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(result).toHaveProperty('replyToMessage');
  });

  it('throws when message not found', async () => {
    messagesService.findById.mockResolvedValue(null);

    await expect(
      controller.findOne({ externalUserId: 'user-1', claims: {} } as any, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('edits message via service', async () => {
    const message = makeMessage();
    messagesService.edit.mockResolvedValue(message);

    const result = await controller.edit({ externalUserId: 'user-1', claims: {} } as any, 'msg-1', {
      content: 'new',
    } as any);

    expect(messagesService.edit).toHaveBeenCalledWith('msg-1', 'user-1', expect.anything());
    expect(result).toBe(message);
  });

  it('deletes message via service', async () => {
    messagesService.delete.mockResolvedValue({ deleted: true });

    const result = await controller.remove(
      { externalUserId: 'user-1', claims: {} } as any,
      'msg-1',
    );

    expect(messagesService.delete).toHaveBeenCalledWith('msg-1', 'user-1');
    expect(result).toEqual({ deleted: true });
  });
});
