import { io } from 'socket.io-client';

const socket = io('ws://localhost:3001', {
  auth: { token: process.env.CHAT_JWT },
  transports: ['websocket', 'polling'],
});

socket.on('connected', (payload) => {
  console.log('connected', payload);
});

socket.on('message:new', (message) => {
  console.log('message', message);
});

export function sendMessage(conversationId, content) {
  socket.emit('message:send', { conversationId, content }, (ack) => {
    console.log('ack', ack);
  });
}
