import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Attachment, AttachmentSchema } from './attachment.schema';

export type MessageDocument = HydratedDocument<Message>;

export enum MessageType {
  Text = 'text',
  System = 'system',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  conversationId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  senderId!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ enum: MessageType, default: MessageType.Text })
  type!: MessageType;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments!: Attachment[];

  @Prop({ type: SchemaTypes.ObjectId })
  replyTo?: Types.ObjectId;

  @Prop({ default: false })
  isEdited!: boolean;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, isDeleted: 1 });
MessageSchema.index({ senderId: 1 });
