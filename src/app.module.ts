import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { MongoDBModule } from './database/mongodb.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  imports: [
    AppLoggerModule,
    AppConfigModule,
    MongoDBModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
