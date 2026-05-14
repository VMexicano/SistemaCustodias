/**
 * custody-scheduler.service.test.ts — unit tests for CustodySchedulerService
 *
 * Target: ≥ 90% lines / ≥ 85% branches
 *
 * Mocks: db.transaction, repo, notificationsQueue, node-cron
 * No database or external I/O required.
 */

import type { Knex } from 'knex';
import type { Queue } from 'bullmq';
import { CustodySchedulerService } from '../../modules/custody-scheduler/custody-scheduler.service.js';
import type { CustodySchedulerRepository, UpcomingOrderReminder, UnassignedOpenOrder } from '../../modules/custody-scheduler/custody-scheduler.repository.js';
import type { CustodyNotificationJobData, ReminderType } from '../../modules/custody-notifications/custody-notifications.types.js';

// ---------------------------------------------------------------------------
// Mock node-cron so start() doesn't spin up a real timer
// ---------------------------------------------------------------------------

jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeReminder(overrides: Partial<UpcomingOrderReminder> = {}): UpcomingOrderReminder {
  return {
    orderId: 'order-1',
    clientId: 'client-1',
    scheduledAt: new Date('2026-05-15T10:00:00Z'),
    tenantId: 'tenant-1',
    pendingTypes: ['reminder_24h'],
    ...overrides,
  };
}

