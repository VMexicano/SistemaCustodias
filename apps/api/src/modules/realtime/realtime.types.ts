import type { TripStatus } from '../trips/trips.types.js';

// ---------------------------------------------------------------------------
// Payloads — /passenger namespace (server → client)
// ---------------------------------------------------------------------------

export interface DriverSummary {
  id: string;
  full_name: string;
  vehicle: string;
  rating_avg: number;
}

export interface TripStatusChangedPayload {
  trip_id: string;
  status: TripStatus;
  driver?: DriverSummary;
}

export interface DriverLocationPayload {
  trip_id: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface DestinationChangedPayload {
  trip_id: string;
  new_destination: {
    lat: number;
    lng: number;
    address: string;
  };
  new_estimated_fare: number;
}

// ---------------------------------------------------------------------------
// Payloads — /driver namespace (server → client)
// ---------------------------------------------------------------------------

export interface TripRequestedPayload {
  id: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistanceKm: number;
  estimatedTotal: number;
  passengerId: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

export interface TripCancelledPayload {
  trip_id: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Payloads — /driver namespace (client → server)
// ---------------------------------------------------------------------------

export interface LocationUpdatePayload {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Socket data attached after JWT auth middleware
// ---------------------------------------------------------------------------

export interface SocketData {
  userId: string;
  roles: string[];
}
