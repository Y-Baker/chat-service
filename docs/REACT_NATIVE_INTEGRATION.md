# React Native WebSocket Integration Guide

This guide will help you integrate the Chat Service WebSocket API into your React Native application.

## Table of Contents

1. [Installation](#installation)
2. [Basic Setup](#basic-setup)
3. [Connection Management](#connection-management)
4. [Authentication](#authentication)
5. [Event Handling](#event-handling)
6. [Sending Events](#sending-events)
7. [Complete Example](#complete-example)
8. [Best Practices](#best-practices)
9. [Error Handling](#error-handling)
10. [TypeScript Types](#typescript-types)

---

## Installation

Install the Socket.IO client library for React Native:

```bash
npm install socket.io-client
# or
yarn add socket.io-client
# or
pnpm add socket.io-client
```

For React Native, you may also need to install polyfills for Node.js modules:

```bash
npm install react-native-get-random-values
```

Then import it at the top of your entry file (e.g., `index.js`):

```javascript
import 'react-native-get-random-values';
```

---

## Basic Setup

### 1. Create a WebSocket Service

Create a service file to manage your WebSocket connection:

```javascript
// services/chatSocket.js
import { io } from 'socket.io-client';

class ChatSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  connect(serverUrl, token) {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    this.socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
      this.isConnected = true;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.isConnected = false;
    });

    // Server events
    this.socket.on('connected', (payload) => {
      console.log('Authenticated and connected:', payload);
      this.isConnected = true;
      this.emit('connected', payload);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.emit('error', error);
    });

    // Message events
    this.socket.on('message:new', (message) => {
      this.emit('message:new', message);
    });

    this.socket.on('message:updated', (data) => {
      this.emit('message:updated', data);
    });

    this.socket.on('message:deleted', (data) => {
      this.emit('message:deleted', data);
    });

    // Reaction events
    this.socket.on('reaction:added', (data) => {
      this.emit('reaction:added', data);
    });

    this.socket.on('reaction:removed', (data) => {
      this.emit('reaction:removed', data);
    });

    // Read receipt events
    this.socket.on('message:read', (data) => {
      this.emit('message:read', data);
    });

    this.socket.on('conversation:read', (data) => {
      this.emit('conversation:read', data);
    });

    // Typing events
    this.socket.on('user:typing', (data) => {
      this.emit('user:typing', data);
    });

    this.socket.on('user:recording', (data) => {
      this.emit('user:recording', data);
    });

    // Presence events
    this.socket.on('user:online', (data) => {
      this.emit('user:online', data);
    });

    this.socket.on('user:offline', (data) => {
      this.emit('user:offline', data);
    });

    // Conversation events
    this.socket.on('conversation:new', (conversation) => {
      this.emit('conversation:new', conversation);
    });

    this.socket.on('conversation:joined', (conversation) => {
      this.emit('conversation:joined', conversation);
    });

    this.socket.on('conversation:removed', (data) => {
      this.emit('conversation:removed', data);
    });

    this.socket.on('participant:added', (data) => {
      this.emit('participant:added', data);
    });

    this.socket.on('participant:removed', (data) => {
      this.emit('participant:removed', data);
    });
  }

  // Event emitter pattern
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach((callback) => callback(data));
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // Send message
  async sendMessage(conversationId, content, options = {}) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit(
        'message:send',
        {
          conversationId,
          content,
          attachments: options.attachments,
          replyTo: options.replyTo,
        },
        (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Failed to send message'));
          }
        }
      );
    });
  }

  // Edit message
  async editMessage(messageId, content) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('message:edit', { messageId, content }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to edit message'));
        }
      });
    });
  }

  // Delete message
  async deleteMessage(messageId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('message:delete', { messageId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to delete message'));
        }
      });
    });
  }

  // Add reaction
  async addReaction(messageId, emoji) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('reaction:add', { messageId, emoji }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to add reaction'));
        }
      });
    });
  }

  // Remove reaction
  async removeReaction(messageId, emoji) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('reaction:remove', { messageId, emoji }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to remove reaction'));
        }
      });
    });
  }

  // Mark message as read
  async markMessageRead(messageId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('message:read', { messageId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to mark message as read'));
        }
      });
    });
  }

  // Mark conversation as read
  async markConversationRead(conversationId, upToMessageId = null) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit(
        'conversation:read',
        { conversationId, upToMessageId },
        (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Failed to mark conversation as read'));
          }
        }
      );
    });
  }

  // Start typing indicator
  async startTyping(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('typing:start', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to start typing'));
        }
      });
    });
  }

  // Stop typing indicator
  async stopTyping(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('typing:stop', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to stop typing'));
        }
      });
    });
  }

  // Start recording indicator
  async startRecording(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('recording:start', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to start recording'));
        }
      });
    });
  }

  // Stop recording indicator
  async stopRecording(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('recording:stop', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to stop recording'));
        }
      });
    });
  }

  // Sync missed messages
  async syncMessages(conversationId, lastMessageId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit(
        'messages:sync',
        { conversationId, lastMessageId },
        (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Failed to sync messages'));
          }
        }
      );
    });
  }

  // Join conversation room
  async joinRoom(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('room:join', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to join room'));
        }
      });
    });
  }

  // Leave conversation room
  async leaveRoom(conversationId) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('room:leave', { conversationId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to leave room'));
        }
      });
    });
  }

  // Activity ping (keep online status)
  async activityPing() {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('activity:ping', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Failed to ping'));
        }
      });
    });
  }

  // Health check
  async ping() {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('ping', {}, (response) => {
        resolve(response);
      });
    });
  }
}

// Export singleton instance
export default new ChatSocketService();
```

---

## Connection Management

### Using React Context

Create a context to manage the socket connection across your app:

```javascript
// context/ChatSocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import chatSocket from '../services/chatSocket';
import { useAuth } from './AuthContext'; // Your auth context

const ChatSocketContext = createContext(null);

export const ChatSocketProvider = ({ children, serverUrl }) => {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    // Connect
    chatSocket.connect(serverUrl, token);

    // Listen to connection status
    const handleConnected = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleError = (error) => {
      setConnectionError(error);
      setIsConnected(false);
    };

    chatSocket.on('connected', handleConnected);
    chatSocket.on('error', handleError);

    // Cleanup
    return () => {
      chatSocket.off('connected', handleConnected);
      chatSocket.off('error', handleError);
      chatSocket.disconnect();
    };
  }, [token, serverUrl]);

  return (
    <ChatSocketContext.Provider value={{ isConnected, connectionError, chatSocket }}>
      {children}
    </ChatSocketContext.Provider>
  );
};

export const useChatSocket = () => {
  const context = useContext(ChatSocketContext);
  if (!context) {
    throw new Error('useChatSocket must be used within ChatSocketProvider');
  }
  return context;
};
```

---

## Authentication

The WebSocket connection requires a JWT token. You can provide it in three ways:

1. **Via `auth.token` (recommended)**:
```javascript
const socket = io(serverUrl, {
  auth: { token: 'your-jwt-token' },
  transports: ['websocket', 'polling'],
});
```

2. **Via query parameter**:
```javascript
const socket = io(`${serverUrl}?token=your-jwt-token`, {
  transports: ['websocket', 'polling'],
});
```

3. **Via Authorization header**:
```javascript
const socket = io(serverUrl, {
  extraHeaders: {
    Authorization: 'Bearer your-jwt-token',
  },
  transports: ['websocket', 'polling'],
});
```

---

## Event Handling

### Listening to Events in Components

```javascript
// components/ChatScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useChatSocket } from '../context/ChatSocketContext';

const ChatScreen = ({ conversationId }) => {
  const { chatSocket } = useChatSocket();
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    // Listen for new messages
    const handleNewMessage = (message) => {
      if (message.conversationId === conversationId) {
        setMessages((prev) => [...prev, message]);
      }
    };

    // Listen for message updates
    const handleMessageUpdated = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, content: data.content, isEdited: data.isEdited, updatedAt: data.updatedAt }
            : msg
        )
      );
    };

    // Listen for message deletions
    const handleMessageDeleted = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) => prev.filter((msg) => msg._id !== data.messageId));
      }
    };

    // Listen for typing indicators
    const handleTyping = (data) => {
      if (data.conversationId === conversationId) {
        if (data.isActive) {
          setTypingUsers((prev) => {
            if (!prev.includes(data.userId)) {
              return [...prev, data.userId];
            }
            return prev;
          });
        } else {
          setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
        }
      }
    };

    // Register listeners
    chatSocket.on('message:new', handleNewMessage);
    chatSocket.on('message:updated', handleMessageUpdated);
    chatSocket.on('message:deleted', handleMessageDeleted);
    chatSocket.on('user:typing', handleTyping);

    // Cleanup
    return () => {
      chatSocket.off('message:new', handleNewMessage);
      chatSocket.off('message:updated', handleMessageUpdated);
      chatSocket.off('message:deleted', handleMessageDeleted);
      chatSocket.off('user:typing', handleTyping);
    };
  }, [conversationId, chatSocket]);

  const sendMessage = async (content) => {
    try {
      await chatSocket.sendMessage(conversationId, content);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.content}</Text>
          </View>
        )}
      />
      {typingUsers.length > 0 && (
        <Text>{typingUsers.length} user(s) typing...</Text>
      )}
    </View>
  );
};

export default ChatScreen;
```

---

## Sending Events

### Complete Event Reference

#### Client → Server Events

| Event | Payload | Response | Example |
|-------|---------|----------|---------|
| `message:send` | `{ conversationId, content, attachments?, replyTo? }` | `{ success, message }` | See below |
| `message:edit` | `{ messageId, content }` | `{ success, message }` | See below |
| `message:delete` | `{ messageId }` | `{ success }` | See below |
| `reaction:add` | `{ messageId, emoji }` | `{ success, reactions }` | See below |
| `reaction:remove` | `{ messageId, emoji }` | `{ success, reactions }` | See below |
| `message:read` | `{ messageId }` | `{ success, readAt }` | See below |
| `conversation:read` | `{ conversationId, upToMessageId? }` | `{ success, count }` | See below |
| `typing:start` | `{ conversationId }` | `{ success }` | See below |
| `typing:stop` | `{ conversationId }` | `{ success }` | See below |
| `recording:start` | `{ conversationId }` | `{ success }` | See below |
| `recording:stop` | `{ conversationId }` | `{ success }` | See below |
| `activity:ping` | `{}` | `{ success }` | See below |
| `messages:sync` | `{ conversationId, lastMessageId }` | `{ success, messages }` | See below |
| `room:join` | `{ conversationId }` | `{ success, room }` | See below |
| `room:leave` | `{ conversationId }` | `{ success }` | See below |
| `ping` | `{}` | `{ event: 'pong', timestamp }` | See below |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, socketId, rooms, timestamp }` | Connection established |
| `error` | `{ code, message, timestamp }` | Error occurred |
| `message:new` | `{ ...message }` | New message received |
| `message:updated` | `{ messageId, content, isEdited, updatedAt }` | Message was edited |
| `message:deleted` | `{ messageId, conversationId, deletedAt }` | Message was deleted |
| `reaction:added` | `{ messageId, conversationId, emoji, userId, totalCount }` | Reaction added |
| `reaction:removed` | `{ messageId, conversationId, emoji, userId, totalCount }` | Reaction removed |
| `message:read` | `{ messageId, conversationId, userId, readAt }` | Message marked as read |
| `conversation:read` | `{ conversationId, userId, upToMessageId?, count, readAt }` | Conversation marked as read |
| `user:typing` | `{ conversationId, userId, type, isActive, timestamp }` | Typing status changed |
| `user:recording` | `{ conversationId, userId, type, isActive, timestamp }` | Recording status changed |
| `user:online` | `{ userId, conversationId?, timestamp }` | User came online |
| `user:offline` | `{ userId, conversationId?, lastSeen, timestamp }` | User went offline |
| `conversation:new` | `{ ...conversation }` | New conversation created |
| `conversation:joined` | `{ ...conversation }` | Added to conversation |
| `conversation:removed` | `{ conversationId }` | Removed from conversation |
| `participant:added` | `{ conversationId, userId, timestamp }` | Participant added |
| `participant:removed` | `{ conversationId, userId, timestamp }` | Participant removed |

---

## Complete Example

Here's a complete example of a chat screen component:

```javascript
// components/ChatScreen.js
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useChatSocket } from '../context/ChatSocketContext';

const ChatScreen = ({ conversationId, currentUserId }) => {
  const { chatSocket, isConnected } = useChatSocket();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    // Join the conversation room
    if (isConnected) {
      chatSocket.joinRoom(conversationId);
    }

    // Listen for new messages
    const handleNewMessage = (message) => {
      if (message.conversationId === conversationId) {
        setMessages((prev) => [...prev, message]);
        // Auto-mark as read if it's not from current user
        if (message.senderId !== currentUserId) {
          chatSocket.markMessageRead(message._id);
        }
      }
    };

    const handleMessageUpdated = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, content: data.content, isEdited: true, updatedAt: data.updatedAt }
            : msg
        )
      );
    };

    const handleMessageDeleted = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) => prev.filter((msg) => msg._id !== data.messageId));
      }
    };

    const handleTyping = (data) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        if (data.isActive) {
          setTypingUsers((prev) => {
            if (!prev.includes(data.userId)) {
              return [...prev, data.userId];
            }
            return prev;
          });
        } else {
          setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
        }
      }
    };

    const handleReactionAdded = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === data.messageId
              ? { ...msg, reactions: data.reactions }
              : msg
          )
        );
      }
    };

    // Register listeners
    chatSocket.on('message:new', handleNewMessage);
    chatSocket.on('message:updated', handleMessageUpdated);
    chatSocket.on('message:deleted', handleMessageDeleted);
    chatSocket.on('user:typing', handleTyping);
    chatSocket.on('reaction:added', handleReactionAdded);
    chatSocket.on('reaction:removed', handleReactionAdded);

    // Cleanup
    return () => {
      chatSocket.off('message:new', handleNewMessage);
      chatSocket.off('message:updated', handleMessageUpdated);
      chatSocket.off('message:deleted', handleMessageDeleted);
      chatSocket.off('user:typing', handleTyping);
      chatSocket.off('reaction:added', handleReactionAdded);
      chatSocket.off('reaction:removed', handleReactionAdded);
      chatSocket.leaveRoom(conversationId);
    };
  }, [conversationId, currentUserId, isConnected, chatSocket]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    try {
      await chatSocket.sendMessage(conversationId, inputText.trim());
      setInputText('');
      stopTyping();
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  const handleInputChange = (text) => {
    setInputText(text);
    if (!isTyping) {
      startTyping();
    }
    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  };

  const startTyping = async () => {
    if (isTyping) return;
    setIsTyping(true);
    try {
      await chatSocket.startTyping(conversationId);
    } catch (error) {
      console.error('Failed to start typing:', error);
    }
  };

  const stopTyping = async () => {
    if (!isTyping) return;
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    try {
      await chatSocket.stopTyping(conversationId);
    } catch (error) {
      console.error('Failed to stop typing:', error);
    }
  };

  const handleAddReaction = async (messageId, emoji) => {
    try {
      await chatSocket.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleEditMessage = async (messageId, newContent) => {
    try {
      await chatSocket.editMessage(messageId, newContent);
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await chatSocket.deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1 }}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 10,
                backgroundColor: item.senderId === currentUserId ? '#007AFF' : '#E5E5EA',
                alignSelf: item.senderId === currentUserId ? 'flex-end' : 'flex-start',
                borderRadius: 10,
                marginVertical: 5,
                maxWidth: '80%',
              }}
            >
              <Text>{item.content}</Text>
              {item.isEdited && <Text style={{ fontSize: 10, opacity: 0.7 }}>Edited</Text>}
            </View>
          )}
        />

        {typingUsers.length > 0 && (
          <View style={{ padding: 10 }}>
            <Text style={{ fontStyle: 'italic', color: '#666' }}>
              {typingUsers.length} user(s) typing...
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', padding: 10 }}>
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 20,
              paddingHorizontal: 15,
              paddingVertical: 10,
            }}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="Type a message..."
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            style={{
              backgroundColor: '#007AFF',
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              justifyContent: 'center',
              marginLeft: 10,
            }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;
```

---

## Best Practices

### 1. Connection Lifecycle

- Connect when the app starts or user logs in
- Disconnect when the app goes to background (optional, depends on your use case)
- Reconnect automatically on app foreground

```javascript
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'background') {
      // Optionally disconnect to save battery
      // chatSocket.disconnect();
    } else if (nextAppState === 'active') {
      // Reconnect if needed
      if (!chatSocket.isConnected && token) {
        chatSocket.connect(serverUrl, token);
      }
    }
  });

  return () => {
    subscription.remove();
  };
}, []);
```

### 2. Activity Ping

Keep the user's online status active by sending periodic pings:

```javascript
useEffect(() => {
  if (!isConnected) return;

  const pingInterval = setInterval(() => {
    chatSocket.activityPing().catch((error) => {
      console.error('Activity ping failed:', error);
    });
  }, 30000); // Every 30 seconds

  return () => clearInterval(pingInterval);
}, [isConnected, chatSocket]);
```

### 3. Typing Indicator Debouncing

Always debounce typing indicators to avoid excessive network calls:

```javascript
const typingTimeoutRef = useRef(null);

