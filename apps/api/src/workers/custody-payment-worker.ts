// ---------------------------------------------------------------------------
// custody-payment-worker.ts — BullMQ worker for custody payment processing
// ---------------------------------------------------------------------------

import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { CustodyPaymentService } from '../modules/custody-payments/custody-payments.service.js';
import type { CustodyPaymentJobData } from '../modules/custody-payments/custody-payments.types.js';

const QUEUE_NAME = 'custody-payments';

export function registerCustodyPaymentWorker(
  redis: Redis,
  service: CustodyPaymentService,
): Worker<CustodyPaymentJobData> {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });

  const worker = new Worker<CustodyPaymentJobData>(
    QUEUE_NAME,
    async (job) => {
      const { orderId } = job.data;
      await service.processPayment(orderId);
    },
    { connection },
  );

  worker.on('failed', (_job, err) => {
    console.error('[CustodyPaymentWorker] Job failed:', err.message);
  });

  return worker;
}
