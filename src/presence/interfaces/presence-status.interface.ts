export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastActivity: Date | null;
  lastSeen: Date | null;
}

export interface ConversationPresence {
  conversationId: string;
  participants: UserPresence[];
  onlineCount: number;
  awayCount: number;
  typingUsers: string[];
  recordingUsers: string[];
}

export interface ActivityIndicator {
  userId: string;
  conversationId: string;
  type: 'typing' | 'recording';
  isActive: boolean;
  timestamp: Date;
}