const handleInputChange = (text) => {
  setInputText(text);
  
  if (!isTyping) {
    chatSocket.startTyping(conversationId);
    setIsTyping(true);
  }

  // Clear existing timeout
  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  // Set new timeout to stop typing after 3 seconds of inactivity
  typingTimeoutRef.current = setTimeout(() => {
    chatSocket.stopTyping(conversationId);
    setIsTyping(false);
  }, 3000);
};
```

### 4. Message Sync on Reconnect

Sync missed messages when reconnecting:

```javascript
useEffect(() => {
  const handleConnected = async (payload) => {
    // Get the last message ID from your local storage
    const lastMessageId = await getLastMessageId(conversationId);
    
    if (lastMessageId) {
      try {
        const response = await chatSocket.syncMessages(conversationId, lastMessageId);
        if (response.messages && response.messages.length > 0) {
          setMessages((prev) => [...response.messages, ...prev]);
        }
      } catch (error) {
        console.error('Failed to sync messages:', error);
      }
    }
  };

  chatSocket.on('connected', handleConnected);

  return () => {
    chatSocket.off('connected', handleConnected);
  };
}, [conversationId]);
```

### 5. Error Handling

Always handle errors gracefully:

```javascript
const sendMessage = async (content) => {
  try {
    await chatSocket.sendMessage(conversationId, content);
  } catch (error) {
    if (error.message.includes('UNAUTHORIZED')) {
      // Handle authentication error - maybe refresh token
      await refreshToken();
    } else if (error.message.includes('FORBIDDEN')) {
      // User doesn't have permission
      alert('You are not a participant in this conversation');
    } else {
      // Generic error
      alert('Failed to send message. Please try again.');
    }
  }
};
```

---

## Error Handling

### Error Codes

The server may return these error codes:

- `UNAUTHORIZED` - Invalid or missing authentication token
- `FORBIDDEN` - User doesn't have permission for the action
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid payload format
- `INTERNAL_ERROR` - Server error

### Error Handling Example

```javascript
useEffect(() => {
  const handleError = (error) => {
    switch (error.code) {
      case 'UNAUTHORIZED':
        // Refresh token or redirect to login
        handleUnauthorized();
        break;
      case 'FORBIDDEN':
        alert('You do not have permission to perform this action');
        break;
      case 'NOT_FOUND':
        alert('Resource not found');
        break;
      case 'VALIDATION_ERROR':
        alert(`Invalid input: ${error.message}`);
        break;
      default:
        console.error('Socket error:', error);
        alert('An error occurred. Please try again.');
    }
  };

  chatSocket.on('error', handleError);

  return () => {
    chatSocket.off('error', handleError);
  };
}, [chatSocket]);
```

---

## TypeScript Types

If you're using TypeScript, here are some type definitions:

```typescript
// types/chatSocket.ts

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachments?: Attachment[];
  replyTo?: string;
  createdAt: string;
  updatedAt: string;
  isEdited?: boolean;
  reactions?: Reaction[];
}

