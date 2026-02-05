import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.module';
import {
  DEFAULT_AWAY_THRESHOLD,
  DEFAULT_LAST_SEEN_TTL,
  DEFAULT_RECORDING_TTL,
  DEFAULT_TYPING_TTL,
} from './constants/presence.constants';
import {
  ConversationPresence,
  UserPresence,
} from './interfaces/presence-status.interface';

interface PresenceHash {
  status?: string;
  lastActivity?: string;
  connectedAt?: string;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  private readonly typingTtl: number;
  private readonly recordingTtl: number;
  private readonly awayThreshold: number;
  private readonly lastSeenTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly configService: ConfigService,
  ) {
    this.typingTtl =
      this.configService.get<number>('presence.typingTtl') ?? DEFAULT_TYPING_TTL;
    this.recordingTtl =
      this.configService.get<number>('presence.recordingTtl') ?? DEFAULT_RECORDING_TTL;
    this.awayThreshold =
      this.configService.get<number>('presence.awayThreshold') ?? DEFAULT_AWAY_THRESHOLD;
    this.lastSeenTtl =
      this.configService.get<number>('presence.lastSeenTtl') ?? DEFAULT_LAST_SEEN_TTL;
  }

  async setOnline(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const pipeline = this.redis.pipeline();
    pipeline.sadd('ws:online', userId);
    pipeline.hset(`presence:${userId}`, 'status', 'online', 'lastActivity', now, 'connectedAt', now);
    pipeline.del(`lastseen:${userId}`);
    try {
      await pipeline.exec();
    } catch (error) {
      this.logger.warn('Failed to set user online', error as Error);
    }
  }

  async setAway(userId: string): Promise<void> {
    try {
      await this.redis.hset(`presence:${userId}`, 'status', 'away');
    } catch (error) {
      this.logger.warn('Failed to set user away', error as Error);
    }
  }

  async setOffline(userId: string): Promise<Date> {
    const now = new Date();
    const pipeline = this.redis.pipeline();
    pipeline.srem('ws:online', userId);
    pipeline.del(`presence:${userId}`);
    pipeline.set(`lastseen:${userId}`, now.toISOString(), 'EX', this.lastSeenTtl);
    try {
      await pipeline.exec();
    } catch (error) {
      this.logger.warn('Failed to set user offline', error as Error);
    }
    return now;
  }

  async updateActivity(userId: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      await this.redis.hset(`presence:${userId}`, 'status', 'online', 'lastActivity', now);
    } catch (error) {
      this.logger.warn('Failed to update activity', error as Error);
    }
  }

  async getPresenceStatus(userId: string): Promise<UserPresence> {
    const isOnline = await this.redis.sismember('ws:online', userId);
    if (isOnline) {
      const data: PresenceHash = await this.redis.hgetall(`presence:${userId}`);
      const lastActivity = data.lastActivity ? new Date(data.lastActivity) : null;
      const status = this.isAway(lastActivity) ? 'away' : 'online';
      return {
        userId,
        status,
        lastActivity,
        lastSeen: null,
      };
    }

    const lastSeenRaw = await this.redis.get(`lastseen:${userId}`);
    return {
      userId,
      status: 'offline',
      lastActivity: null,
      lastSeen: lastSeenRaw ? new Date(lastSeenRaw) : null,
    };
  }

  async getPresenceStatuses(userIds: string[]): Promise<UserPresence[]> {
    if (!userIds.length) {
      return [];
    }

    const onlineStatuses = await this.redis.pipeline(
      userIds.map((userId: string) => ['sismember', 'ws:online', userId]),
    ).exec();

    const onlineMap = new Map<string, boolean>();
    onlineStatuses.forEach(([, value]: [unknown, any], index: number) => {
      onlineMap.set(userIds[index], Boolean(value));
    });

    const presences: UserPresence[] = [];

    const onlineIds = userIds.filter((id) => onlineMap.get(id));
    if (onlineIds.length) {
      const presenceResults = await this.redis.pipeline(
        onlineIds.map((id) => ['hgetall', `presence:${id}`]),
      ).exec();
      presenceResults.forEach(([, value]: [unknown, PresenceHash], index: number) => {
        const userId = onlineIds[index];
        const lastActivity = value?.lastActivity ? new Date(value.lastActivity) : null;
        presences.push({
          userId,
          status: this.isAway(lastActivity) ? 'away' : 'online',
          lastActivity,
          lastSeen: null,
        });
      });
    }

    const offlineIds = userIds.filter((id) => !onlineMap.get(id));
    if (offlineIds.length) {
      const lastSeenResults = await this.redis.pipeline(
        offlineIds.map((id) => ['get', `lastseen:${id}`]),
      ).exec();
      lastSeenResults.forEach(([, value]: [unknown, string | null], index: number) => {
        const userId = offlineIds[index];
        presences.push({
          userId,
          status: 'offline',
          lastActivity: null,
          lastSeen: value ? new Date(value) : null,
        });
      });
    }

    return presences;
  }

  async getConversationPresence(
    conversationId: string,
    participantIds: string[],
  ): Promise<ConversationPresence> {
    const participants = await this.getPresenceStatuses(participantIds);
    const typingUsers = await this.getTypingUsers(conversationId);
    const recordingUsers = await this.getRecordingUsers(conversationId);

    const onlineCount = participants.filter((p) => p.status === 'online').length;
    const awayCount = participants.filter((p) => p.status === 'away').length;

    return {
      conversationId,
      participants,
      onlineCount,
      awayCount,
      typingUsers,
      recordingUsers,
    };
  }

  async setTyping(conversationId: string, userId: string): Promise<void> {
    await this.redis.set(`typing:${conversationId}:${userId}`, '1', 'EX', this.typingTtl);
    await this.updateActivity(userId);
  }

  async stopTyping(conversationId: string, userId: string): Promise<void> {
    await this.redis.del(`typing:${conversationId}:${userId}`);
  }

  async setRecording(conversationId: string, userId: string): Promise<void> {
    await this.redis.set(`recording:${conversationId}:${userId}`, '1', 'EX', this.recordingTtl);
    await this.updateActivity(userId);
  }

  async stopRecording(conversationId: string, userId: string): Promise<void> {
    await this.redis.del(`recording:${conversationId}:${userId}`);
  }

  async getTypingUsers(conversationId: string): Promise<string[]> {
    return this.scanUsersForPrefix(`typing:${conversationId}:`);
  }

  async getRecordingUsers(conversationId: string): Promise<string[]> {
    return this.scanUsersForPrefix(`recording:${conversationId}:`);
  }

  async clearUserActivityIndicators(userId: string, conversationIds: string[]): Promise<void> {
    if (!conversationIds.length) return;
    const pipeline = this.redis.pipeline();
    conversationIds.forEach((conversationId) => {
      pipeline.del(`typing:${conversationId}:${userId}`);
      pipeline.del(`recording:${conversationId}:${userId}`);
    });
    try {
      await pipeline.exec();
    } catch (error) {
      this.logger.warn('Failed to clear activity indicators', error as Error);
    }
  }

  private isAway(lastActivity: Date | null): boolean {
    if (!lastActivity) return false;
    const diffSeconds = (Date.now() - lastActivity.getTime()) / 1000;
    return diffSeconds > this.awayThreshold;
  }

  private async scanUsersForPrefix(prefix: string): Promise<string[]> {
    const match = `${prefix}*`;
    let cursor = '0';
    const users: string[] = [];

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = nextCursor;
      keys.forEach((key: string) => {
        const userId = key.replace(prefix, '');
        if (userId) {
          users.push(userId);
        }
      });
    } while (cursor !== '0');

    return users;
  }
}
