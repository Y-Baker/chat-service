import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatGateway } from './chat.gateway';
import { ConnectionService } from './services/connection.service';
import { RoomService } from './services/room.service';
import { MessagesModule } from '../messages/messages.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { ReadReceiptsModule } from '../read-receipts/read-receipts.module';
import { PresenceModule } from '../presence/presence.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => MessagesModule),
    forwardRef(() => ConversationsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ReactionsModule),
    forwardRef(() => ReadReceiptsModule),
    forwardRef(() => PresenceModule),
    WebhooksModule,
  ],
  providers: [ChatGateway, ConnectionService, RoomService],
  exports: [ChatGateway],
})
export class GatewayModule {}
