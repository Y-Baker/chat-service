import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateConversationDto } from './create-conversation.dto';
import { ConversationType } from '../schemas/conversation.schema';

describe('CreateConversationDto', () => {
  it('allows direct with exactly two participants', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      type: ConversationType.Direct,
      participantIds: ['user-1', 'user-2'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects direct with more than two participants', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      type: ConversationType.Direct,
      participantIds: ['user-1', 'user-2', 'user-3'],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows group with name and participants', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      type: ConversationType.Group,
      name: 'Project Team',
      participantIds: ['user-1', 'user-2', 'user-3'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects group without name', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      type: ConversationType.Group,
      participantIds: ['user-1', 'user-2'],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate participantIds', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      type: ConversationType.Group,
      name: 'Team',
      participantIds: ['user-1', 'user-1'],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
