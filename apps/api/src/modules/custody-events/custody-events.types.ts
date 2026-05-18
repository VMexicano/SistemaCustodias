// ---------------------------------------------------------------------------
// custody-events.types.ts — domain types for the event envelope module
// ---------------------------------------------------------------------------

export type OrderEventActorRole = 'custodio' | 'copiloto' | 'supervisor' | 'system';

export interface EventCatalogRow {
  id: string;
  vertical_slug: string;
  code: string;
  label: string;
  requires_photo: boolean;
  requires_audio: boolean;
  requires_signature: boolean;
  payload_schema: Record<string, unknown>;
  interval_minutes: number | null;
  active: boolean;
}

export interface EventCatalogDTO {
  code: string;
  label: string;
  requiresPhoto: boolean;
  requiresAudio: boolean;
  requiresSignature: boolean;
  payloadSchema: Record<string, unknown>;
  intervalMinutes: number | null;
}

export interface EventLocation {
  lat: number;
  long: number;
  accuracy_meters: number;
  speed_kmh?: number;
  heading_degrees?: number;
  provider: 'gps' | 'network' | 'fused';
}

export interface EventEvidence {
  photos?: { url: string; hash: string; taken_at: string }[];
  audio?: { url: string; duration_seconds: number; hash: string };
  signature?: { data: string; algorithm: 'HMAC-SHA256'; signed_by: string };
}

export interface EventDevice {
  battery_percent: number;
  signal_strength: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  app_version: string;
  os: 'ios' | 'android';
  mock_location_detected: boolean;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  tenant_id: string;
  event_type: string;
  sequence_no: number;
  actor_id: string | null;
  actor_role: OrderEventActorRole;
  app_timestamp: Date;
  auto_timestamp: Date | null;
  location: EventLocation;
  evidence: EventEvidence | null;
  payload: Record<string, unknown>;
  device: EventDevice;
  integrity_hash: string;
  created_at: Date;
}

export interface CreateCustodyEventPayload {
  event_type: string;
  actor_role: OrderEventActorRole;
  app_timestamp: string; // ISO 8601
  location: EventLocation;
  evidence?: EventEvidence;
  payload: Record<string, unknown>;
  device: EventDevice;
}

export interface OrderEventDTO {
  id: string;
  orderId: string;
  eventType: string;
  sequenceNo: number;
  actorRole: OrderEventActorRole;
  appTimestamp: string;
  location: EventLocation;
  payload: Record<string, unknown>;
  device: Pick<EventDevice, 'signal_strength'>;
  integrityHash: string;
  createdAt: string;
  evidence?: EventEvidence; // only for supervisor/dispatcher
}
