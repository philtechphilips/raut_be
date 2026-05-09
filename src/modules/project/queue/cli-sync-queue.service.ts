import { Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import {
  PROJECT_CLI_SYNC_BULL_QUEUE,
  PROJECT_CLI_SYNC_QUEUE_NAME,
  type CliProjectSyncJobPayload,
} from './cli-sync.constants';
import { redisConnectionForBullmq } from '../../../config/bullmq-redis';
import type { SyncProjectDto } from '../dto/sync-project.dto';

function bullStateToApiStatus(
  state: string,
): 'queued' | 'running' | 'completed' | 'failed' {
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'active') return 'running';
  return 'queued';
}

@Injectable()
export class CliSyncQueueService implements OnModuleDestroy {
  constructor(
    @Inject(PROJECT_CLI_SYNC_BULL_QUEUE)
    private readonly queue: Queue<CliProjectSyncJobPayload>,
  ) {}

  async onModuleDestroy() {
    await this.queue.close();
  }

  async enqueueSync(userId: string, dto: SyncProjectDto) {
    const jobId = randomUUID();
    await this.queue.add('sync', { userId, dto }, { jobId });
    return {
      jobId,
      status: 'queued' as const,
      message:
        'Sync queued. Your CLI can exit now — the dashboard will update shortly.',
    };
  }

  async getJobForUser(userId: string, jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException('Sync job not found.');
    if (job.data.userId !== userId) throw new NotFoundException('Sync job not found.');
    const state = await job.getState();
    const status = bullStateToApiStatus(state);
    const result =
      status === 'completed' && job.returnvalue != null
        ? (job.returnvalue as Record<string, unknown>)
        : null;
    const errorMessage = status === 'failed' ? job.failedReason ?? 'Sync failed.' : null;
    return {
      jobId: job.id!,
      status,
      errorMessage,
      result,
      createdAt: job.timestamp ? new Date(job.timestamp) : null,
      startedAt: job.processedOn ? new Date(job.processedOn) : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    };
  }
}

export function createCliSyncQueue(): Queue<CliProjectSyncJobPayload> {
  return new Queue(PROJECT_CLI_SYNC_QUEUE_NAME, {
    connection: redisConnectionForBullmq(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 2000 },
      removeOnFail: { age: 604800, count: 5000 },
    },
  });
}
