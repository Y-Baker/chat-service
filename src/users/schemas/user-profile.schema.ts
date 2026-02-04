import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type UserProfileDocument = HydratedDocument<UserProfile>;

@Schema({ timestamps: true })
export class UserProfile {
  @Prop({ required: true, unique: true, index: true })
  externalUserId: string;

  @Prop({ required: true })
  displayName: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ required: true })
  syncedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

UserProfileSchema.index({ externalUserId: 1 }, { unique: true });
UserProfileSchema.index({ isActive: 1 });
