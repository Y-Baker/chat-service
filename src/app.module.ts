import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigModule } from './config/config.module';
import { MongoDBModule } from './database/mongodb.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    LoggerModule.forRoot({
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
    AppConfigModule,
    MongoDBModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
