import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss.l',
                  ignore: 'pid,hostname',
                  singleLine: true,
                },
              }
            : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
        customProps: () => ({
          context: 'HTTP',
        }),
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
