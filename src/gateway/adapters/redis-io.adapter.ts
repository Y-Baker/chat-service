import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplication, private readonly redisUrl: string) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.pubClient = createClient({ url: this.redisUrl });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (error) => this.logger.error(error));
    this.subClient.on('error', (error) => this.logger.error(error));

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close(): Promise<void> {
    try {
      await this.subClient?.quit();
      await this.pubClient?.quit();
      this.subClient?.disconnect();
      this.pubClient?.disconnect();
    } catch (error) {
      this.logger.warn('Failed to close Redis adapter clients', error as Error);
    }
  }
}
