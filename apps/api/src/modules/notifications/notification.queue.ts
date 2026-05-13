/**
 * notification.queue.ts — BullMQ queue + worker for push notification delivery.
 *
 * Circuit breaker (opossum) wraps the FCM channel call.
 * FCM: timeout 5s, threshold 50%, reset 30s (steering/architecture.md — ADR-027).
 *
 * Retry policy: 3 attempts, exponential backoff starting at 3s.
 * Notification failures are non-critical — they don't revert payments or trips.
 */

import { Queue, Worker, type Job } from 'bullmq';
import CircuitBreaker from 'opossum';
import type { Redis } from 'ioredis';
import type { NotificationService } from './notification.service.js';
import type { NotificationType } from './notification.channel.interface.js';

// ---------------------------------------------------------------------------
// Job data
// ---------------------------------------------------------------------------

export interface NotificationJobData {
  recipientUserId: string;
  type: NotificationType;
  tripId?: string;
  paymentId?: string;
  amount?: string;
  driverName?: string;
  finalFare?: string;
  scheduledFor?: string;
}

// ---------------------------------------------------------------------------
// NotificationQueue
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'notification';

export class NotificationQueue {
  private queue: Queue<NotificationJobData>;
  private worker: Worker<NotificationJobData> | null = null;
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    const connection = redis.duplicate({ maxRetriesPerRequest: null });
    this.queue = new Queue<NotificationJobData>(QUEUE_NAME, { connection });
  }

  registerWorker(notificationService: NotificationService): void {
    const breaker = new CircuitBreaker(
      (data: NotificationJobData) => {
        const extra: Record<string, string> = {};
        if (data.tripId) extra.tripId = data.tripId;
        if (data.amount) extra.amount = data.amount;
        if (data.driverName) extra.driverName = data.driverName;
        if (data.finalFare) extra.finalFare = data.finalFare;
        if (data.scheduledFor) extra.scheduledFor = data.scheduledFor;
        return notificationService.send(data.recipientUserId, data.type, extra);
      },
      {
        timeout: 5_000,               // 5s
        errorThresholdPercentage: 50, // 50%
        resetTimeout: 30_000,         // 30s
        name: 'fcm-notification',
      },
    );

    breaker.on('open', () =>
      console.warn('[NotificationQueue] Circuit breaker OPEN — FCM degraded'),
    );
    breaker.on('close', () =>
      console.info('[NotificationQueue] Circuit breaker CLOSED — FCM recovered'),
    );

    const connection = this.redis.duplicate({ maxRetriesPerRequest: null });

    this.worker = new Worker<NotificationJobData>(
      QUEUE_NAME,
      async (job: Job<NotificationJobData>) => {
        await breaker.fire(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (_job, err) => {
      console.error('[NotificationQueue] Notification failed after retries:', err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[NotificationQueue] Worker error:', err.message);
    });
  }

  async enqueue(data: NotificationJobData): Promise<void> {
    await this.queue.add('send', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3_000 },
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

let _instance: NotificationQueue | null = null;

export function initNotificationQueue(redis: Redis): NotificationQueue {
  _instance = new NotificationQueue(redis);
  return _instance;
}

export const notificationQueue = new Proxy({} as NotificationQueue, {
  get(_target, prop) {
    if (!_instance) throw new Error('NotificationQueue not initialized — call initNotificationQueue(redis) first');
    const value = (_instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(_instance) : value;
  },
});
