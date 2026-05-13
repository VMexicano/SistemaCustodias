/**
 * trips.queue.ts
 *
 * BullMQ queue for trip lifecycle background jobs.
 * Jobs are persisted in Redis — survive process restarts (ADR-005).
 *
 * Queues:
 *   - searching-timeout: cancels a trip if still SEARCHING after 300s
 */

import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

export interface SearchingTimeoutJobData {
  tripId: string;
}

export interface PromoteApprovedJobData {
  tripId: string;
}

export type TripJobData = SearchingTimeoutJobData | PromoteApprovedJobData;

export type SearchingTimeoutHandler = (data: SearchingTimeoutJobData) => Promise<void>;
export type PromoteApprovedHandler = (data: PromoteApprovedJobData) => Promise<void>;

const QUEUE_NAME = 'trips';

export class TripsQueue {
  private queue: Queue<TripJobData>;
  private worker: Worker<TripJobData> | null = null;
  private readonly redis: Redis;

  constructor(redis: Redis) {
    // Store a reference to create dedicated connections for Queue and Worker.
    // BullMQ requires maxRetriesPerRequest: null for blocking commands.
    this.redis = redis;
    const connection = redis.duplicate({ maxRetriesPerRequest: null });
    this.queue = new Queue<TripJobData>(QUEUE_NAME, { connection });
  }

  /**
   * Register handlers for all trip jobs and start the worker.
   */
  registerSearchingTimeoutHandler(handler: SearchingTimeoutHandler): void;
  registerSearchingTimeoutHandler(
    searchingTimeoutHandler: SearchingTimeoutHandler,
    promoteApprovedHandler: PromoteApprovedHandler,
  ): void;
  registerSearchingTimeoutHandler(
    searchingTimeoutHandler: SearchingTimeoutHandler,
    promoteApprovedHandler?: PromoteApprovedHandler,
  ): void {
    // BullMQ Worker uses blocking commands — maxRetriesPerRequest must be null.
    // Create a dedicated connection from the original redis reference.
    const connection = this.redis.duplicate({ maxRetriesPerRequest: null });
    try {
      this.worker = new Worker<TripJobData>(
        QUEUE_NAME,
        async (job: Job<TripJobData>) => {
          if (job.name === 'searching-timeout') {
            await searchingTimeoutHandler(job.data as SearchingTimeoutJobData);
          } else if (job.name === 'trip.promote-approved' && promoteApprovedHandler) {
            await promoteApprovedHandler(job.data as PromoteApprovedJobData);
          }
        },
        { connection },
      );

      this.worker.on('failed', (_job, err) => {
        console.error('[TripsQueue] Job failed:', err.message);
      });
    } catch (err) {
      console.error('[TripsQueue] Worker initialization failed:', (err as Error).message);
    }
  }

  /**
   * Enqueue a searching-timeout job for a trip.
   * Persisted in Redis — survives process restarts.
   *
   * @param tripId  - The trip to cancel if still in SEARCHING after the delay.
   * @param delayMs - Milliseconds to wait (default: 300_000 = 5 min).
   */
  async enqueueSearchingTimeout(tripId: string, delayMs = 300_000): Promise<void> {
    await this.queue.add(
      'searching-timeout',
      { tripId },
      {
        delay: delayMs,
        jobId: `searching-timeout.${tripId}`, // idempotent — one job per trip (BullMQ 5 forbids ':' in jobId)
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  /**
   * Enqueue a promote-approved job for a trip (APPROVED → SEARCHING).
   * Delay: 0 (immediate). Idempotent — one job per trip.
   */
  async enqueuePromoteApproved(tripId: string): Promise<void> {
    await this.queue.add(
      'trip.promote-approved',
      { tripId } as PromoteApprovedJobData,
      {
        delay: 0,
        jobId: `promote-approved.${tripId}`,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  /**
   * Cancel a previously scheduled timeout for a trip (e.g., when accepted).
   */
  async cancelSearchingTimeout(tripId: string): Promise<void> {
    const job = await this.queue.getJob(`searching-timeout.${tripId}`);
    if (job) {
      await job.remove();
    }
  }

  /**
   * Cancel all pending jobs (for test teardown / graceful shutdown).
   * Alias for close() — drains the queue before closing.
   */
  async clearAll(): Promise<void> {
    await this.queue.drain();
    await this.close();
  }

  /**
   * Graceful shutdown — close queue and worker connections.
   */
  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton — initialized from app.ts via initTripsQueue(redis)
// ---------------------------------------------------------------------------

let _instance: TripsQueue | null = null;

export function initTripsQueue(redis: Redis): TripsQueue {
  _instance = new TripsQueue(redis);
  return _instance;
}

export const tripsQueue = new Proxy({} as TripsQueue, {
  get(_target, prop) {
    if (!_instance) throw new Error('TripsQueue not initialized — call initTripsQueue(redis) first');
    const value = (_instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(_instance) : value;
  },
});
