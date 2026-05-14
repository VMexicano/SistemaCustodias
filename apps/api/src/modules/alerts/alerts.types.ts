// ---------------------------------------------------------------------------
// alerts.types.ts — shared types for the security alerts module
// ---------------------------------------------------------------------------

export type AlertType =
  | 'panic'
  | 'tamper'
  | 'geofence_violation'
  | 'communication_loss'
  | 'custom';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityAlert {
  id: string;
  order_id: string;
  operator_id: string;
  alert_type: AlertType;
  severity: Severity;
  location: { lat: number; lng: number } | null;
  description: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CreateAlertPayload {
  order_id: string;
  alert_type: AlertType;
  location?: { lat: number; lng: number };
  description?: string;
}

export interface AlertsFilter {
  order_id?: string;
  operator_id?: string;
  alert_type?: AlertType;
  severity?: Severity;
  resolved?: boolean;
}
