import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EditMessageDto } from './edit-message.dto';

describe('EditMessageDto', () => {
  it('rejects empty content', async () => {
    const dto = plainToInstance(EditMessageDto, { content: '' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
