import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from './send-message.dto';

describe('SendMessageDto', () => {
  it('allows content with no attachments', async () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'Hello',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('allows empty content when attachments exist', async () => {
    const dto = plainToInstance(SendMessageDto, {
      content: '   ',
      attachments: [{ externalFileId: 'file-1' }],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects empty content with no attachments', async () => {
    const dto = plainToInstance(SendMessageDto, {
      content: '  ',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects too many attachments', async () => {
    const attachments = Array.from({ length: 11 }).map((_, index) => ({
      externalFileId: `file-${index}`,
    }));

    const dto = plainToInstance(SendMessageDto, {
      content: 'Hello',
      attachments,
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
