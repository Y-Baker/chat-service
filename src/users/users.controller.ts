import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiGuard } from '../auth/guards/internal-api.guard';
import { BatchSyncUsersDto } from './dto/batch-sync-users.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { UsersService } from './users.service';

@ApiTags('users (internal)')
@ApiHeader({ name: 'X-Internal-Secret', description: 'Internal API secret' })
@Controller('api/users')
@UseGuards(InternalApiGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Sync single user profile (internal)' })
  async sync(@Body() dto: SyncUserDto) {
    return this.usersService.sync(dto);
  }

  @Post('sync/batch')
  @ApiOperation({ summary: 'Sync multiple user profiles (internal)' })
  async syncBatch(@Body() dto: BatchSyncUsersDto) {
    return this.usersService.syncBatch(dto);
  }

  @Get(':externalUserId')
  @ApiOperation({ summary: 'Get cached user profile (internal)' })
  async getByExternalId(@Param('externalUserId') externalUserId: string) {
    return this.usersService.findByExternalId(externalUserId);
  }

  @Delete(':externalUserId')
  @ApiOperation({ summary: 'Remove user profile (internal)' })
  async remove(@Param('externalUserId') externalUserId: string) {
    return this.usersService.remove(externalUserId);
  }
}
