export interface Waypoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface CustodyRoute {
  id: string;
  orderId: string;
  waypoints: Waypoint[];
  totalDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRouteInput {
  orderId: string;
  waypoints: Waypoint[];
}

// States where a route plan can be created or updated
export const PLANNABLE_STATUSES = new Set([
  'APPROVED',
  'ASSIGNED',
  'REASSIGNED',
  'CREW_CONFIRMED',
]);
