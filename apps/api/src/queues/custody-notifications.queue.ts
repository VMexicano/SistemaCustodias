// ---------------------------------------------------------------------------
// custody-notifications.queue.ts — BullMQ queue for custody notifications
// ---------------------------------------------------------------------------

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { CustodyNotificationJobData } from '../modules/custody-notifications/custody-notifications.types.js';

let _custodyNotificationsQueue: Queue<CustodyNotificationJobData> | null = null;

/**
 * Initialize the custody-notifications queue singleton.
 * Must be called once from app.ts before any job is enqueued.
 */
export function initCustodyNotificationsQueue(redis: Redis): void {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });
  _custodyNotificationsQueue = new Queue<CustodyNotificationJobData>('custody-notifications', {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

/**
 * Proxy that lazily resolves to the initialized queue instance.
 * Throws if used before initCustodyNotificationsQueue() is called.
 */
export const custodyNotificationsQueue = new Proxy({} as Queue<CustodyNotificationJobData>, {
  get(_target, prop) {
    if (!_custodyNotificationsQueue) {
      throw new Error(
        'CustodyNotificationsQueue not initialized — call initCustodyNotificationsQueue(redis) first',
      );
    }
    const value = (_custodyNotificationsQueue as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(_custodyNotificationsQueue)
      : value;
  },
});
