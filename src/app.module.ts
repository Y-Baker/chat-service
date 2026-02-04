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
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
