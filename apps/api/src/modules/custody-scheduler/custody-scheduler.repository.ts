// ---------------------------------------------------------------------------
// custody-scheduler.repository.ts — queries for custody order reminders
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { ReminderType } from '../custody-notifications/custody-notifications.types.js';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface UpcomingOrderReminder {
  orderId: string;
  clientId: string;
  scheduledAt: Date;
  tenantId: string;
  pendingTypes: ReminderType[];
}

export interface UnassignedOpenOrder {
  orderId: string;
  clientId: string;
  tenantId: string;
  pickupWindowStart: Date;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CustodySchedulerRepository {
  constructor(private readonly db: Knex) {}

  /**
   * Returns orders that have at least one pending reminder in the applicable
   * time window. Uses NOT EXISTS against custody_scheduled_reminders for dedup.
   * Must be called inside a transaction (FOR UPDATE SKIP LOCKED).
   */
  async getOrdersNeedingReminders(trx: Knex.Transaction): Promise<UpcomingOrderReminder[]> {
    const rows = await trx.raw<{
      rows: Array<{
        order_id: string;
        client_id: string;
        scheduled_at: Date;
        tenant_id: string;
        pending_24h: boolean;
        pending_1h: boolean;
        pending_15m: boolean;
      }>;
    }>(
      `
      SELECT co.id        AS order_id,
             co.client_id,
             co.scheduled_at,
             co.tenant_id,
             (co.scheduled_at BETWEEN NOW() + INTERVAL '23 hours 30 minutes'
                              AND     NOW() + INTERVAL '24 hours 30 minutes'
              AND NOT EXISTS (
                SELECT 1 FROM custody_scheduled_reminders
                WHERE order_id = co.id AND reminder_type = 'reminder_24h'
              ))          AS pending_24h,
             (co.scheduled_at BETWEEN NOW() + INTERVAL '50 minutes'
                              AND     NOW() + INTERVAL '70 minutes'
              AND NOT EXISTS (
                SELECT 1 FROM custody_scheduled_reminders
                WHERE order_id = co.id AND reminder_type = 'reminder_1h'
              ))          AS pending_1h,
             (co.scheduled_at BETWEEN NOW() + INTERVAL '10 minutes'
                              AND     NOW() + INTERVAL '20 minutes'
              AND NOT EXISTS (
                SELECT 1 FROM custody_scheduled_reminders
                WHERE order_id = co.id AND reminder_type = 'reminder_15m'
              ))          AS pending_15m
      FROM   custody_orders co
      WHERE  co.deleted_at IS NULL
        AND  co.scheduled_at IS NOT NULL
        AND  co.status NOT IN ('COMPLETED','REJECTED','CANCELLED','RESOLVED','DELIVERY_FAILED','PICKUP_FAILED')
        AND (
              (co.scheduled_at BETWEEN NOW() + INTERVAL '23 hours 30 minutes'
                               AND     NOW() + INTERVAL '24 hours 30 minutes'
               AND NOT EXISTS (SELECT 1 FROM custody_scheduled_reminders
                               WHERE order_id = co.id AND reminder_type = 'reminder_24h'))
           OR (co.scheduled_at BETWEEN NOW() + INTERVAL '50 minutes'
                               AND     NOW() + INTERVAL '70 minutes'
               AND NOT EXISTS (SELECT 1 FROM custody_scheduled_reminders
                               WHERE order_id = co.id AND reminder_type = 'reminder_1h'))
           OR (co.scheduled_at BETWEEN NOW() + INTERVAL '10 minutes'
                               AND     NOW() + INTERVAL '20 minutes'
               AND NOT EXISTS (SELECT 1 FROM custody_scheduled_reminders
                               WHERE order_id = co.id AND reminder_type = 'reminder_15m'))
        )
      ORDER BY co.scheduled_at ASC
      FOR UPDATE OF co SKIP LOCKED
      `,
    );

    return rows.rows
      .filter((r) => r.pending_24h || r.pending_1h || r.pending_15m)
      .map((r) => {
        const pendingTypes: ReminderType[] = [];
        if (r.pending_24h) pendingTypes.push('reminder_24h');
        if (r.pending_1h) pendingTypes.push('reminder_1h');
        if (r.pending_15m) pendingTypes.push('reminder_15m');
        return {
          orderId: r.order_id,
          clientId: r.client_id,
          scheduledAt: r.scheduled_at,
          tenantId: r.tenant_id,
          pendingTypes,
        };
      });
  }

  /**
   * Returns APPROVED orders whose pickup window has opened,
   * have no custodio assigned, and haven't triggered a dispatch alert yet.
   * Must be called inside a transaction (FOR UPDATE SKIP LOCKED).
   */
  async getUnassignedOpenOrders(trx: Knex.Transaction): Promise<UnassignedOpenOrder[]> {
    const rows = await trx.raw<{
      rows: Array<{
        order_id: string;
        client_id: string;
        tenant_id: string;
        pickup_window_start: Date;
      }>;
    }>(
      `
      SELECT co.id                  AS order_id,
             co.client_id,
             co.tenant_id,
             co.pickup_window_start
      FROM   custody_orders co
      WHERE  co.deleted_at IS NULL
        AND  co.status = 'APPROVED'
        AND  co.custodio_id IS NULL
        AND  co.pickup_window_start IS NOT NULL
        AND  co.pickup_window_start <= NOW()
        AND  NOT EXISTS (
               SELECT 1 FROM custody_scheduled_reminders
               WHERE order_id = co.id AND reminder_type = 'dispatch_alert'
             )
      ORDER BY co.pickup_window_start ASC
      FOR UPDATE OF co SKIP LOCKED
      `,
    );

    return rows.rows.map((r) => ({
      orderId: r.order_id,
      clientId: r.client_id,
      tenantId: r.tenant_id,
      pickupWindowStart: r.pickup_window_start,
    }));
  }

  /**
   * Inserts a reminder record. The UNIQUE constraint on (order_id, reminder_type)
   * guarantees idempotency — concurrent ticks cannot insert duplicates.
   * Must be called inside an existing transaction.
   */
  async markReminderSent(
    trx: Knex.Transaction,
    orderId: string,
    reminderType: ReminderType,
  ): Promise<void> {
    await trx('custody_scheduled_reminders')
      .insert({ order_id: orderId, reminder_type: reminderType })
      .onConflict(['order_id', 'reminder_type'])
      .ignore();
  }
}
