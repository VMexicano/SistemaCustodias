// ---------------------------------------------------------------------------
// geofence.queue.ts — BullMQ queue for geofence violation checks
// ---------------------------------------------------------------------------

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface GeofenceCheckJobData {
  order_id: string;
  lat: number;
  lng: number;
  operator_id: string;
}

const QUEUE_NAME = 'geofence-check';

let _geofenceQueue: Queue<GeofenceCheckJobData> | null = null;

/**
 * Initialize the geofence queue singleton.
 * Must be called once from app.ts before any job is enqueued.
 */
export function initGeofenceQueue(redis: Redis): Queue<GeofenceCheckJobData> {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });
  _geofenceQueue = new Queue<GeofenceCheckJobData>(QUEUE_NAME, { connection });
  return _geofenceQueue;
}

/**
 * Proxy that lazily resolves to the initialized queue instance.
 * Throws if used before initGeofenceQueue() is called.
 */
export const geofenceQueue = new Proxy({} as Queue<GeofenceCheckJobData>, {
  get(_target, prop) {
    if (!_geofenceQueue) {
      throw new Error(
        'GeofenceQueue not initialized — call initGeofenceQueue(redis) first',
      );
    }
    const value = (_geofenceQueue as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(_geofenceQueue)
      : value;
  },
});
