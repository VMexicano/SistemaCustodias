// ---------------------------------------------------------------------------
// custody-tracking.service.ts — business logic for GPS location recording
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import type { Namespace } from 'socket.io';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { CustodyTrackingRepository } from './custody-tracking.repository.js';
import type {
  CreateLocationPayload,
  LocationHistoryQuery,
  RecordLocationResult,
  CurrentLocationResult,
  LocationHistoryResult,
  LocationPoint,
} from './custody-tracking.types.js';

// Statuses that allow GPS recording
const TRACKABLE_STATUSES = new Set(['EN_ROUTE_TO_PICKUP', 'IN_TRANSIT']);

export class CustodyTrackingService {
  private io?: Namespace;

  constructor(
    private readonly repo: CustodyTrackingRepository,
    private readonly db: Knex,
    private readonly redis: Redis,
    private readonly geofenceQueue: Queue,
    io?: Namespace,
  ) {
    if (io) {
      this.io = io;
    }
  }

  /**
   * Inject Socket.io namespace after construction (decouples from plugin init order).
   */
  setIo(io: Namespace): void {
    this.io = io;
  }

  // ---------------------------------------------------------------------------
  // recordLocation
  // ---------------------------------------------------------------------------

  async recordLocation(
    userId: string,
    dto: CreateLocationPayload,
  ): Promise<RecordLocationResult> {
    // 1. Verify order exists and is not deleted
    const orderRows = await this.db.raw<{
      rows: Array<{
        id: string;
        status: string;
        custodio_id: string | null;
        copiloto_id: string | null;
      }>;
    }>(
      `SELECT id, status, custodio_id, copiloto_id
       FROM custody_orders
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [dto.order_id],
    );

    const order = orderRows.rows[0];
    if (!order) {
      throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
    }

    // 2. Check order is in a trackable state
    if (!TRACKABLE_STATUSES.has(order.status)) {
      throw new BusinessError(
        'ORDER_NOT_TRACKABLE',
        `Order is not trackable in status ${order.status}`,
      );
    }

    // 3. Resolve operator from user_id
    const operatorRows = await this.db.raw<{
      rows: Array<{ id: string; vehicle_id: string | null }>;
    }>(
      `SELECT id, vehicle_id
       FROM operators
       WHERE user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [userId],
    );

    const operator = operatorRows.rows[0];
    if (!operator) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Caller has no operator profile');
    }

    // 4. Ensure operator is assigned to this order
    if (
      order.custodio_id !== operator.id &&
      order.copiloto_id !== operator.id
    ) {
      throw new BusinessError(
        'OPERATOR_NOT_ASSIGNED',
        'You are not assigned to this order',
      );
    }

    // 5. Persist to location_readings
    await this.repo.insertReading({
      order_id: dto.order_id,
      operator_id: operator.id,
      vehicle_id: operator.vehicle_id ?? null,
      lat: dto.lat,
      lng: dto.lng,
      speed_kmh: dto.speed_kmh ?? null,
      accuracy_m: dto.accuracy_m ?? null,
      heading: dto.heading ?? null,
    });

    const timestamp = new Date().toISOString();

    // 6. Broadcast via Socket.io (optional — does not block if io is absent)
    this.io
      ?.to(`order:${dto.order_id}`)
      .emit('location:updated', {
        order_id: dto.order_id,
        operator_id: operator.id,
        lat: dto.lat,
        lng: dto.lng,
        speed_kmh: dto.speed_kmh ?? null,
        heading: dto.heading ?? null,
        timestamp,
      });

    // 7. Enqueue geofence check (fire-and-forget, side effect outside transaction)
    await this.geofenceQueue.add('geofence-check', {
      order_id: dto.order_id,
      lat: dto.lat,
      lng: dto.lng,
      operator_id: operator.id,
    });

    return { recorded: true, order_id: dto.order_id, timestamp };
  }

  // ---------------------------------------------------------------------------
  // getCurrentLocation
  // ---------------------------------------------------------------------------

  async getCurrentLocation(orderId: string): Promise<CurrentLocationResult> {
    const reading = await this.repo.getCurrentLocation(orderId);

    if (!reading) {
      throw new BusinessError(
        'NO_LOCATION_DATA',
        'No location data found for this order',
      );
    }

    const point: LocationPoint = {
      lat: Number(reading.lat),
      lng: Number(reading.lng),
      speed_kmh: reading.speed_kmh !== null ? Number(reading.speed_kmh) : null,
      heading: reading.heading !== null ? Number(reading.heading) : null,
      timestamp:
        typeof reading.time === 'string'
          ? reading.time
          : (reading.time as unknown as Date).toISOString(),
    };

    return {
      order_id: orderId,
      operator_id: reading.operator_id,
      point,
    };
  }

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------

  async getHistory(
    orderId: string,
    query: LocationHistoryQuery,
  ): Promise<LocationHistoryResult> {
    const readings = await this.repo.getHistory(orderId, query);

    const points: LocationPoint[] = readings.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      speed_kmh: r.speed_kmh !== null ? Number(r.speed_kmh) : null,
      heading: r.heading !== null ? Number(r.heading) : null,
      timestamp:
        typeof r.time === 'string'
          ? r.time
          : (r.time as unknown as Date).toISOString(),
    }));

    return {
      order_id: orderId,
      points,
      count: points.length,
    };
  }
}
