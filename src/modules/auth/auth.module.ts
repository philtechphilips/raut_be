import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { CliAuthController } from './cli-auth.controller';
import { AuthService } from './auth.service';
import { CliAuthService } from './cli-auth.service';
import { User } from './models/user.model';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'routiq_super_secret_key',
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController, CliAuthController],
  providers: [AuthService, CliAuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule, JwtStrategy],
})
export class AuthModule {}
