import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { InternalApiGuard } from './guards/internal-api.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const issuer = configService.get<string>('auth.jwtIssuer');

        return {
          secret: configService.getOrThrow<string>('auth.jwtSecret'),
          signOptions: issuer ? { issuer } : {},
        };
      },
    }),
  ],
  providers: [JwtStrategy, InternalApiGuard],
  exports: [InternalApiGuard],
})
export class AuthModule {}
