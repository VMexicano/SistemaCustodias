import type { Knex } from 'knex';
import type { INotificationChannel, NotificationPayload } from './notification.channel.interface.js';

/**
 * FCMNotificationChannel — production push notification delivery via Firebase.
 *
 * Activated when NOTIFICATION_PROVIDER=fcm.
 * Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars.
 *
 * FCM tokens are registered from the mobile app via POST /users/me/device-token (Sprint 7).
 * If no token is found for a user, a warning is logged and no error is thrown.
 */
export class FCMNotificationChannel implements INotificationChannel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly messaging: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    firebaseApp: any,
    private readonly db?: Knex,
  ) {
    const admin = firebaseApp;
    this.messaging = admin.messaging();
  }

  async send(payload: NotificationPayload): Promise<void> {
    const fcmToken = await this.getDeviceToken(payload.recipientUserId);
    if (!fcmToken) {
      console.warn('[FCM] no device token for user', payload.recipientUserId, '— skipping push');
      return;
    }

    await this.messaging.send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
  }

  private async getDeviceToken(userId: string): Promise<string | null> {
    if (!this.db) return null;

    const record = await this.db('device_tokens')
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc')
      .first<{ token: string } | undefined>('token');

    return record?.token ?? null;
  }
}
