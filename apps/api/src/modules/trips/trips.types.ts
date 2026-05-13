export type TripStatus =
  | 'SCHEDULED'
  | 'REQUESTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripActor = 'system' | 'driver' | 'passenger' | 'dispatcher';

export interface Trip {
  id: string;
  region_id: string;
  passenger_id: string;
  driver_id: string | null;
  trip_type_id: string;
  status: TripStatus;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  estimated_distance_km: number | null;
  estimated_duration_min: number | null;
  estimated_fare: number | null;
  actual_distance_km: number | null;
  actual_duration_min: number | null;
  final_fare: number | null;
  pricing_snapshot: unknown | null;
  accepted_at: Date | null;
  approved_at: Date | null;
  approved_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface TripStatusHistory {
  id: string;
  trip_id: string;
  from_status: TripStatus | null;
  to_status: TripStatus;
  changed_by: string | null; // actor_id (null for system actor)
  actor_type: TripActor;
  notes: string | null;
  created_at: Date;
}

export interface TransitionResult {
  success: true;
  newStatus: TripStatus;
  cancellationFee: number;
  historyEntry: Omit<TripStatusHistory, 'id' | 'created_at'>;
}
