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
import { GatewayModule } from './gateway/gateway.module';
import { ReactionsModule } from './reactions/reactions.module';
import { ReadReceiptsModule } from './read-receipts/read-receipts.module';
import { PresenceModule } from './presence/presence.module';
import { WebhooksModule } from './webhooks/webhooks.module';

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
    ReactionsModule,
    ReadReceiptsModule,
    PresenceModule,
    WebhooksModule,
    GatewayModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
