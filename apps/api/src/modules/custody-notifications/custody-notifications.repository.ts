// ---------------------------------------------------------------------------
// custody-notifications.repository.ts — data access for notifications table
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { CustodyNotification, NotificationStatus } from './custody-notifications.types.js';

export class CustodyNotificationsRepository {
  constructor(private readonly db: Knex) {}

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(
    data: Omit<CustodyNotification, 'id' | 'created_at'>,
  ): Promise<CustodyNotification> {
    const [row] = await this.db('notifications')
      .insert({
        user_id: data.user_id,
        order_id: data.order_id ?? null,
        alert_id: data.alert_id ?? null,
        channel: data.channel,
        priority: data.priority,
        status: data.status,
        title: data.title,
        body: data.body,
        sent_at: data.sent_at ?? null,
      })
      .returning('*');

    return row as CustodyNotification;
  }

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------

  async updateStatus(
    id: string,
    status: NotificationStatus,
    sent_at?: Date,
  ): Promise<void> {
    await this.db('notifications')
      .where({ id })
      .update({
        status,
        ...(sent_at !== undefined ? { sent_at: sent_at.toISOString() } : {}),
      });
  }

  // ---------------------------------------------------------------------------
  // findByOrderId
  // ---------------------------------------------------------------------------

  async findByOrderId(orderId: string): Promise<CustodyNotification[]> {
    const rows = await this.db('notifications')
      .where({ order_id: orderId })
      .orderBy('created_at', 'desc')
      .select('*');

    return rows as CustodyNotification[];
  }
}
