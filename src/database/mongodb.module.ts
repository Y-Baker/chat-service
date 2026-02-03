import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('MongoDBModule');

        return {
          uri: configService.getOrThrow<string>('mongodb.uri'),
          retryAttempts: 3,
          retryDelay: 1000,
          connectionFactory: (connection: unknown) => {
            const conn = connection as {
              on: (event: string, callback: (...args: unknown[]) => void) => void;
            };

            conn.on('connected', () => {
              logger.log('✅ MongoDB connected successfully');
            });

            conn.on('disconnected', () => {
              logger.warn('⚠️  MongoDB disconnected');
            });

            conn.on('error', (...args: unknown[]) => {
              const error = args[0] as Error;
              logger.error('❌ MongoDB connection error:', error.message);
            });

            return connection;
          },
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class MongoDBModule {}
