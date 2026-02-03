import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { MongoDBModule } from './database/mongodb.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [AppLoggerModule, AppConfigModule, MongoDBModule, RedisModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
