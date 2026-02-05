import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class GetBatchPresenceDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  userIds!: string[];
}
