import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Worker } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../../auth/models/user.model';
import { MailService } from '../../mail/mail.service';
import {
  PROJECT_CLI_SYNC_QUEUE_NAME,
  type CliProjectSyncJobPayload,
} from './cli-sync.constants';
import { redisConnectionForBullmq } from '../../../config/bullmq-redis';
import { ProjectService } from '../project.service';

@Injectable()
export class CliSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CliSyncWorkerService.name);
  private worker: Worker | undefined;

  constructor(
    private readonly projects: ProjectService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    const concurrency = Math.max(
      1,
      Math.min(30, Number(process.env.PROJECT_CLI_SYNC_CONCURRENCY || 5)),
    );
    this.worker = new Worker<CliProjectSyncJobPayload>(
      PROJECT_CLI_SYNC_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: redisConnectionForBullmq(),
        concurrency,
      },
    );
    this.worker.on('failed', async (job, err) => {
      if (job) {
        this.logger.warn(
          `CLI sync job failed id=${job.id} — ${err instanceof Error ? err.message : err}`,
        );
      }
      if (!job) return;
      try {
        const state = await job.getState();
        if (state !== 'failed') return;

        const user = await this.users.findOne({ where: { id: job.data.userId } });
        if (!user?.email) return;

        await this.mail.sendCliSyncFailedEmail(user.email, {
          projectName: job.data.dto.name,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (e) {
        this.logger.error(
          `CLI sync failure email failed jobId=${job?.id}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
    });
    this.logger.log(`CLI project sync worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async processJob(job: Job<CliProjectSyncJobPayload>) {
    const { userId, dto } = job.data;
    const user = await this.users.findOne({ where: { id: userId } });

    const result = await this.projects.sync(userId, dto);

    if (user?.email) {
      try {
        await this.mail.sendCliSyncCompleteEmail(user.email, {
          projectName: dto.name,
          framework: dto.framework,
          endpointCount: dto.endpoints?.length ?? 0,
        });
      } catch (e) {
        this.logger.error(
          `CLI sync complete email failed jobId=${job.id}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
    }

    return result;
  }
}