function makeOpenOrder(overrides: Partial<UnassignedOpenOrder> = {}): UnassignedOpenOrder {
  return {
    orderId: 'order-2',
    clientId: 'client-2',
    tenantId: 'tenant-1',
    pickupWindowStart: new Date('2026-05-15T09:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRepo(
  reminders: UpcomingOrderReminder[] = [],
  openOrders: UnassignedOpenOrder[] = [],
): jest.Mocked<CustodySchedulerRepository> {
  return {
    getOrdersNeedingReminders: jest.fn().mockResolvedValue(reminders),
    getUnassignedOpenOrders: jest.fn().mockResolvedValue(openOrders),
    markReminderSent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CustodySchedulerRepository>;
}

function makeQueue(shouldFail = false): jest.Mocked<Queue<CustodyNotificationJobData>> {
  return {
    add: jest.fn().mockImplementation(() =>
      shouldFail ? Promise.reject(new Error('queue_unavailable')) : Promise.resolve({ id: 'job-1' }),
    ),
  } as unknown as jest.Mocked<Queue<CustodyNotificationJobData>>;
}

function makeDb(repo: jest.Mocked<CustodySchedulerRepository>): Knex {
  const mockTrx = {} as Knex.Transaction;
  const transaction = jest.fn().mockImplementation(async (callback: (trx: Knex.Transaction) => Promise<void>) => {
    await callback(mockTrx);
  });
  return { transaction } as unknown as Knex;
}

// ---------------------------------------------------------------------------
// Build service helper
// ---------------------------------------------------------------------------

function buildService(
  repo: jest.Mocked<CustodySchedulerRepository>,
  queue: jest.Mocked<Queue<CustodyNotificationJobData>>,
  db: Knex,
) {
  return new CustodySchedulerService(db, repo, queue);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustodySchedulerService', () => {
  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // scanUpcomingReminders
  // -------------------------------------------------------------------------

  describe('scanUpcomingReminders()', () => {
    it('enqueues a reminder notification for each pending reminder type', async () => {
      const reminder = makeReminder({ pendingTypes: ['reminder_24h'] });
      const repo = makeRepo([reminder]);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanUpcomingReminders();

      expect(repo.markReminderSent).toHaveBeenCalledWith(
        expect.anything(),
        'order-1',
        'reminder_24h',
      );
      expect(queue.add).toHaveBeenCalledWith('reminder', {
        type: 'reminder',
        payload: {
          order_id: 'order-1',
          reminder_type: 'reminder_24h',
          client_id: 'client-1',
          tenant_id: 'tenant-1',
        },
      });
    });

    it('handles multiple pending reminder types for the same order', async () => {
      const reminder = makeReminder({ pendingTypes: ['reminder_24h', 'reminder_1h', 'reminder_15m'] });
      const repo = makeRepo([reminder]);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanUpcomingReminders();

      expect(repo.markReminderSent).toHaveBeenCalledTimes(3);
      expect(queue.add).toHaveBeenCalledTimes(3);
    });

    it('does nothing when no orders need reminders', async () => {
      const repo = makeRepo([]);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanUpcomingReminders();

      expect(repo.markReminderSent).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('marks reminder sent BEFORE enqueue (dedup-first pattern)', async () => {
      const callOrder: string[] = [];
      const reminder = makeReminder({ pendingTypes: ['reminder_1h'] });
      const repo = makeRepo([reminder]);
      repo.markReminderSent.mockImplementation(async () => { callOrder.push('markSent'); });
      const queue = makeQueue();
      queue.add.mockImplementation(async () => { callOrder.push('enqueue'); return { id: 'job-1' } as any; });
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanUpcomingReminders();

      expect(callOrder).toEqual(['markSent', 'enqueue']);
    });

    it('does not throw when enqueue fails — continues silently', async () => {
      const reminder = makeReminder({ pendingTypes: ['reminder_15m'] });
      const repo = makeRepo([reminder]);
      const queue = makeQueue(true);
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await expect(service.scanUpcomingReminders()).resolves.toBeUndefined();
      expect(repo.markReminderSent).toHaveBeenCalled();
    });

    it('processes multiple orders in a single tick', async () => {
      const reminders = [
        makeReminder({ orderId: 'order-A', pendingTypes: ['reminder_24h'] }),
        makeReminder({ orderId: 'order-B', pendingTypes: ['reminder_1h'] }),
      ];
      const repo = makeRepo(reminders);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanUpcomingReminders();

      expect(repo.markReminderSent).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // scanDispatchAlerts
  // -------------------------------------------------------------------------

  describe('scanDispatchAlerts()', () => {
    it('enqueues a dispatch_alert notification for each unassigned open order', async () => {
      const openOrder = makeOpenOrder();
      const repo = makeRepo([], [openOrder]);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanDispatchAlerts();

      expect(repo.markReminderSent).toHaveBeenCalledWith(
        expect.anything(),
        'order-2',
        'dispatch_alert',
      );
      expect(queue.add).toHaveBeenCalledWith('dispatch-alert', {
        type: 'reminder',
        payload: {
          order_id: 'order-2',
          reminder_type: 'dispatch_alert',
          client_id: 'client-2',
          tenant_id: 'tenant-1',
        },
      });
    });

    it('does nothing when no unassigned open orders exist', async () => {
      const repo = makeRepo([], []);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanDispatchAlerts();

      expect(repo.markReminderSent).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('does not throw when enqueue fails', async () => {
      const openOrder = makeOpenOrder();
      const repo = makeRepo([], [openOrder]);
      const queue = makeQueue(true);
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await expect(service.scanDispatchAlerts()).resolves.toBeUndefined();
      expect(repo.markReminderSent).toHaveBeenCalled();
    });

    it('processes multiple open orders in a single tick', async () => {
      const openOrders = [
        makeOpenOrder({ orderId: 'order-X' }),
        makeOpenOrder({ orderId: 'order-Y' }),
      ];
      const repo = makeRepo([], openOrders);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      await service.scanDispatchAlerts();

      expect(repo.markReminderSent).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // start / stop lifecycle
  // -------------------------------------------------------------------------

  describe('start() / stop()', () => {
    it('starts the cron and registers it internally', () => {
      const cron = require('node-cron') as { schedule: jest.Mock };
      const repo = makeRepo();
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      service.start();

      expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
    });

    it('stop() calls stop on the cron task and does not throw', () => {
      const mockStop = jest.fn();
      const cron = require('node-cron') as { schedule: jest.Mock };
      cron.schedule.mockReturnValueOnce({ stop: mockStop });

      const repo = makeRepo();
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      service.start();
      service.stop();

      expect(mockStop).toHaveBeenCalled();
    });

    it('stop() does not throw when called before start()', () => {
      const repo = makeRepo();
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);

      expect(() => service.stop()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // tick() — called by the cron callback
  // -------------------------------------------------------------------------

  describe('tick() via cron callback', () => {
    it('executes both scan tasks when the cron fires', async () => {
      let capturedCallback: (() => void) | null = null;
      const cron = require('node-cron') as { schedule: jest.Mock };
      cron.schedule.mockImplementationOnce((_expr: string, callback: () => void) => {
        capturedCallback = callback;
        return { stop: jest.fn() };
      });

      const reminder = makeReminder({ pendingTypes: ['reminder_1h'] });
      const openOrder = makeOpenOrder();
      const repo = makeRepo([reminder], [openOrder]);
      const queue = makeQueue();
      const db = makeDb(repo);
      const service = buildService(repo, queue, db);
      service.start();

      capturedCallback!();
      // Allow the async tick to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(repo.getOrdersNeedingReminders).toHaveBeenCalled();
      expect(repo.getUnassignedOpenOrders).toHaveBeenCalled();
    });

    it('swallows uncaught errors inside tick without crashing the cron', async () => {
      let capturedCallback: (() => void) | null = null;
      const cron = require('node-cron') as { schedule: jest.Mock };
      cron.schedule.mockImplementationOnce((_expr: string, callback: () => void) => {
        capturedCallback = callback;
        return { stop: jest.fn() };
      });

      const repo = makeRepo();
      // Make transaction throw to exercise the catch branch in tick()
      const db = {
        transaction: jest.fn().mockRejectedValue(new Error('db_crash')),
      } as unknown as Knex;
      const queue = makeQueue();
      const service = buildService(repo, queue, db);
      service.start();

      capturedCallback!();
      await new Promise((r) => setTimeout(r, 50));

      // No unhandled rejection — test simply passes
    });
  });
});
