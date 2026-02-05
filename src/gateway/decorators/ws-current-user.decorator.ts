import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SocketUserData } from '../interfaces/socket-user-data.interface';

export const WsCurrentUser = createParamDecorator(
  (data: keyof SocketUserData | undefined, ctx: ExecutionContext) => {
    const client = ctx.switchToWs().getClient();
    const user = (client as { user?: SocketUserData }).user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
