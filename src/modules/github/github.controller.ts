import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { GithubService } from './github.service';
import { GithubScanDto } from './dto/github-scan.dto';
import { GithubScanQueueService } from './queue/github-scan-queue.service';
import { CreateGithubSubscriptionDto } from './dto/create-github-subscription.dto';
import type { GithubPushWebhookPayload } from './dto/github-webhook.dto';
import { LinkGithubAppInstallationDto } from './dto/link-github-app-installation.dto';

function truncateJson(value: unknown, maxChars: number): string {
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}…(truncated ${s.length - maxChars} chars)`;
  } catch {
    return '[unserializable]';
  }
}

@Controller('github')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    private readonly github: GithubService,
    private readonly scanQueue: GithubScanQueueService,
  ) {}

  @Post('oauth/start')
  @UseGuards(JwtAuthGuard)
  startOAuth(@CurrentUser() user: CurrentUserPayload) {
    const authorizeUrl = this.github.buildAuthorizeUrl(user.id);
    return { authorizeUrl };
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | string[] | undefined,
    @Query('state') state: string | string[] | undefined,
    @Res() res: Response,
  ) {
    const c = Array.isArray(code) ? code[0] : code;
    const s = Array.isArray(state) ? state[0] : state;
    await this.github.handleOAuthCallback(
      typeof c === 'string' ? c.trim() : undefined,
      typeof s === 'string' ? s.trim() : undefined,
      res,
    );
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: CurrentUserPayload) {
    return this.github.getStatus(user.id);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: CurrentUserPayload) {
    await this.github.disconnect(user.id);
    return { ok: true };
  }

  @Get('repos')
  @UseGuards(JwtAuthGuard)
  repos(@CurrentUser() user: CurrentUserPayload) {
    return this.github.listRepos(user.id);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard)
  subscriptions(@CurrentUser() user: CurrentUserPayload) {
    return this.github.listSubscriptions(user.id);
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  createSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateGithubSubscriptionDto,
  ) {
    return this.github.upsertSubscription(user.id, dto);
  }

  @Delete('subscriptions/:id')
  @UseGuards(JwtAuthGuard)
  deleteSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.github.deleteSubscription(user.id, id);
  }

  @Post('scan')
  @UseGuards(JwtAuthGuard)
  scan(@CurrentUser() user: CurrentUserPayload, @Body() dto: GithubScanDto) {
    return this.scanQueue.enqueueScan(user.id, dto);
  }

  @Post('webhook')
  async webhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: GithubPushWebhookPayload,
  ) {
    this.github.verifyWebhookSignature(signature, req.rawBody);
    if (event !== 'push') {
      return { ok: true, ignored: true, reason: 'Only push events are processed.' };
    }
    return this.github.triggerSubscriptionsFromPush(payload);
  }

  /** Single webhook URL for all customers (configure on your GitHub App). */
  @Post('app/webhook')
  @HttpCode(HttpStatus.OK)
  async githubAppWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') delivery: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: Record<string, unknown>,
  ) {
    this.github.verifyGithubAppWebhookSignature(signature, req.rawBody);
    const result = await this.github.handleGithubAppWebhookEvent(event, payload);
    const payloadLogged = truncateJson(payload, 24_000);
    const responseLogged = truncateJson(result, 12_000);
    this.logger.log(
      `[github-app-webhook] delivery=${delivery ?? 'n/a'} event=${event ?? 'n/a'} rawBodyBytes=${req.rawBody?.length ?? 0} payload=${payloadLogged} response=${responseLogged}`,
    );
    return result;
  }

  @Get('app/status')
  @UseGuards(JwtAuthGuard)
  githubAppStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.github.getGithubAppDashboardStatus(user.id);
  }

  @Post('app/link-installation')
  @UseGuards(JwtAuthGuard)
  linkGithubAppInstallation(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: LinkGithubAppInstallationDto,
  ) {
    return this.github.linkGithubAppInstallation(user.id, dto);
  }

  @Get('scan/jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  scanJobStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
  ) {
    return this.scanQueue.getJobForUser(user.id, jobId);
  }
}
