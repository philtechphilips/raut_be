import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { GithubService } from './github.service';
import { GithubScanDto } from './dto/github-scan.dto';
import { GithubScanQueueService } from './queue/github-scan-queue.service';

@Controller('github')
export class GithubController {
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
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    await this.github.handleOAuthCallback(code, state, res);
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

  @Post('scan')
  @UseGuards(JwtAuthGuard)
  scan(@CurrentUser() user: CurrentUserPayload, @Body() dto: GithubScanDto) {
    return this.scanQueue.enqueueScan(user.id, dto);
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
