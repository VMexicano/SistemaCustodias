// ---------------------------------------------------------------------------
// geofence-check.worker.ts — BullMQ worker that detects route deviation
// ---------------------------------------------------------------------------

import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Knex } from 'knex';
import { isOutsideRoute, type Point } from '../modules/custody-tracking/geofence.utils.js';
import type { GeofenceCheckJobData } from '../queues/geofence.queue.js';
import type { AlertEngine } from '../modules/alerts/alert-engine.js';

const QUEUE_NAME = 'geofence-check';
const GEOFENCE_THRESHOLD_METERS = 500;
const ALERT_COOLDOWN_SECONDS = 60;

interface OrderRow {
  id: string;
  pickup_address: { lat?: number; lng?: number } | null;
  delivery_address: { lat?: number; lng?: number } | null;
}

/**
 * Register the geofence check worker.
 * Called once from app.ts after initGeofenceQueue().
 */
export function registerGeofenceWorker(
  db: Knex,
  redis: Redis,
  alertEngine: AlertEngine,
): Worker<GeofenceCheckJobData> {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });

  const worker = new Worker<GeofenceCheckJobData>(
    QUEUE_NAME,
    async (job) => {
      const { order_id, lat, lng, operator_id } = job.data;

      // 1. Fetch the order's pickup and delivery addresses
      const result = await db.raw<{ rows: OrderRow[] }>(
        `SELECT id, pickup_address, delivery_address
         FROM custody_orders
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [order_id],
      );

      const order = result.rows[0];
      if (!order) {
        // Order no longer exists — skip silently
        return;
      }

      const pickup = order.pickup_address;
      const delivery = order.delivery_address;

      // 2. Build a simple two-point polyline from pickup → delivery
      // Skip if either endpoint is missing GPS coordinates
      if (
        !pickup?.lat ||
        !pickup?.lng ||
        !delivery?.lat ||
        !delivery?.lng
      ) {
        return;
      }

      const polyline: Point[] = [
        { lat: Number(pickup.lat), lng: Number(pickup.lng) },
        { lat: Number(delivery.lat), lng: Number(delivery.lng) },
      ];

      const currentPoint: Point = { lat, lng };

      // 3. Check if the operator has deviated from the route
      if (!isOutsideRoute(currentPoint, polyline, GEOFENCE_THRESHOLD_METERS)) {
        return;
      }

      // 4. Deduplicate alerts via AlertEngine (uses repo.countRecentPanic for panic;
      //    geofence has its own cooldown check via raw SQL before calling engine)
      const countResult = await db.raw<{ rows: Array<{ count: string }> }>(
        `SELECT COUNT(*) AS count
         FROM security_alerts
         WHERE order_id = ?
           AND alert_type = 'geofence_violation'
           AND created_at > NOW() - INTERVAL '${ALERT_COOLDOWN_SECONDS} seconds'`,
        [order_id],
      );

      const recentCount = parseInt(countResult.rows[0]?.count ?? '0', 10);
      if (recentCount > 0) {
        // Alert already raised within the cooldown window — skip
        return;
      }

      // 5. Create the alert through AlertEngine
      //    For the worker, operator_id is used as userId proxy (no real user session)
      await alertEngine.createAlert(
        {
          order_id,
          alert_type: 'geofence_violation',
          location: { lat, lng },
          description: `Operator deviated more than ${GEOFENCE_THRESHOLD_METERS}m from planned route`,
        },
        operator_id, // userId proxy — no JWT in worker context
        operator_id, // operator_id
      );
    },
    { connection },
  );

  worker.on('failed', (_job, err) => {
    console.error('[GeofenceWorker] Job failed:', err.message);
  });

  return worker;
}
