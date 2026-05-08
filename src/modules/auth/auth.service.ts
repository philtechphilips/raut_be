import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from './models/user.model';
import { MailService } from '../mail/mail.service';

const VERIFY_EXPIRY_HOURS = 48;
const RESET_EXPIRY_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private newToken(): string {
    return randomBytes(32).toString('hex');
  }

  async register(email: string, password: string, name?: string) {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verifyToken = this.newToken();
    const verifyExpires = new Date(
      Date.now() + VERIFY_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      name: name ?? null,
      emailVerifiedAt: null,
      emailVerificationToken: verifyToken,
      emailVerificationExpiresAt: verifyExpires,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
    await this.userRepository.save(user);

    let emailSent = false;
    try {
      emailSent = await this.mailService.sendVerificationEmail(
        user.email,
        verifyToken,
      );
    } catch (e) {
      // User is created; they can use resend if delivery failed
      console.error('[Auth] Verification email failed:', e);
    }

    return {
      success: true as const,
      message:
        'Account created. Check your inbox for a link to verify your email.',
      emailSent,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
      },
    };
  }

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user);
    return {
      success: true as const,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }

  async verifyEmail(token: string) {
    if (!token?.trim()) {
      throw new BadRequestException('Token is required');
    }

    const now = new Date();
    const user = await this.userRepository.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: MoreThan(now),
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Invalid or expired verification link. Request a new one from the sign-in page.',
      );
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    await this.userRepository.save(user);

    const jwt = this.generateToken(user);
    return {
      success: true as const,
      message: 'Email verified. You are signed in.',
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    };
  }

  async resendVerification(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    const generic =
      'If an account exists for that address and it is not verified yet, we sent a new link.';

    if (!user || user.emailVerifiedAt) {
      return { success: true as const, message: generic };
    }

    const verifyToken = this.newToken();
    user.emailVerificationToken = verifyToken;
    user.emailVerificationExpiresAt = new Date(
      Date.now() + VERIFY_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await this.userRepository.save(user);

    try {
      await this.mailService.sendVerificationEmail(user.email, verifyToken);
    } catch (e) {
      console.error('[Auth] Resend verification email failed:', e);
    }

    return { success: true as const, message: generic };
  }

  async forgotPassword(email: string) {
    const message =
      'If an account exists for that email, we sent password reset instructions.';

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      return { success: true as const, message };
    }

    const resetToken = this.newToken();
    user.passwordResetToken = resetToken;
    user.passwordResetExpiresAt = new Date(
      Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    await this.userRepository.save(user);

    try {
      await this.mailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (e) {
      console.error('[Auth] Password reset email failed:', e);
    }

    return { success: true as const, message };
  }

  async resetPassword(token: string, password: string) {
    const now = new Date();
    const user = await this.userRepository.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpiresAt: MoreThan(now),
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Invalid or expired reset link. Request a new password reset from the login page.',
      );
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await this.userRepository.save(user);

    const jwt = this.generateToken(user);
    return {
      success: true as const,
      message: 'Password updated. You are signed in.',
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerifiedAt,
      },
    };
  }

  async updateProfile(userId: number, name?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (name !== undefined) {
      const trimmed = name.trim();
      user.name = trimmed.length > 0 ? trimmed : null;
    }
    await this.userRepository.save(user);
    return {
      success: true as const,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }

  private generateToken(user: User) {
    return this.jwtService.sign({ id: user.id, email: user.email });
  }
}
