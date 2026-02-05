import { Socket } from 'socket.io';
import { SocketUserData } from './socket-user-data.interface';

export interface AuthenticatedSocket extends Socket {
  user: SocketUserData;
}