export interface Attachment {
  externalFileId: string;
  label?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  count: number;
}

export interface ConnectedPayload {
  userId: string;
  socketId: string;
  rooms: number;
  timestamp: string;
}

export interface ErrorPayload {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
  message: string;
  timestamp: string;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  type: 'typing' | 'recording';
  isActive: boolean;
  timestamp: string;
}

export interface ReadReceiptPayload {
  messageId: string;
  conversationId: string;
  userId: string;
  readAt: string;
}

export interface ConversationReadPayload {
  conversationId: string;
  userId: string;
  upToMessageId?: string;
  count: number;
  readAt: string;
}
```

---

## Configuration

### Server URL

The WebSocket server URL format:
- Development: `ws://localhost:3001` or `http://localhost:3001`
- Production: `wss://your-domain.com` or `https://your-domain.com`

The default port is `3001`, but it can be configured via the `WS_PORT` environment variable.

### Connection Options

Recommended connection options:

```javascript
{
  auth: { token: 'your-jwt-token' },
  transports: ['websocket', 'polling'], // WebSocket preferred, polling fallback
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
}
```

---

## Troubleshooting

### Connection Issues

1. **Socket not connecting**
   - Check if the server URL is correct
   - Verify the JWT token is valid
   - Check network connectivity
   - Ensure CORS is properly configured on the server

2. **Authentication errors**
   - Verify the token format
   - Check token expiration
   - Ensure token is passed correctly in `auth.token`

3. **Events not received**
   - Verify you've joined the conversation room
   - Check if event listeners are properly registered
   - Ensure the socket is connected

4. **Messages not sending**
   - Check if socket is connected
   - Verify conversation ID is correct
   - Ensure user is a participant in the conversation

### Debug Mode

Enable debug logging:

```javascript
import { io } from 'socket.io-client';

// Enable debug mode
localStorage.debug = 'socket.io-client:socket';

const socket = io(serverUrl, {
  auth: { token },
  transports: ['websocket', 'polling'],
});
```

---

## Additional Resources

- [Socket.IO Client Documentation](https://socket.io/docs/v4/client-api/)
- [React Native Networking](https://reactnative.dev/docs/network)
- [WebSocket API Reference](./WEBSOCKET.md)

---

## Support

For issues or questions:
1. Check the [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) guide
2. Review the [WEBSOCKET.md](./WEBSOCKET.md) documentation
3. Contact your development team
