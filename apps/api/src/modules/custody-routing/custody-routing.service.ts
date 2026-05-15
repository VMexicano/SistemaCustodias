import { BusinessError } from '../../shared/errors/business-error.js';
import { haversineDistance, type Point } from '../custody-tracking/geofence.utils.js';
import type { CustodyRoutingRepository } from './custody-routing.repository.js';
import { PLANNABLE_STATUSES, type CustodyRoute, type Waypoint } from './custody-routing.types.js';
import type { Knex } from 'knex';

const AVG_SPEED_KMH = 60;
const METERS_PER_KM = 1000;

interface OrderAddressRow {
  id: string;
  status: string;
  pickup_address: { lat?: number; lng?: number } | null;
  delivery_address: { lat?: number; lng?: number } | null;
}

function computePolylineDistanceKm(points: Point[]): number {
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalMeters += haversineDistance(points[i]!, points[i + 1]!);
  }
  return totalMeters / METERS_PER_KM;
}

export class CustodyRoutingService {
  constructor(
    private readonly repo: CustodyRoutingRepository,
    private readonly db: Knex,
  ) {}

  private async fetchOrderAddresses(orderId: string): Promise<OrderAddressRow> {
    const result = await this.db.raw<{ rows: OrderAddressRow[] }>(
      `SELECT id, status, pickup_address, delivery_address
       FROM custody_orders
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new BusinessError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }
    return row;
  }

  async planRoute(
    orderId: string,
    waypoints: Waypoint[],
  ): Promise<CustodyRoute> {
    const order = await this.fetchOrderAddresses(orderId);

    if (!PLANNABLE_STATUSES.has(order.status)) {
      throw new BusinessError(
        'ORDER_NOT_PLANNABLE',
        `Route can only be planned when order is in: ${[...PLANNABLE_STATUSES].join(', ')}. Current: ${order.status}`,
      );
    }

    // Build the full polyline: pickup → waypoints → delivery
    const pickupPoint: Point | null =
      order.pickup_address?.lat && order.pickup_address?.lng
        ? { lat: order.pickup_address.lat, lng: order.pickup_address.lng }
        : null;

    const deliveryPoint: Point | null =
      order.delivery_address?.lat && order.delivery_address?.lng
        ? { lat: order.delivery_address.lat, lng: order.delivery_address.lng }
        : null;

    const polyline: Point[] = [
      ...(pickupPoint ? [pickupPoint] : []),
      ...waypoints,
      ...(deliveryPoint ? [deliveryPoint] : []),
    ];

    const totalDistanceKm =
      polyline.length >= 2 ? computePolylineDistanceKm(polyline) : null;

    const estimatedDurationMinutes =
      totalDistanceKm !== null
        ? Math.round((totalDistanceKm / AVG_SPEED_KMH) * 60)
        : null;

    return this.repo.upsert({
      orderId,
      waypoints,
      totalDistanceKm,
      estimatedDurationMinutes,
    });
  }

  async getRoute(orderId: string): Promise<CustodyRoute> {
    // Validate order exists first
    await this.fetchOrderAddresses(orderId);

    const route = await this.repo.findByOrderId(orderId);
    if (!route) {
      throw new BusinessError('ROUTE_NOT_FOUND', `No route planned for order ${orderId}`);
    }
    return route;
  }

  async approveRoute(orderId: string, approvedBy: string): Promise<CustodyRoute> {
    // Validate order exists
    await this.fetchOrderAddresses(orderId);

    const updated = await this.repo.approve(orderId, approvedBy);
    if (!updated) {
      throw new BusinessError('ROUTE_NOT_FOUND', `No route planned for order ${orderId}`);
    }
    return updated;
  }

  // Used by geofence worker to get the full planned polyline (with waypoints)
  async getRoutePolyline(orderId: string): Promise<Point[] | null> {
    const route = await this.repo.findByOrderId(orderId);
    if (!route || route.waypoints.length === 0) {
      return null;
    }

    const order = await this.fetchOrderAddresses(orderId);

    const pickupPoint: Point | null =
      order.pickup_address?.lat && order.pickup_address?.lng
        ? { lat: order.pickup_address.lat, lng: order.pickup_address.lng }
        : null;

    const deliveryPoint: Point | null =
      order.delivery_address?.lat && order.delivery_address?.lng
        ? { lat: order.delivery_address.lat, lng: order.delivery_address.lng }
        : null;

    const polyline: Point[] = [
      ...(pickupPoint ? [pickupPoint] : []),
      ...route.waypoints,
      ...(deliveryPoint ? [deliveryPoint] : []),
    ];

    return polyline.length >= 2 ? polyline : null;
  }
}
