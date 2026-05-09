import type { SyncProjectDto } from '../dto/sync-project.dto';

export const PROJECT_CLI_SYNC_QUEUE_NAME = 'cli-project-sync';

/** Nest DI token for the BullMQ `Queue` instance. */
export const PROJECT_CLI_SYNC_BULL_QUEUE = Symbol('PROJECT_CLI_SYNC_BULL_QUEUE');

export type CliProjectSyncJobPayload = {
  userId: string;
  dto: SyncProjectDto;
};
