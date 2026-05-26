import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize } from '../auth/decorators/authorize.decorator';
import { BatchSyncUsersDto } from './dto/batch-sync-users.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { UsersService } from './users.service';

@ApiTags('users (internal)')
@Controller('api/users')
@Authorize({ jwt: false, internal: true })
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
