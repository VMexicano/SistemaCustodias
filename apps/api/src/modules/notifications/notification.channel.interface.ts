/**
 * INotificationChannel — abstraction for push notification delivery (ADR-028).
 *
 * Implementations:
 *  - LogNotificationChannel → development/test (console.log)
 *  - FCMNotificationChannel → production (Firebase Admin SDK)
 *
 * Selection is controlled by NOTIFICATION_PROVIDER env variable
 * and handled in app.ts — never inside this interface.
 */

export type NotificationType =
  | 'trip_accepted'
  | 'driver_arrived'
  | 'trip_started'
  | 'trip_completed'
  | 'payment_processed'
  | 'payment_failed'
  | 'trip_reminder_24h'
  | 'trip_reminder_1h'
  | 'trip_reminder_15m'
  | 'scheduled_trip_searching'
  | 'trip_scheduled_accepted';

export interface NotificationPayload {
  /** user_id of the recipient (used to look up FCM token). */
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Extra data forwarded to the device (tripId, amount, etc.). */
  data?: Record<string, string>;
}

export interface INotificationChannel {
  send(payload: NotificationPayload): Promise<void>;
}
