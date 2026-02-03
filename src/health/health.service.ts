import { Injectable, Inject } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  async check() {
    const [mongodb, redis] = await Promise.allSettled([this.checkMongoDB(), this.checkRedis()]);

    const isHealthy = mongodb.status === 'fulfilled' && redis.status === 'fulfilled';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: {
          status: mongodb.status === 'fulfilled' ? 'up' : 'down',
          ...(mongodb.status === 'rejected' && {
            error: mongodb.reason instanceof Error ? mongodb.reason.message : 'Unknown error',
          }),
        },
        redis: {
          status: redis.status === 'fulfilled' ? 'up' : 'down',
          ...(redis.status === 'rejected' && {
            error: redis.reason instanceof Error ? redis.reason.message : 'Unknown error',
          }),
        },
      },
    };
  }

  private async checkMongoDB(): Promise<void> {
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const CONNECTED_STATE = 1;
    if (this.mongoConnection.readyState !== CONNECTED_STATE) {
      throw new Error('MongoDB is not connected');
    }
    const db = this.mongoConnection.db;
    if (!db) {
      throw new Error('MongoDB database instance not available');
    }
    // Ping the database
    await db.admin().ping();
  }

  private async checkRedis(): Promise<void> {
    const pong = await this.redisClient.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  }
}
