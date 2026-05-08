import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'crypto';
import type { CurrentUserPayload } from './decorators/current-user.decorator';

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 15 * 60 * 1000;

/** Browser-approved CLI tokens stay valid much longer than web-session JWTs (override via JWT_CLI_EXPIRES_IN). */
const CLI_ACCESS_EXPIRES =
  process.env.JWT_CLI_EXPIRES_IN?.trim() || '365d';

interface CliDeviceSession {
  deviceCode: string;
  userCodeNorm: string;
  userCodeDisplay: string;
  accessToken?: string;
  expiresAt: number;
}

@Injectable()
export class CliAuthService {
  private readonly byDevice = new Map<string, CliDeviceSession>();

  constructor(private readonly jwtService: JwtService) {}

  private randomUserCode(): { display: string; norm: string } {
    let raw = '';
    for (let i = 0; i < 8; i++) {
      raw += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
    }
    return { norm: raw, display: `${raw.slice(0, 4)}-${raw.slice(4)}` };
  }

  normalizeUserCode(input: string): string {
    return input.replace(/[^A-Z2-9]/gi, '').toUpperCase();
  }

  startSession(frontendBaseUrl: string) {
    const deviceCode = randomBytes(32).toString('hex');
    const { display, norm } = this.randomUserCode();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const session: CliDeviceSession = {
      deviceCode,
      userCodeNorm: norm,
      userCodeDisplay: display,
      expiresAt,
    };
    this.byDevice.set(deviceCode, session);
    const base = frontendBaseUrl.replace(/\/$/, '');
    const verificationUri = `${base}/auth/cli-device?user_code=${encodeURIComponent(display)}`;
    return {
      device_code: deviceCode,
      user_code: display,
      expires_in: Math.floor(SESSION_TTL_MS / 1000),
      interval: 3,
      verification_uri: verificationUri,
    };
  }

  approve(userCodeInput: string, user: CurrentUserPayload) {
    const norm = this.normalizeUserCode(userCodeInput);
    if (norm.length !== 8) {
      throw new UnauthorizedException('Invalid user code');
    }
    for (const session of this.byDevice.values()) {
      if (session.userCodeNorm !== norm) continue;
      if (Date.now() > session.expiresAt) {
        this.byDevice.delete(session.deviceCode);
        throw new GoneException('This login request has expired. Run rauts login again.');
      }
      if (session.accessToken) {
        throw new UnauthorizedException('This code was already used');
      }
      session.accessToken = this.jwtService.sign(
        { id: user.id, email: user.email },
        { expiresIn: CLI_ACCESS_EXPIRES },
      );
      return { success: true as const };
    }
    throw new UnauthorizedException('Unknown or expired user code');
  }

  poll(deviceCode: string): { pending: true } | { access_token: string; token_type: 'Bearer' } {
    const session = this.byDevice.get(deviceCode);
    if (!session || Date.now() > session.expiresAt) {
      this.byDevice.delete(deviceCode);
      throw new GoneException('Unknown or expired device session');
    }
    if (!session.accessToken) {
      return { pending: true };
    }
    const token = session.accessToken;
    this.byDevice.delete(deviceCode);
    return { access_token: token, token_type: 'Bearer' as const };
  }
}
