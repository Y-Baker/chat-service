import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BatchSyncUsersDto } from './dto/batch-sync-users.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { UserProfile, UserProfileDocument } from './schemas/user-profile.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserProfile.name)
    private readonly userProfileModel: Model<UserProfileDocument>,
  ) {}

  async sync(dto: SyncUserDto): Promise<UserProfile> {
    const syncedAt = new Date();
    const setPayload = this.buildSyncSetPayload(dto, syncedAt);

    return this.userProfileModel
      .findOneAndUpdate(
        { externalUserId: dto.externalUserId },
        {
          $set: setPayload,
        },
        { new: true, upsert: true },
      )
      .exec();
  }

  async syncBatch(dto: BatchSyncUsersDto): Promise<UserProfile[]> {
    if (dto.users.length === 0) {
      return [];
    }

    const syncedAt = new Date();
    const operations = dto.users.map((user) => ({
      updateOne: {
        filter: { externalUserId: user.externalUserId },
        update: {
          $set: this.buildSyncSetPayload(user, syncedAt),
        },
        upsert: true,
      },
    }));

    await this.userProfileModel.bulkWrite(operations);

    const externalUserIds = dto.users.map((user) => user.externalUserId);

    return this.userProfileModel.find({ externalUserId: { $in: externalUserIds } }).exec();
  }

  async findByExternalId(externalUserId: string): Promise<UserProfile | null> {
    return this.userProfileModel.findOne({ externalUserId, isActive: true }).exec();
  }

  async findManyByExternalIds(externalUserIds: string[]): Promise<UserProfile[]> {
    if (externalUserIds.length === 0) {
      return [];
    }

    return this.userProfileModel
      .find({ externalUserId: { $in: externalUserIds }, isActive: true })
      .exec();
  }

  async remove(externalUserId: string): Promise<UserProfile | null> {
    return this.userProfileModel
      .findOneAndUpdate({ externalUserId }, { $set: { isActive: false } }, { new: true })
      .exec();
  }

  async hardRemove(externalUserId: string): Promise<void> {
    await this.userProfileModel.deleteOne({ externalUserId }).exec();
  }

  private buildSyncSetPayload(user: SyncUserDto, syncedAt: Date): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      displayName: user.displayName,
      isActive: true,
      syncedAt,
    };

    if (user.avatarUrl !== undefined) {
      payload.avatarUrl = user.avatarUrl;
    }

    if (user.metadata !== undefined) {
      payload.metadata = user.metadata;
    }

    return payload;
  }
}
