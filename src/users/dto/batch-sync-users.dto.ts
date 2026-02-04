import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncUserDto } from './sync-user.dto';

export class BatchSyncUsersDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncUserDto)
  users!: SyncUserDto[];
}
