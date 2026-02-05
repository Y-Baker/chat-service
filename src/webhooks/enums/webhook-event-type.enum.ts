export enum WebhookEventType {
  MESSAGE_CREATED = 'message.created',
  MESSAGE_UPDATED = 'message.updated',
  MESSAGE_DELETED = 'message.deleted',
  CONVERSATION_CREATED = 'conversation.created',
  CONVERSATION_DELETED = 'conversation.deleted',
  PARTICIPANT_ADDED = 'participant.added',
  PARTICIPANT_REMOVED = 'participant.removed',
  REACTION_ADDED = 'reaction.added',
  REACTION_REMOVED = 'reaction.removed',
  USER_ONLINE = 'user.online',
  USER_OFFLINE = 'user.offline',
}
