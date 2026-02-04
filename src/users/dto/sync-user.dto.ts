import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SyncUserDto {
  @IsString()
  @IsNotEmpty()
  externalUserId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
