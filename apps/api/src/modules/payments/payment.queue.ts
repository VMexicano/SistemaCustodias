/**
 * payment.queue.ts — BullMQ queue + worker for trip payment processing.
 *
 * Circuit breaker (opossum) wraps the Stripe gateway call.
 * Stripe: timeout 10s, threshold 30%, reset 120s (steering/architecture.md — ADR-027).
 *
 * Retry policy: 3 attempts, exponential backoff starting at 5s.
 * On definitive failure: marks payment as failed and enqueues payment_failed notification.
 */

import { Queue, Worker, type Job } from 'bullmq';
import CircuitBreaker from 'opossum';
import type { Redis } from 'ioredis';
import type { PaymentService } from './payment.service.js';
import type { NotificationQueue } from '../notifications/notification.queue.js';

// ---------------------------------------------------------------------------
// Job data
// ---------------------------------------------------------------------------

export interface PaymentJobData {
  tripId: string;
  passengerId: string;
}

// ---------------------------------------------------------------------------
// PaymentQueue
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'payment';

export class PaymentQueue {
  private queue: Queue<PaymentJobData>;
  private worker: Worker<PaymentJobData> | null = null;
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    const connection = redis.duplicate({ maxRetriesPerRequest: null });
    this.queue = new Queue<PaymentJobData>(QUEUE_NAME, { connection });
  }

  registerWorker(paymentService: PaymentService, notificationQueue: NotificationQueue): void {
    // Circuit breaker — wraps the gateway call inside PaymentService.charge()
    // Parameters from steering/architecture.md
    const breaker = new CircuitBreaker(
      (tripId: string) => paymentService.charge(tripId),
      {
        timeout: 10_000,               // 10s
        errorThresholdPercentage: 30,  // 30%
        resetTimeout: 120_000,         // 120s
        name: 'stripe-payment',
      },
    );

    breaker.on('open', () =>
      console.warn('[PaymentQueue] Circuit breaker OPEN — Stripe degraded'),
    );
    breaker.on('halfOpen', () =>
      console.info('[PaymentQueue] Circuit breaker HALF-OPEN — testing Stripe'),
    );
    breaker.on('close', () =>
      console.info('[PaymentQueue] Circuit breaker CLOSED — Stripe recovered'),
    );

    const connection = this.redis.duplicate({ maxRetriesPerRequest: null });

    try {
      this.worker = new Worker<PaymentJobData>(
        QUEUE_NAME,
        async (job: Job<PaymentJobData>) => {
          const { tripId, passengerId } = job.data;

          const result = await breaker.fire(tripId);
          const { paymentId, status } = result as { paymentId: string; status: string };

          if (status === 'completed') {
            await notificationQueue.enqueue({
              recipientUserId: passengerId,
              type: 'payment_processed',
              tripId,
              paymentId,
            });
          }
        },
        { connection },
      );
    } catch (workerErr) {
      console.error('[PaymentQueue] Worker initialization failed:', (workerErr as Error).message);
      throw workerErr;
    }

    // On definitive failure (all retries exhausted) — notify user
    this.worker.on('failed', async (job, _err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        await notificationQueue.enqueue({
          recipientUserId: job.data.passengerId,
          type: 'payment_failed',
          tripId: job.data.tripId,
        }).catch(() => {
          // Don't fail the worker event on notification errors
        });
      }
    });

    this.worker.on('error', (err) => {
      console.error('[PaymentQueue] Worker error:', err.message);
    });
  }

  async enqueue(data: PaymentJobData): Promise<void> {
    await this.queue.add('charge', data, {
      jobId: `payment.${data.tripId}`, // idempotent — one job per trip
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: PaymentQueue | null = null;

export function initPaymentQueue(redis: Redis): PaymentQueue {
  _instance = new PaymentQueue(redis);
  return _instance;
}

export const paymentQueue = new Proxy({} as PaymentQueue, {
  get(_target, prop) {
    if (!_instance) throw new Error('PaymentQueue not initialized — call initPaymentQueue(redis) first');
    const value = (_instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(_instance) : value;
  },
});
