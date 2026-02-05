import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { GatewayModule } from '../gateway/gateway.module';
import { UsersModule } from '../users/users.module';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { ReadReceiptsController } from './read-receipts.controller';
import { ReadReceiptsService } from './read-receipts.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    forwardRef(() => ConversationsModule),
    forwardRef(() => GatewayModule),
    UsersModule,
  ],
  controllers: [ReadReceiptsController],
  providers: [ReadReceiptsService],
  exports: [ReadReceiptsService],
})
export class ReadReceiptsModule {}
