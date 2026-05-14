// ---------------------------------------------------------------------------
// custody-tracking.types.ts — domain types for the custody tracking module
// ---------------------------------------------------------------------------

export interface LocationReading {
  time: string;
  order_id: string;
  operator_id: string;
  vehicle_id: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  accuracy_m: number | null;
  heading: number | null;
}

export interface CreateLocationPayload {
  order_id: string;
  lat: number;
  lng: number;
  speed_kmh?: number;
  accuracy_m?: number;
  heading?: number;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  timestamp: string;
}

export interface LocationHistoryQuery {
  limit?: number;
  from?: string;
  to?: string;
}

export interface RecordLocationResult {
  recorded: true;
  order_id: string;
  timestamp: string;
}

export interface CurrentLocationResult {
  order_id: string;
  operator_id: string;
  point: LocationPoint;
}

export interface LocationHistoryResult {
  order_id: string;
  points: LocationPoint[];
  count: number;
}

export interface InsertReadingData {
  order_id: string;
  operator_id: string;
  vehicle_id: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  accuracy_m: number | null;
  heading: number | null;
}
