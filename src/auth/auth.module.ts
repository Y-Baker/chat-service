import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { InternalApiGuard } from './guards/internal-api.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtVerificationService } from './services/jwt-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, InternalApiGuard, JwtAuthGuard, JwtVerificationService],
  exports: [InternalApiGuard, JwtAuthGuard, JwtVerificationService],
})
export class AuthModule {}
