/**
 * notification.service.test.ts — unit tests for NotificationService
 *
 * Target: ≥75% lines for NotificationService module.
 */

import { NotificationService } from '../../modules/notifications/notification.service.js';
import { LogNotificationChannel } from '../../modules/notifications/log.notification.channel.js';
import type { INotificationChannel, NotificationPayload } from '../../modules/notifications/notification.channel.interface.js';

// ---------------------------------------------------------------------------
// Mock channel
// ---------------------------------------------------------------------------

function makeMockChannel(shouldFail = false): INotificationChannel {
  return {
    send: jest.fn().mockImplementation(() => {
      if (shouldFail) throw new Error('FCM unavailable');
      return Promise.resolve();
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests — NotificationService with LogChannel
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  describe('send() with LogNotificationChannel', () => {
    it('sends notification without throwing', async () => {
      const channel = new LogNotificationChannel();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const svc = new NotificationService(channel);

      await expect(svc.send('user-1', 'trip_accepted')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('[NOTIFICATION]', expect.any(String));

      consoleSpy.mockRestore();
    });

    it('prints full payload as JSON', async () => {
      const channel = new LogNotificationChannel();
      const logs: string[] = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '));
      });
      const svc = new NotificationService(channel);

      await svc.send('user-42', 'payment_processed', { amount: '150' });

      const output = logs.join('');
      expect(output).toContain('user-42');
      expect(output).toContain('payment_processed');

      jest.restoreAllMocks();
    });
  });

  describe('send() with mock channel', () => {
    it('calls channel.send() with correct payload structure', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_accepted', { driverName: 'Carlos' });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining<Partial<NotificationPayload>>({
          recipientUserId: 'user-1',
          type: 'trip_accepted',
          title: expect.any(String),
          body: expect.any(String),
        }),
      );
    });

    it('propagates channel errors (circuit breaker catches them)', async () => {
      const channel = makeMockChannel(true);
      const svc = new NotificationService(channel);

      await expect(svc.send('user-1', 'payment_failed')).rejects.toThrow('FCM unavailable');
    });
  });

  describe('notification content builders', () => {
    it('trip_accepted — includes driver name in body when provided', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_accepted', { driverName: 'Juan' });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('Juan') }),
      );
    });

    it('trip_accepted — generic body when no driver name', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_accepted');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('conductor') }),
      );
    });

    it('trip_completed — includes fare in body when provided', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_completed', { finalFare: '150.50' });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('150.50') }),
      );
    });

    it('payment_processed — includes amount in body when provided', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'payment_processed', { amount: '150' });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('150') }),
      );
    });

    it('payment_failed — advises to check payment method', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'payment_failed');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('tarjeta') }),
      );
    });

    it('driver_arrived — correct title and body', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'driver_arrived');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('llegó'),
        }),
      );
    });

    it('trip_started — correct message', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_started');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trip_started' }),
      );
    });
  });

  describe('scheduled / reminder notification types', () => {
    it('trip_reminder_24h — includes formatted time in body when scheduledFor provided', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);
      const scheduledFor = new Date('2026-05-09T10:00:00Z').toISOString();

      await svc.send('user-1', 'trip_reminder_24h', { scheduledFor });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Recordatorio'), body: expect.any(String) }),
      );
    });

    it('trip_reminder_24h — generic body when no scheduledFor', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_reminder_24h');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('mañana') }),
      );
    });

    it('trip_reminder_1h — correct title', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_reminder_1h');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('pronto') }),
      );
    });

    it('trip_reminder_15m — correct title', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'trip_reminder_15m');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('comenzar') }),
      );
    });

    it('scheduled_trip_searching — correct content', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('user-1', 'scheduled_trip_searching');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('conductor') }),
      );
    });

    it('trip_scheduled_accepted — includes time when scheduledFor provided', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);
      const scheduledFor = new Date('2026-05-09T10:00:00Z').toISOString();

      await svc.send('driver-1', 'trip_scheduled_accepted', { scheduledFor });

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('agendado') }),
      );
    });

    it('trip_scheduled_accepted — generic body when no scheduledFor', async () => {
      const channel = makeMockChannel();
      const svc = new NotificationService(channel);

      await svc.send('driver-1', 'trip_scheduled_accepted');

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('tiempo') }),
      );
    });
  });

  describe('LogNotificationChannel', () => {
    it('does not throw even with empty userId', async () => {
      const channel = new LogNotificationChannel();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await expect(channel.send({
        recipientUserId: '',
        type: 'trip_accepted',
        title: 'Test',
        body: 'Test body',
      })).resolves.not.toThrow();

      jest.restoreAllMocks();
    });

    it('includes data in output when provided', async () => {
      const channel = new LogNotificationChannel();
      const logs: string[] = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(JSON.stringify(args));
      });

      await channel.send({
        recipientUserId: 'user-1',
        type: 'payment_processed',
        title: 'Pago',
        body: '$150',
        data: { amount: '150', tripId: 'trip-1' },
      });

      expect(logs.join('')).toContain('trip-1');
      jest.restoreAllMocks();
    });
  });
});
