import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createGithubAppJwt, isGithubAppConfigured } from './github-app-jwt.util';

export type GithubInstallationAccount = {
  login?: string;
  type?: string;
};

export type GithubInstallationResponse = {
  id?: number;
  account?: GithubInstallationAccount;
};

@Injectable()
export class GithubAppAuthService {
  private readonly logger = new Logger(GithubAppAuthService.name);

  assertConfigured(): void {
    if (!isGithubAppConfigured()) {
      throw new ServiceUnavailableException(
        'GitHub App is not configured (set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY).',
      );
    }
  }

  async getInstallation(installationId: string): Promise<GithubInstallationResponse> {
    this.assertConfigured();
    const jwt = createGithubAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Routiq-Backend',
        },
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new BadRequestException(
        `GitHub installation lookup failed: ${res.status} ${t.slice(0, 200)}`,
      );
    }
    return (await res.json()) as GithubInstallationResponse;
  }

  async createInstallationAccessToken(installationId: string): Promise<string> {
    this.assertConfigured();
    const jwt = createGithubAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Routiq-Backend',
        },
      },
    );
    const json = (await res.json()) as { token?: string; message?: string };
    if (!res.ok || !json.token) {
      this.logger.warn(
        `Installation token failed installationId=${installationId} status=${res.status}`,
      );
      throw new BadRequestException(
        json.message || `Could not create installation token (${res.status}).`,
      );
    }
    return json.token;
  }
}
