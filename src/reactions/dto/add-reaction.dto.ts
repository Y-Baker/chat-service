import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji!: string;
}
