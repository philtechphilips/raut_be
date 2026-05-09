import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
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

  constructor(private readonly projects: ProjectService) {}

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
    this.worker.on('failed', (job, err) => {
      if (job) {
        this.logger.warn(
          `CLI sync job failed id=${job.id} — ${err instanceof Error ? err.message : err}`,
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
    return this.projects.sync(userId, dto);
  }
}
