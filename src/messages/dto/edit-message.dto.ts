import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
