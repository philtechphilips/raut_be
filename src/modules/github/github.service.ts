import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { AiService } from '../ai/ai.service';
import { ProjectService } from '../project/project.service';
import { RAUTS_SUPPORTED_FRAMEWORKS, RautsScanner } from '../scan/rauts-scanner';
import type { Endpoint } from '../scan/scanner.domain';
import { UserGithubConnection } from './models/user-github-connection.model';
import { encryptGithubToken, decryptGithubToken } from './github-token-crypto';
import { signGithubOAuthState, verifyGithubOAuthState } from './github-oauth-state';
import {
  mergeSyncPayloadWithEndpointIds,
  type GithubApiEndpoint,
} from './github-sync-merge.util';
import { scanResultToSyncPayload } from './scan/github-scan-payload';
import type { GithubScanDto } from './dto/github-scan.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @InjectRepository(UserGithubConnection)
    private readonly connections: Repository<UserGithubConnection>,
    private readonly projectService: ProjectService,
    private readonly aiService: AiService,
  ) {}

  private requireGithubOAuthConfig(): { clientId: string; clientSecret: string } {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'GitHub OAuth is not configured (set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET).',
      );
    }
    return { clientId, clientSecret };
  }

  private async getTokenForUser(userId: number): Promise<string> {
    const row = await this.connections.findOne({ where: { userId } });
    if (!row) throw new BadRequestException('Connect GitHub first.');
    return decryptGithubToken(row.accessTokenEnc);
  }

  async getStatus(userId: number) {
    const row = await this.connections.findOne({ where: { userId } });
    return {
      connected: Boolean(row),
      githubLogin: row?.githubLogin ?? null,
    };
  }

  buildAuthorizeUrl(userId: number): string {
    const { clientId } = this.requireGithubOAuthConfig();
    const state = signGithubOAuthState(userId);
    const redirectUri =
      process.env.GITHUB_OAUTH_CALLBACK_URL ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3001/api'}/github/oauth/callback`;
    const scope = process.env.GITHUB_OAUTH_SCOPES || 'repo read:user';
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', scope);
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCodeAndSave(userId: number, code: string): Promise<void> {
    const { clientId, clientSecret } = this.requireGithubOAuthConfig();
    const redirectUri =
      process.env.GITHUB_OAUTH_CALLBACK_URL ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3001/api'}/github/oauth/callback`;

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new BadRequestException(
        tokenJson.error_description || tokenJson.error || 'GitHub token exchange failed',
      );
    }

    const accessToken = tokenJson.access_token;
    const meRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Rauts-Backend',
      },
    });
    if (!meRes.ok) {
      throw new BadRequestException('Could not read GitHub profile after connect.');
    }
    const me = (await meRes.json()) as { id?: number; login?: string };
    if (typeof me.id !== 'number' || !me.login) {
      throw new BadRequestException('Unexpected GitHub profile response.');
    }

    const enc = encryptGithubToken(accessToken);
    let row = await this.connections.findOne({ where: { userId } });
    if (row) {
      row.githubUserId = String(me.id);
      row.githubLogin = me.login;
      row.accessTokenEnc = enc;
      row = await this.connections.save(row);
    } else {
      await this.connections.save(
        this.connections.create({
          userId,
          githubUserId: String(me.id),
          githubLogin: me.login,
          accessTokenEnc: enc,
        }),
      );
    }
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
    res: Response,
  ): Promise<void> {
    const frontend =
      process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fail = (msg: string) => {
      res.redirect(
        `${frontend.replace(/\/+$/, '')}/dashboard?github_error=${encodeURIComponent(msg)}`,
      );
    };
    if (!code || !state) {
      fail('missing_code_or_state');
      return;
    }
    const userId = verifyGithubOAuthState(state);
    if (userId == null) {
      fail('invalid_state');
      return;
    }
    try {
      await this.exchangeCodeAndSave(userId, code);
      res.redirect(`${frontend.replace(/\/+$/, '')}/dashboard?github=connected`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'connect_failed';
      fail(msg.slice(0, 200));
    }
  }

  async disconnect(userId: number): Promise<void> {
    await this.connections.delete({ userId });
  }

  private async githubApiJson<T>(accessToken: string, apiPath: string): Promise<T> {
    const res = await fetch(`https://api.github.com${apiPath}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Rauts-Backend',
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new BadRequestException(`GitHub API error: ${res.status} ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async listRepos(userId: number) {
    const token = await this.getTokenForUser(userId);
    const items = await this.githubApiJson<
      { full_name: string; default_branch: string; private: boolean; updated_at: string }[]
    >(token, '/user/repos?per_page=50&sort=updated');
    return {
      repos: items.map((r) => ({
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        private: r.private,
        updatedAt: r.updated_at,
      })),
    };
  }

  private applyEnrichment(endpoint: Record<string, unknown>, data: Record<string, unknown>) {
    type FieldRow = { name: string; type?: string; required: boolean; description?: string };
    const mergeFields = (target: FieldRow[], source: unknown[]) => {
      for (const raw of source) {
        const s = raw as {
          name?: string;
          type?: string;
          required?: boolean;
          description?: string;
        };
        if (!s?.name) continue;
        if (target.some((t) => t.name === s.name)) continue;
        target.push({
          name: s.name,
          type: s.type || 'any',
          required: !!s.required,
          description: s.description ? `(AI) ${s.description}` : '(AI Inferred)',
        });
      }
    };
    if (!Array.isArray(endpoint.body)) endpoint.body = [];
    if (!Array.isArray(endpoint.query)) endpoint.query = [];
    if (!Array.isArray(endpoint.params)) endpoint.params = [];
    const body = endpoint.body as FieldRow[];
    const query = endpoint.query as FieldRow[];
    const params = endpoint.params as FieldRow[];
    if (Array.isArray(data.body)) mergeFields(body, data.body as unknown[]);
    if (Array.isArray(data.query)) mergeFields(query, data.query as unknown[]);
    if (Array.isArray(data.params)) mergeFields(params, data.params as unknown[]);
    if (data.bodySample !== undefined) endpoint.bodySample = data.bodySample;
    if (data.responseScenarios) endpoint.responseScenarios = data.responseScenarios;
    if (typeof data.description === 'string') endpoint.description = data.description;
    if (typeof data.response === 'string') endpoint.response = data.response;
    if (typeof data.name === 'string') endpoint.aiName = data.name;
    if (typeof data.category === 'string') endpoint.aiCategory = data.category;
    endpoint.confidence = 'high';
  }

  async executeScanRepository(userId: number, dto: GithubScanDto) {
    const startedAt = Date.now();
    const repoLabel = `${dto.owner}/${dto.repo}`;
    this.logger.log(`GitHub document: start userId=${userId} repo=${repoLabel}`);

    const token = await this.getTokenForUser(userId);
    const scanner = new RautsScanner();

    const meta = await this.githubApiJson<{ default_branch?: string }>(
      token,
      `/repos/${dto.owner}/${dto.repo}`,
    );
    const branch = (dto.branch?.trim() || meta.default_branch || 'main').trim();
    this.logger.log(`GitHub document: resolved branch=${branch} repo=${repoLabel}`);

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rauts-github-'));
    const cloneDir = path.join(tmpRoot, 'repo');
    try {
      const cloneUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${dto.owner}/${dto.repo}.git`;
      await execFileAsync(
        'git',
        ['clone', '--depth', '1', '--branch', branch, cloneUrl, cloneDir],
        {
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          maxBuffer: 50 * 1024 * 1024,
        },
      );
      this.logger.log(`GitHub document: clone done repo=${repoLabel} branch=${branch}`);

      let scanResult = await scanner.scan(cloneDir);
      const endpoints = scanResult.endpoints;
      if (!Array.isArray(endpoints)) {
        throw new BadRequestException('Scanner returned no endpoints array.');
      }

      const framework = scanResult.framework || 'Unknown';
      if (!RAUTS_SUPPORTED_FRAMEWORKS.has(framework)) {
        this.logger.warn(
          `GitHub document: unsupported framework="${framework}" repo=${repoLabel} routes=${endpoints.length}`,
        );
        throw new BadRequestException(
          'Could not recognize a supported API framework in this repository. ' +
            'Supported stacks: NestJS (package.json dependency @nestjs/core), Express (express), or Laravel (Composer / PHP routes). ' +
            'Use a branch that includes those files, or a repo that uses one of these frameworks.',
        );
      }
      this.logger.log(
        `GitHub document: static scan repo=${repoLabel} framework=${framework} routes=${endpoints.length}`,
      );

      let enrichmentOk = 0;
      let enrichmentFail = 0;
      let enrichmentSkipped = 0;
      for (const ep of endpoints) {
        const src = ep.handlerSource;
        if (typeof src !== 'string' || !src.trim()) {
          enrichmentSkipped++;
          continue;
        }
        try {
          const data = await this.aiService.enrichEndpoint({
            method: String(ep.method || 'GET'),
            path: String(ep.path || '/'),
            handlerSource: src,
          });
          this.applyEnrichment(ep as unknown as Record<string, unknown>, data);
          enrichmentOk++;
        } catch {
          enrichmentFail++;
        }
      }
      this.logger.log(
        `GitHub document: AI enrich repo=${repoLabel} ok=${enrichmentOk} fail=${enrichmentFail} skippedNoSource=${enrichmentSkipped}`,
      );
      const categoryNames = [
        ...new Set(
          endpoints.map((e: Endpoint) => {
            const c = String((e.aiCategory || e.folder || 'General').trim());
            return c || 'General';
          }),
        ),
      ].sort((a, b) => a.localeCompare(b));

      const endpointSummary = endpoints
        .slice(0, 80)
        .map((e: Endpoint) => {
          const cat = String((e.aiCategory || e.folder || 'General').trim()) || 'General';
          return `[${cat}] ${e.method} ${e.path} — ${e.description || 'No description'}`;
        })
        .join('\n');

      let projectMeta: { name: string; description: string; folders: { name: string; description: string }[] };
      try {
        projectMeta = await this.aiService.analyzeProject({
          framework,
          endpointSummary,
          categoryNames,
        });
        this.logger.log(
          `GitHub document: project AI summary repo=${repoLabel} folders=${projectMeta.folders.length}`,
        );
      } catch {
        projectMeta = {
          name: `${dto.owner}/${dto.repo}`,
          description: '',
          folders: [],
        };
        this.logger.warn(`GitHub document: project AI summary failed, using defaults repo=${repoLabel}`);
      }

      scanResult = {
        ...scanResult,
        name: dto.collectionName?.trim() || projectMeta.name,
        description: projectMeta.description,
        folderOverviews: projectMeta.folders,
      };

      const syncPayload = scanResultToSyncPayload(scanResult);
      const list = await this.projectService.getMyProjects(userId);
      const projects = (list as { projects?: { name: string; endpoints?: GithubApiEndpoint[] }[] })
        .projects ?? [];
      const merged = mergeSyncPayloadWithEndpointIds(projects, syncPayload);
      if (!merged.endpoints.length) {
        throw new BadRequestException(
          'No HTTP routes were detected in this repository. Try another branch or a backend that uses Express-style routes.',
        );
      }
      this.logger.log(
        `GitHub document: syncing dashboard repo=${repoLabel} collection="${merged.name}" endpoints=${merged.endpoints.length}`,
      );
      await this.projectService.sync(userId, merged);

      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `GitHub document: complete repo=${repoLabel} branch=${branch} endpoints=${merged.endpoints.length} ${elapsedMs}ms`,
      );

      return {
        success: true,
        message: 'Repository scanned and synced to your dashboard.',
        collectionName: merged.name,
        endpointCount: merged.endpoints.length,
        branch,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`GitHub document: failed repo=${repoLabel} — ${msg}`, err instanceof Error ? err.stack : undefined);
      throw err;
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  }

}
