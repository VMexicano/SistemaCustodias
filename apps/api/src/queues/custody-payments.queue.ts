// ---------------------------------------------------------------------------
// custody-payments.queue.ts — BullMQ queue for custody payment processing
// ---------------------------------------------------------------------------

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { CustodyPaymentJobData } from '../modules/custody-payments/custody-payments.types.js';

let _custodyPaymentsQueue: Queue<CustodyPaymentJobData> | null = null;

export function initCustodyPaymentsQueue(redis: Redis): void {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });
  _custodyPaymentsQueue = new Queue<CustodyPaymentJobData>('custody-payments', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

export const custodyPaymentsQueue = new Proxy({} as Queue<CustodyPaymentJobData>, {
  get(_target, prop) {
    if (!_custodyPaymentsQueue) {
      throw new Error(
        'CustodyPaymentsQueue not initialized — call initCustodyPaymentsQueue(redis) first',
      );
    }
    const value = (_custodyPaymentsQueue as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(_custodyPaymentsQueue)
      : value;
  },
});
