import type { GithubScanDto } from '../dto/github-scan.dto';

export const GITHUB_SCAN_QUEUE_NAME = 'github-scan';

/** Nest DI token for the BullMQ `Queue` instance. */
export const GITHUB_SCAN_BULL_QUEUE = Symbol('GITHUB_SCAN_BULL_QUEUE');

export type GithubScanJobPayload = {
  userId: number;
  dto: GithubScanDto;
};
