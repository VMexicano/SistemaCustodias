// ---------------------------------------------------------------------------
// custody-notifications.types.ts — domain types for the custody-notifications module
// ---------------------------------------------------------------------------

export type NotificationChannel = 'push' | 'sms';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface CustodyNotification {
  id: string;
  user_id: string;
  order_id: string | null;
  alert_id: string | null;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  body: string;
  sent_at: string | null;
  created_at: string;
}

export interface SendCustodyNotificationPayload {
  user_id: string;
  order_id?: string;
  alert_id?: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  body: string;
}

export interface NotifyOrderTransitionPayload {
  order_id: string;
  to_status: string;
  client_id: string | null;
  custodio_id: string | null;
  copiloto_id: string | null;
  tenant_id: string;
}

export interface NotifyAlertPayload {
  alert_id: string;
  order_id: string;
  alert_type: string;
  severity: string;
  tenant_id: string;
}

export type ReminderType = 'reminder_24h' | 'reminder_1h' | 'reminder_15m' | 'dispatch_alert';

export interface NotifyReminderPayload {
  order_id: string;
  reminder_type: ReminderType;
  client_id: string;
  tenant_id: string;
}

export type CustodyNotificationJobData =
  | { type: 'order-transition'; payload: NotifyOrderTransitionPayload }
  | { type: 'alert'; payload: NotifyAlertPayload }
  | { type: 'reminder'; payload: NotifyReminderPayload };
