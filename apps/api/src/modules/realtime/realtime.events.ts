import type { Server } from 'socket.io';
import type { TripStatus } from '../trips/trips.types.js';
import type {
  DriverSummary,
  TripStatusChangedPayload,
  TripRequestedPayload,
  TripCancelledPayload,
  DestinationChangedPayload,
} from './realtime.types.js';

// ---------------------------------------------------------------------------
// Emit helpers — called from TripsService OUTSIDE DB transactions
// ---------------------------------------------------------------------------

/**
 * Emit trip:status_changed to all sockets in the trip room (passenger + driver).
 */
export function emitTripStatusChanged(
  io: Server,
  tripId: string,
  status: TripStatus,
  driver?: DriverSummary,
): void {
  const payload: TripStatusChangedPayload = { trip_id: tripId, status, driver };
  io.of('/passenger').to(`trip:${tripId}`).emit('trip:status_changed', payload);
}

/**
 * Emit trip:requested to all connected drivers.
 * Each driver in the /driver namespace receives the new trip broadcast.
 */
export function emitTripRequested(
  io: Server,
  _tripId: string,
  data: TripRequestedPayload,
): void {
  io.of('/driver').emit('trip:requested', data);
}

/**
 * Emit trip:cancelled to the driver(s) in the trip room.
 */
export function emitTripCancelled(
  io: Server,
  tripId: string,
  reason: string,
): void {
  const payload: TripCancelledPayload = { trip_id: tripId, reason };
  io.of('/driver').to(`trip:${tripId}`).emit('trip:cancelled', payload);
}

/**
 * Emit trip:destination_changed to the driver in the trip room.
 */
export function emitDestinationChanged(
  io: Server,
  tripId: string,
  data: DestinationChangedPayload,
): void {
  io.of('/driver').to(`trip:${tripId}`).emit('trip:destination_changed', data);
  // Also notify passenger namespace for consistency
  io.of('/passenger').to(`trip:${tripId}`).emit('trip:destination_changed', data);
}
