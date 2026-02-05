import { CanActivate, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { SocketUserData } from '../interfaces/socket-user-data.interface';

interface JwtPayload {
  externalUserId?: string;
  sub?: string;
}

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: any): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Missing authentication token' });
    }

    try {
      const secret = this.configService.getOrThrow<string>('auth.jwtSecret');
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      const externalUserId = payload.externalUserId ?? payload.sub;

      if (!externalUserId) {
        throw new WsException({ code: 'UNAUTHORIZED', message: 'Invalid authentication token' });
      }

      const user: SocketUserData = {
        externalUserId,
        conversationIds: [],
        connectedAt: new Date(),
      };

      (client as unknown as { user?: SocketUserData }).user = user;
      return true;
    } catch {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Invalid authentication token' });
    }
  }

  private extractToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }

    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken) {
      return queryToken;
    }

    const authHeader = socket.handshake.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }
}
