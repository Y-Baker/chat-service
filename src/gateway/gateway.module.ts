import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ConnectionService } from './services/connection.service';
import { RoomService } from './services/room.service';
import { MessagesModule } from '../messages/messages.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { ReadReceiptsModule } from '../read-receipts/read-receipts.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          issuer: configService.get<string>('auth.jwtIssuer') ?? 'master-service',
        },
      }),
    }),
    forwardRef(() => MessagesModule),
    forwardRef(() => ConversationsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ReactionsModule),
    forwardRef(() => ReadReceiptsModule),
    forwardRef(() => PresenceModule),
  ],
  providers: [ChatGateway, ConnectionService, RoomService],
  exports: [ChatGateway],
})
export class GatewayModule {}
