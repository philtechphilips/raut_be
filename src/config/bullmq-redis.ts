import type { RedisOptions } from 'bullmq';

/** Connection options for BullMQ (each Queue/Worker should get a fresh options object / connection). */
export function redisConnectionForBullmq(): RedisOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: null,
  };
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return { ...base, url };
  }
  return {
    ...base,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
  };
}
