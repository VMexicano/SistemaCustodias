// ---------------------------------------------------------------------------
// custody-notifications.service.ts — orchestrates push + SMS delivery
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { INotificationChannel } from '../notifications/notification.channel.interface.js';
import type { ISmsClient } from './sms.client.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { CustodyNotificationsRepository } from './custody-notifications.repository.js';
import type {
  CustodyNotification,
  SendCustodyNotificationPayload,
} from './custody-notifications.types.js';

export class CustodyNotificationService {
  constructor(
    private readonly repo: CustodyNotificationsRepository,
    private readonly pushChannel: INotificationChannel,
    private readonly sms: ISmsClient,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly db: Knex,
  ) {}

  // ---------------------------------------------------------------------------
  // send
  // ---------------------------------------------------------------------------

  async send(payload: SendCustodyNotificationPayload): Promise<CustodyNotification> {
    // 1. Create a pending record
    const notification = await this.repo.create({
      user_id: payload.user_id,
      order_id: payload.order_id ?? null,
      alert_id: payload.alert_id ?? null,
      channel: payload.channel,
      priority: payload.priority,
      status: 'pending',
      title: payload.title,
      body: payload.body,
      sent_at: null,
    });

    let status: CustodyNotification['status'] = 'failed';
    const sentAt = new Date();

    if (payload.channel === 'push') {
      const circuitOpen = await this.circuitBreaker.isOpen();

      if (circuitOpen) {
        // Circuit is open — skip FCM, fall back to SMS
        const smsSent = await this.trySendSms(payload.user_id, payload.body);
        status = smsSent ? 'sent' : 'failed';
      } else {
        try {
          await this.pushChannel.send({
            recipientUserId: payload.user_id,
            type: 'trip_accepted', // dummy type — custody uses title/body directly
            title: payload.title,
            body: payload.body,
          });
          await this.circuitBreaker.recordSuccess();
          status = 'sent';
        } catch {
          // Push failed — record failure and try SMS fallback
          await this.circuitBreaker.recordFailure();
          const smsSent = await this.trySendSms(payload.user_id, payload.body);
          status = smsSent ? 'sent' : 'failed';
        }
      }
    } else {
      // channel === 'sms'
      const smsSent = await this.trySendSms(payload.user_id, payload.body);
      if (smsSent === null) {
        // No phone on record — skip
        status = 'skipped';
      } else {
        status = smsSent ? 'sent' : 'failed';
      }
    }

    // 4. Update record with final status
    await this.repo.updateStatus(notification.id, status, status === 'sent' ? sentAt : undefined);

    return { ...notification, status, sent_at: status === 'sent' ? sentAt.toISOString() : null };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to send SMS for the given userId.
   * Returns:
   *   true  — sent successfully
   *   false — send failed with error
   *   null  — user has no phone on record (skipped)
   */
  private async trySendSms(userId: string, message: string): Promise<boolean | null> {
    const userRow = await this.db('users')
      .where({ id: userId })
      .select('phone')
      .first() as { phone: string | null } | undefined;

    const phone = userRow?.phone;
    if (!phone) {
      return null;
    }

    try {
      await this.sms.send(phone, message);
      return true;
    } catch {
      return false;
    }
  }
}
