import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

const SOCKET_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async registerConnection(socketId: string, userId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.sadd(this.connectionsKey(userId), socketId);
      pipeline.hset(this.socketKey(socketId), {
        userId,
        connectedAt: new Date().toISOString(),
      });
      pipeline.expire(this.socketKey(socketId), SOCKET_TTL_SECONDS);
      pipeline.sadd(this.onlineKey(), userId);
      await pipeline.exec();
    } catch (error) {
      this.logger.error('Failed to register connection', error as Error);
    }
  }

  async removeConnection(socketId: string, userId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.srem(this.connectionsKey(userId), socketId);
      pipeline.del(this.socketKey(socketId));
      await pipeline.exec();

      const remaining = await this.redis.scard(this.connectionsKey(userId));
      if (remaining === 0) {
        await this.redis.srem(this.onlineKey(), userId);
      }
    } catch (error) {
      this.logger.error('Failed to remove connection', error as Error);
    }
  }

  async getUserSockets(userId: string): Promise<string[]> {
    return this.redis.smembers(this.connectionsKey(userId));
  }

  async getUsersSockets(userIds: string[]): Promise<Map<string, string[]>> {
    const pipeline = this.redis.pipeline();
    userIds.forEach((userId) => pipeline.smembers(this.connectionsKey(userId)));
    const results = await pipeline.exec();

    const map = new Map<string, string[]>();
    results?.forEach((result, index) => {
      const userId = userIds[index];
      const sockets = Array.isArray(result?.[1]) ? (result?.[1] as string[]) : [];
      map.set(userId, sockets);
    });

    return map;
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const isOnline = await this.redis.sismember(this.onlineKey(), userId);
    return Boolean(isOnline);
  }

  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    const pipeline = this.redis.pipeline();
    userIds.forEach((userId) => pipeline.sismember(this.onlineKey(), userId));
    const results = await pipeline.exec();

    const online: string[] = [];
    results?.forEach((result, index) => {
      if (result?.[1] === 1) {
        online.push(userIds[index]);
      }
    });

    return online;
  }

  async getConnectionCount(userId: string): Promise<number> {
    return this.redis.scard(this.connectionsKey(userId));
  }

  private connectionsKey(userId: string): string {
    return `ws:connections:${userId}`;
  }

  private socketKey(socketId: string): string {
    return `ws:socket:${socketId}`;
  }

  private onlineKey(): string {
    return 'ws:online';
  }
}
