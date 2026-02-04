import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum ParticipantRole {
  Admin = 'admin',
  Member = 'member',
}

@Schema({ _id: false })
export class Participant {
  @Prop({ required: true })
  externalUserId!: string;

  @Prop({ enum: ParticipantRole })
  role?: ParticipantRole;

  @Prop({ required: true })
  joinedAt!: Date;

  @Prop()
  addedBy?: string;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
