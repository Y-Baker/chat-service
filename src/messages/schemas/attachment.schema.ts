import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ _id: false })
export class Attachment {
  @Prop({ required: true })
  externalFileId!: string;

  @Prop()
  label?: string;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
