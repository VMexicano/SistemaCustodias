import type { INotificationChannel, NotificationPayload } from './notification.channel.interface.js';

/**
 * LogNotificationChannel — development/test notification delivery.
 *
 * Prints the full notification payload to stdout.
 * Never use in production: no push is actually sent.
 *
 * Activated when NOTIFICATION_PROVIDER=log (default in dev/test).
 */
export class LogNotificationChannel implements INotificationChannel {
  async send(payload: NotificationPayload): Promise<void> {
    console.log('[NOTIFICATION]', JSON.stringify(payload, null, 2));
  }
}
