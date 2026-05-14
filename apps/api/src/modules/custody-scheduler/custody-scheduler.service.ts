// ---------------------------------------------------------------------------
// custody-scheduler.service.ts — cron-based reminders + dispatch alerts
//
// Runs every minute. Two tasks per tick:
//   1. scanUpcomingReminders  — sends 24h / 1h / 15m reminders to clients
//   2. scanDispatchAlerts     — alerts dispatchers when an APPROVED order's
//                               pickup window has opened with no crew assigned
//
// SELECT FOR UPDATE SKIP LOCKED prevents double-processing under concurrent
// API instances (same pattern as SchedulerService UBER_BASE — ADR-025).
// Side effects (BullMQ enqueue) run OUTSIDE transactions (ADR-003).
// ---------------------------------------------------------------------------

import cron from 'node-cron';
import type { Knex } from 'knex';
import type { Queue } from 'bullmq';
import type { CustodySchedulerRepository } from './custody-scheduler.repository.js';
import type {
  CustodyNotificationJobData,
  ReminderType,
} from '../custody-notifications/custody-notifications.types.js';

export class CustodySchedulerService {
  private cronTask: ReturnType<typeof cron.schedule> | null = null;

  constructor(
    private readonly db: Knex,
    private readonly repo: CustodySchedulerRepository,
    private readonly notificationsQueue: Queue<CustodyNotificationJobData>,
  ) {}

  start(): void {
    this.cronTask = cron.schedule('* * * * *', () => {
      void this.tick();
    });
    console.info('[custody-scheduler] started — cron every minute');
  }

  stop(): void {
    this.cronTask?.stop();
    this.cronTask = null;
  }

  private async tick(): Promise<void> {
    try {
      await Promise.all([
        this.scanUpcomingReminders(),
        this.scanDispatchAlerts(),
      ]);
    } catch (err) {
      console.error('[custody-scheduler] tick error:', err);
    }
  }

  // --------------------------------------------------------------------------
  // Task 1: Send 24h / 1h / 15m reminders to clients for upcoming orders
  // --------------------------------------------------------------------------

  async scanUpcomingReminders(): Promise<void> {
    const toEnqueue: Array<{ orderId: string; clientId: string; tenantId: string; type: ReminderType }> = [];

    await this.db.transaction(async (trx) => {
      const orders = await this.repo.getOrdersNeedingReminders(trx);

      for (const order of orders) {
        for (const reminderType of order.pendingTypes) {
          // Mark BEFORE enqueue — if enqueue fails, the reminder won't be re-sent
          // (preferred: no duplicate push > one missed push in failure scenario)
          await this.repo.markReminderSent(trx, order.orderId, reminderType);
          toEnqueue.push({
            orderId: order.orderId,
            clientId: order.clientId,
            tenantId: order.tenantId,
            type: reminderType,
          });
        }
      }
    });

    // Enqueue OUTSIDE the transaction
    for (const item of toEnqueue) {
      await this.notificationsQueue
        .add('reminder', {
          type: 'reminder',
          payload: {
            order_id: item.orderId,
            reminder_type: item.type,
            client_id: item.clientId,
            tenant_id: item.tenantId,
          },
        })
        .catch((err: Error) => {
          console.error(
            `[custody-scheduler] failed to enqueue reminder ${item.type} for order=${item.orderId}:`,
            err.message,
          );
        });
    }
  }

  // --------------------------------------------------------------------------
  // Task 2: Alert dispatchers when pickup window opens with no crew assigned
  // --------------------------------------------------------------------------

  async scanDispatchAlerts(): Promise<void> {
    const toEnqueue: Array<{ orderId: string; clientId: string; tenantId: string }> = [];

    await this.db.transaction(async (trx) => {
      const orders = await this.repo.getUnassignedOpenOrders(trx);

      for (const order of orders) {
        await this.repo.markReminderSent(trx, order.orderId, 'dispatch_alert');
        toEnqueue.push({
          orderId: order.orderId,
          clientId: order.clientId,
          tenantId: order.tenantId,
        });
      }
    });

    for (const item of toEnqueue) {
      await this.notificationsQueue
        .add('dispatch-alert', {
          type: 'reminder',
          payload: {
            order_id: item.orderId,
            reminder_type: 'dispatch_alert',
            client_id: item.clientId,
            tenant_id: item.tenantId,
          },
        })
        .catch((err: Error) => {
          console.error(
            `[custody-scheduler] failed to enqueue dispatch_alert for order=${item.orderId}:`,
            err.message,
          );
        });
    }
  }
}
