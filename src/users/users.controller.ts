import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../auth/guards/internal-api.guard';
import { BatchSyncUsersDto } from './dto/batch-sync-users.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(InternalApiGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('sync')
  async sync(@Body() dto: SyncUserDto) {
    return this.usersService.sync(dto);
  }

  @Post('sync/batch')
  async syncBatch(@Body() dto: BatchSyncUsersDto) {
    return this.usersService.syncBatch(dto);
  }

  @Get(':externalUserId')
  async getByExternalId(@Param('externalUserId') externalUserId: string) {
    return this.usersService.findByExternalId(externalUserId);
  }

  @Delete(':externalUserId')
  async remove(@Param('externalUserId') externalUserId: string) {
    return this.usersService.remove(externalUserId);
  }
}
