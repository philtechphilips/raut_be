import { Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { GithubScanDto } from '../dto/github-scan.dto';
import {
  GITHUB_SCAN_BULL_QUEUE,
  GITHUB_SCAN_QUEUE_NAME,
  type GithubScanJobPayload,
} from './github-scan.constants';
import { redisConnectionForBullmq } from './github-scan.redis';

function bullStateToApiStatus(
  state: string,
): 'queued' | 'running' | 'completed' | 'failed' {
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'active') return 'running';
  return 'queued';
}

@Injectable()
export class GithubScanQueueService implements OnModuleDestroy {
  constructor(
    @Inject(GITHUB_SCAN_BULL_QUEUE)
    private readonly queue: Queue<GithubScanJobPayload>,
  ) {}

  async onModuleDestroy() {
    await this.queue.close();
  }

  async enqueueScan(userId: number, dto: GithubScanDto) {
    const jobId = randomUUID();
    await this.queue.add('import', { userId, dto }, { jobId, attempts: 1 });
    return {
      jobId,
      status: 'queued' as const,
      message:
        'Scan queued. We will email you when the import finishes. You can stay on this page or close the app.',
    };
  }

  async getJobForUser(userId: number, jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException('Scan job not found.');
    if (job.data.userId !== userId) throw new NotFoundException('Scan job not found.');
    const state = await job.getState();
    const status = bullStateToApiStatus(state);
    const result =
      status === 'completed' && job.returnvalue != null
        ? (job.returnvalue as Record<string, unknown>)
        : null;
    const errorMessage = status === 'failed' ? job.failedReason ?? 'Scan failed.' : null;
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

/** Factory registration lives next to the module; exported for tests. */
export function createGithubScanQueue(): Queue<GithubScanJobPayload> {
  return new Queue(GITHUB_SCAN_QUEUE_NAME, {
    connection: redisConnectionForBullmq(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86400, count: 2000 },
      removeOnFail: { age: 604800, count: 5000 },
    },
  });
}
