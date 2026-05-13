import Redis from 'ioredis';
import { env } from './environment.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 10) return null;
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] Connected');
});
