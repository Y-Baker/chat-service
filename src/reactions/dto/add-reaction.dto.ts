import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddReactionDto {
  @ApiProperty({ example: '👍', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji!: string;
}
