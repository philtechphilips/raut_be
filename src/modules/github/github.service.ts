import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { IsNull, Repository } from 'typeorm';
import { Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { AiService } from '../ai/ai.service';
import { ProjectService } from '../project/project.service';
import { RAUTS_SUPPORTED_FRAMEWORKS, RautsScanner } from '../scan/rauts-scanner';
import type { Endpoint } from '../scan/scanner.domain';
import { UserGithubConnection } from './models/user-github-connection.model';
import { GithubRepoSubscription } from './models/github-repo-subscription.model';
import { GithubAppInstallation } from './models/github-app-installation.model';
import { GithubAppAuthService } from './github-app-auth.service';
import { isGithubAppConfigured } from './github-app-jwt.util';
import { encryptGithubToken, decryptGithubToken } from './github-token-crypto';
import { signGithubOAuthState, verifyGithubOAuthState } from './github-oauth-state';
import {
  mergeSyncPayloadWithEndpointIds,
  type GithubApiEndpoint,
} from './github-sync-merge.util';
import { scanResultToSyncPayload } from './scan/github-scan-payload';
import type { GithubScanDto } from './dto/github-scan.dto';
import { CreateGithubSubscriptionDto } from './dto/create-github-subscription.dto';
import type { LinkGithubAppInstallationDto } from './dto/link-github-app-installation.dto';
import type { GithubPushWebhookPayload } from './dto/github-webhook.dto';
import { GithubScanQueueService } from './queue/github-scan-queue.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @InjectRepository(UserGithubConnection)
    private readonly connections: Repository<UserGithubConnection>,
    @InjectRepository(GithubRepoSubscription)
    private readonly subscriptions: Repository<GithubRepoSubscription>,
    @InjectRepository(GithubAppInstallation)
    private readonly githubAppInstallations: Repository<GithubAppInstallation>,
    private readonly githubAppAuth: GithubAppAuthService,
    private readonly projectService: ProjectService,
    private readonly aiService: AiService,
    private readonly scanQueue: GithubScanQueueService,
  ) {}

  async listSubscriptions(userId: string) {
    const rows = await this.subscriptions.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    return {
      subscriptions: rows.map((row) => ({
        id: row.id,
        owner: row.owner,
        repo: row.repo,
        branch: row.branch,
        collectionName: row.collectionName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async upsertSubscription(userId: string, dto: CreateGithubSubscriptionDto) {
    const owner = dto.owner.trim();
    const repo = dto.repo.trim();
    const branch = dto.branch?.trim() || null;
    const collectionName = dto.collectionName?.trim() || null;

    let row = await this.subscriptions.findOne({
      where: { userId, owner, repo, branch: branch ?? IsNull() },
    });

    if (row) {
      row.collectionName = collectionName;
      row = await this.subscriptions.save(row);
    } else {
      row = await this.subscriptions.save(
        this.subscriptions.create({
          userId,
          owner,
          repo,
          branch,
          collectionName,
        }),
      );
    }

    return {
      id: row.id,
      owner: row.owner,
      repo: row.repo,
      branch: row.branch,
      collectionName: row.collectionName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async deleteSubscription(userId: string, subscriptionId: string) {
    const result = await this.subscriptions.delete({ id: subscriptionId, userId });
    if (!result.affected) {
      throw new BadRequestException('Subscription not found.');
    }
    return { ok: true };
  }

  private assertValidWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
    secret: string,
  ): void {
    if (!signatureHeader || !rawBody) {
      throw new ForbiddenException('Missing webhook signature.');
    }
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const left = Buffer.from(signatureHeader);
    const right = Buffer.from(expected);
    const safe = left.length === right.length && timingSafeEqual(left, right);
    if (!safe) {
      throw new ForbiddenException('Invalid webhook signature.');
    }
  }

  /** Legacy per-repo webhooks (manual setup). */
  verifyWebhookSignature(signatureHeader: string | undefined, rawBody: Buffer | undefined): void {
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'GitHub webhook is not configured (set GITHUB_WEBHOOK_SECRET).',
      );
    }
    this.assertValidWebhookSignature(signatureHeader, rawBody, secret);
  }

  /** GitHub App delivers all installs to one URL; prefers `GITHUB_APP_WEBHOOK_SECRET`. */
  verifyGithubAppWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
  ): void {
    const secret =
      process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() ||
      process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'GitHub App webhook secret is not configured (set GITHUB_APP_WEBHOOK_SECRET).',
      );
    }
    this.assertValidWebhookSignature(signatureHeader, rawBody, secret);
  }

  async getGithubAppDashboardStatus(userId: string) {
    const slug = process.env.GITHUB_APP_SLUG?.trim() || null;
    const configured = isGithubAppConfigured();
    const installationCount = await this.githubAppInstallations.count({
      where: { userId },
    });
    const webhookPublicUrl = process.env.API_PUBLIC_URL?.replace(/\/+$/, '') || null;
    const appWebhookUrl =
      webhookPublicUrl != null ? `${webhookPublicUrl}/api/github/app/webhook` : null;
    const installUrl =
      configured && slug
        ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
        : null;
    return {
      githubAppConfigured: configured,
      githubAppSlug: slug,
      installationLinked: installationCount > 0,
      installUrl,
      /** Configure this once on the GitHub App (same URL for every customer). */
      appWebhookUrl,
    };
  }

  async linkGithubAppInstallation(userId: string, dto: LinkGithubAppInstallationDto) {
    const installationId = dto.installationId.trim();
    const conn = await this.connections.findOne({ where: { userId } });
    if (!conn) {
      throw new BadRequestException('Connect GitHub first (OAuth), then link the app installation.');
    }

    const taken = await this.githubAppInstallations.findOne({
      where: { installationId },
    });
    if (taken && taken.userId !== userId) {
      throw new ConflictException(
        'This GitHub App installation is already linked to another Routiq account.',
      );
    }

    const inst = await this.githubAppAuth.getInstallation(installationId);
    const account = inst.account;
    const login = account?.login?.trim();
    const type = account?.type?.trim();
    if (!login || !type) {
      throw new BadRequestException('Unexpected GitHub installation response.');
    }

    const oauth = decryptGithubToken(conn.accessTokenEnc);
    await this.assertGithubAccountMatchesInstallation(
      { login, type },
      conn.githubLogin,
      oauth,
    );

    let row =
      taken && taken.userId === userId
        ? taken
        : this.githubAppInstallations.create({ userId, installationId });
    row.accountLogin = login;
    row.accountType = type;
    row = await this.githubAppInstallations.save(row);

    return {
      ok: true,
      installationId: row.installationId,
      accountLogin: row.accountLogin,
      accountType: row.accountType,
    };
  }

  private async assertGithubAccountMatchesInstallation(
    account: { login: string; type: string },
    githubLogin: string,
    oauthToken: string,
  ): Promise<void> {
    if (account.type === 'User') {
      if (account.login !== githubLogin) {
        throw new ForbiddenException('This installation belongs to a different GitHub user.');
      }
      return;
    }
    if (account.type === 'Organization') {
      const res = await fetch(
        `https://api.github.com/orgs/${encodeURIComponent(account.login)}/members/${encodeURIComponent(githubLogin)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${oauthToken}`,
            'User-Agent': 'Routiq-Backend',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (res.status === 204 || res.status === 200) {
        return;
      }
      throw new ForbiddenException(
        'Your GitHub user is not a member of this organization (or cannot verify membership).',
      );
    }
    throw new BadRequestException(`Unsupported GitHub account type: ${account.type}`);
  }

  /**
   * Persist `github_app_installations` when GitHub notifies install/configure.
   * Matches `sender.login` to `user_github_connections.githubLogin` (user must have clicked Connect GitHub first).
   */
  private async upsertInstallationFromWebhookPayload(
    payload: Record<string, unknown>,
  ): Promise<{
    linked: boolean;
    userId?: string;
    installationId?: string;
    reason?: string;
    hint?: string;
  }> {
    const installation = payload['installation'] as
      | {
          id?: number;
          account?: { login?: string; type?: string };
        }
      | undefined;
    const sender = payload['sender'] as { login?: string } | undefined;

    const installationId =
      installation?.id != null ? String(installation.id) : null;
    const accountLogin = installation?.account?.login?.trim();
    const accountType = installation?.account?.type?.trim();
    const senderLogin = sender?.login?.trim();

    if (!installationId || !accountLogin || !accountType) {
      return { linked: false, reason: 'missing_installation_or_account' };
    }
    if (!senderLogin) {
      return {
        linked: false,
        reason: 'missing_sender_login',
        installationId,
      };
    }

    const conn = await this.connections.findOne({
      where: { githubLogin: senderLogin },
    });
    if (!conn) {
      return {
        linked: false,
        reason: 'no_oauth_for_sender',
        installationId,
        hint: 'Connect GitHub in Routiq (OAuth), then reinstall the app or open the install URL again.',
      };
    }

    const existing = await this.githubAppInstallations.findOne({
      where: { installationId },
    });
    if (existing && existing.userId !== conn.userId) {
      this.logger.warn(
        `GitHub App installation ${installationId} already linked to another Routiq user; sender=${senderLogin}`,
      );
      return {
        linked: false,
        reason: 'installation_linked_to_other_user',
        installationId,
      };
    }

    let row =
      existing && existing.userId === conn.userId
        ? existing
        : this.githubAppInstallations.create({
            userId: conn.userId,
            installationId,
          });
    row.accountLogin = accountLogin;
    row.accountType = accountType;
    await this.githubAppInstallations.save(row);
    this.logger.log(
      `GitHub App installation stored installationId=${installationId} userId=${conn.userId} account=${accountLogin} (${accountType}) sender=${senderLogin}`,
    );
    return {
      linked: true,
      userId: conn.userId,
      installationId,
    };
  }

  /** GitHub App webhooks: installation lifecycle + push (Vercel-style, one URL for all users). */
  async handleGithubAppWebhookEvent(
    event: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (event === 'installation') {
      const action = payload['action'];
      if (action === 'deleted') {
        const inst = payload['installation'] as { id?: number } | undefined;
        const id = inst?.id != null ? String(inst.id) : null;
        if (id) {
          await this.githubAppInstallations.delete({ installationId: id });
        }
        return { ok: true, handled: 'installation_deleted' };
      }
      if (
        action === 'created' ||
        action === 'unsuspend' ||
        action === 'new_permissions_accepted'
      ) {
        const linkResult = await this.upsertInstallationFromWebhookPayload(payload);
        return {
          ok: true,
          handled: 'installation',
          action,
          ...linkResult,
        };
      }
      return {
        ok: true,
        ignored: true,
        event: 'installation',
        action,
        reason: 'installation_action_not_auto_linked',
      };
    }

    /** Fires when repos are added to an existing install (often right after install when picking repos). */
    if (event === 'installation_repositories') {
      const action = payload['action'];
      if (action === 'added') {
        const linkResult = await this.upsertInstallationFromWebhookPayload(payload);
        return {
          ok: true,
          handled: 'installation_repositories',
          action,
          ...linkResult,
        };
      }
      return {
        ok: true,
        ignored: true,
        event: 'installation_repositories',
        action,
      };
    }

    if (event !== 'push') {
      return { ok: true, ignored: true, reason: 'Only push is processed for docs sync.' };
    }

    return this.triggerSubscriptionsFromGithubAppPush(payload as GithubPushWebhookPayload);
  }

  async triggerSubscriptionsFromPush(payload: GithubPushWebhookPayload) {
    const owner = payload.repository?.owner?.login?.trim() || payload.repository?.owner?.name?.trim();
    const repo = payload.repository?.name?.trim();
    if (!owner || !repo) {
      throw new BadRequestException('Webhook payload is missing repository owner/name.');
    }

    const ref = payload.ref?.trim();
    const branchFromRef = ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
    const branch = branchFromRef?.trim() || null;

    const rows = await this.subscriptions.find({ where: { owner, repo } });
    const matchingRows = rows.filter((row) => {
      if (!row.branch) return true;
      return branch != null && row.branch === branch;
    });

    const triggered: {
      subscriptionId: string;
      userId: string;
      owner: string;
      repo: string;
      branch: string | null;
      collectionName: string | null;
      jobId: string;
    }[] = [];
    const failed: {
      subscriptionId: string;
      userId: string;
      reason: string;
    }[] = [];

    for (const row of matchingRows) {
      try {
        const queued = await this.scanQueue.enqueueScan(row.userId, {
          owner: row.owner,
          repo: row.repo,
          branch: row.branch || branch || undefined,
          collectionName: row.collectionName || undefined,
        });
        triggered.push({
          subscriptionId: row.id,
          userId: row.userId,
          owner: row.owner,
          repo: row.repo,
          branch: row.branch,
          collectionName: row.collectionName,
          jobId: queued.jobId,
        });
      } catch (error: unknown) {
        failed.push({
          subscriptionId: row.id,
          userId: row.userId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      ok: true,
      repo: `${owner}/${repo}`,
      branch,
      totalSubscriptions: rows.length,
      matchedSubscriptions: matchingRows.length,
      triggered,
      failed,
    };
  }

  /** Push delivered via GitHub App webhook (`installation` present). Uses installation token for clone. */
  async triggerSubscriptionsFromGithubAppPush(payload: GithubPushWebhookPayload) {
    const installationIdRaw = payload.installation?.id;
    const installationId =
      installationIdRaw != null ? String(installationIdRaw) : null;
    if (!installationId) {
      throw new BadRequestException(
        'GitHub App push payload is missing installation.id.',
      );
    }

    const linked = await this.githubAppInstallations.find({
      where: { installationId },
    });
    if (!linked.length) {
      return {
        ok: true,
        source: 'github_app',
        matchedInstallations: 0,
        matchedSubscriptions: 0,
        triggered: [] as { subscriptionId: string; userId: string; jobId: string }[],
        failed: [] as { subscriptionId: string; userId: string; reason: string }[],
        note: 'No Routiq user linked this GitHub App installation yet.',
      };
    }

    const allowedUserIds = new Set(linked.map((r) => r.userId));

    const owner =
      payload.repository?.owner?.login?.trim() ||
      payload.repository?.owner?.name?.trim();
    const repo = payload.repository?.name?.trim();
    if (!owner || !repo) {
      throw new BadRequestException('Webhook payload is missing repository owner/name.');
    }

    const ref = payload.ref?.trim();
    const branchFromRef = ref?.startsWith('refs/heads/')
      ? ref.slice('refs/heads/'.length)
      : null;
    const branch = branchFromRef?.trim() || null;

    const rows = await this.subscriptions.find({ where: { owner, repo } });
    const matchingRows = rows.filter((row) => {
      if (!allowedUserIds.has(row.userId)) return false;
      if (!row.branch) return true;
      return branch != null && row.branch === branch;
    });

    const triggered: {
      subscriptionId: string;
      userId: string;
      owner: string;
      repo: string;
      branch: string | null;
      collectionName: string | null;
      jobId: string;
    }[] = [];
    const failed: {
      subscriptionId: string;
      userId: string;
      reason: string;
    }[] = [];

    for (const row of matchingRows) {
      try {
        const queued = await this.scanQueue.enqueueScan(
          row.userId,
          {
            owner: row.owner,
            repo: row.repo,
            branch: row.branch || branch || undefined,
            collectionName: row.collectionName || undefined,
          },
          { githubInstallationId: installationId },
        );
        triggered.push({
          subscriptionId: row.id,
          userId: row.userId,
          owner: row.owner,
          repo: row.repo,
          branch: row.branch,
          collectionName: row.collectionName,
          jobId: queued.jobId,
        });
      } catch (error: unknown) {
        failed.push({
          subscriptionId: row.id,
          userId: row.userId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      ok: true,
      source: 'github_app',
      repo: `${owner}/${repo}`,
      branch,
      matchedInstallations: linked.length,
      totalSubscriptions: rows.length,
      matchedSubscriptions: matchingRows.length,
      triggered,
      failed,
    };
  }

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

  private async getTokenForUser(userId: string): Promise<string> {
    const row = await this.connections.findOne({ where: { userId } });
    if (!row) throw new BadRequestException('Connect GitHub first.');
    return decryptGithubToken(row.accessTokenEnc);
  }

  async getStatus(userId: string) {
    const row = await this.connections.findOne({ where: { userId } });
    return {
      connected: Boolean(row),
      githubLogin: row?.githubLogin ?? null,
    };
  }

  buildAuthorizeUrl(userId: string): string {
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

  async exchangeCodeAndSave(userId: string, code: string): Promise<void> {
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
    const verified = verifyGithubOAuthState(state);
    if (!verified.ok) {
      if (verified.reason === 'expired') {
        fail('state_expired');
      } else {
        fail('invalid_state');
      }
      return;
    }
    try {
      await this.exchangeCodeAndSave(verified.userId, code);
      const slug = process.env.GITHUB_APP_SLUG?.trim();
      if (slug && isGithubAppConfigured()) {
        const installCount = await this.githubAppInstallations.count({
          where: { userId: verified.userId },
        });
        if (installCount === 0) {
          const installUrl = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
          res.redirect(installUrl);
          return;
        }
      }
      res.redirect(`${frontend.replace(/\/+$/, '')}/dashboard?github=connected`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'connect_failed';
      fail(msg.slice(0, 200));
    }
  }

  async disconnect(userId: string): Promise<void> {
    await this.connections.delete({ userId });
    await this.githubAppInstallations.delete({ userId });
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

  async listRepos(userId: string) {
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

  async executeScanRepository(
    userId: string,
    dto: GithubScanDto,
    options?: { accessToken?: string },
  ) {
    const startedAt = Date.now();
    const repoLabel = `${dto.owner}/${dto.repo}`;
    this.logger.log(`GitHub document: start userId=${userId} repo=${repoLabel}`);

    const token =
      options?.accessToken ?? (await this.getTokenForUser(userId));
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
      const frameworkAllowed =
        RAUTS_SUPPORTED_FRAMEWORKS.has(framework) ||
        (framework === 'Unknown' && endpoints.length > 0);
      if (!frameworkAllowed) {
        this.logger.warn(
          `GitHub document: unsupported framework="${framework}" repo=${repoLabel} routes=${endpoints.length}`,
        );
        throw new BadRequestException(
          'Could not recognize a supported API framework in this repository. ' +
            'Supported stacks: NestJS, Express, Fastify, Koa, Hono, Elysia, AdonisJS (via package.json), ' +
            'or Laravel (Composer / PHP routes). Repositories where routes are detected statically may sync as Unknown.',
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
