import { Injectable, Logger, OnModuleDestroy, OnModuleInit, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../../auth/models/user.model';
import { MailService } from '../../mail/mail.service';
import { GithubService } from '../github.service';
import { GITHUB_SCAN_QUEUE_NAME, type GithubScanJobPayload } from './github-scan.constants';
import { redisConnectionForBullmq } from './github-scan.redis';

function getErrorMessageForUser(err: unknown): string {
  if (err instanceof HttpException) {
    const r = err.getResponse();
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object' && 'message' in r) {
      const m = (r as { message: string | string[] }).message;
      return Array.isArray(m) ? m.join('; ') : String(m);
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

@Injectable()
export class GithubScanWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GithubScanWorkerService.name);
  private worker: Worker | undefined;

  constructor(
    private readonly github: GithubService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    const concurrency = Math.max(
      1,
      Math.min(20, Number(process.env.GITHUB_SCAN_CONCURRENCY || 3)),
    );
    this.worker = new Worker<GithubScanJobPayload>(
      GITHUB_SCAN_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: redisConnectionForBullmq(),
        concurrency,
      },
    );
    this.worker.on('failed', (job, err) => {
      if (job) {
        this.logger.warn(
          `GitHub scan BullMQ job failed id=${job.id} — ${err instanceof Error ? err.message : err}`,
        );
      }
    });
    this.logger.log(`GitHub scan worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async processJob(job: Job<GithubScanJobPayload>) {
    const { userId, dto } = job.data;
    const repoLabel = `${dto.owner}/${dto.repo}`;

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnrecoverableError('User not found.');
    }

    try {
      const outcome = await this.github.executeScanRepository(userId, dto);
      const resultPayload = {
        message: outcome.message,
        collectionName: outcome.collectionName,
        endpointCount: outcome.endpointCount,
        branch: outcome.branch,
      };
      try {
        await this.mail.sendGithubScanCompleteEmail(user.email, {
          repoFullName: repoLabel,
          collectionName: outcome.collectionName,
          endpointCount: outcome.endpointCount,
          branch: outcome.branch,
        });
      } catch (e) {
        this.logger.error(
          `GitHub scan complete email failed jobId=${job.id}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
      return resultPayload;
    } catch (err) {
      const msg = getErrorMessageForUser(err);
      this.logger.warn(`GitHub scan job failed jobId=${job.id} repo=${repoLabel} — ${msg}`);
      try {
        await this.mail.sendGithubScanFailedEmail(user.email, {
          repoFullName: repoLabel,
          error: msg,
        });
      } catch (e) {
        this.logger.error(
          `GitHub scan failure email failed jobId=${job.id}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
      throw err instanceof UnrecoverableError ? err : new UnrecoverableError(msg);
    }
  }
}
