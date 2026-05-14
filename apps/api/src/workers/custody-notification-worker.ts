// ---------------------------------------------------------------------------
// custody-notification-worker.ts — BullMQ worker for custody notifications
// ---------------------------------------------------------------------------

import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Knex } from 'knex';
import type { CustodyNotificationService } from '../modules/custody-notifications/custody-notifications.service.js';
import type {
  CustodyNotificationJobData,
  NotificationChannel,
  NotificationPriority,
  ReminderType,
} from '../modules/custody-notifications/custody-notifications.types.js';

const QUEUE_NAME = 'custody-notifications';

// ---------------------------------------------------------------------------
// Routing tables
// ---------------------------------------------------------------------------

interface RouteEntry {
  field: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
}

const ORDER_ROUTING: Record<string, RouteEntry[]> = {
  PENDING_APPROVAL: [
    { field: 'supervisor_role', channel: 'push', priority: 'high' },
    { field: 'supervisor_role', channel: 'sms', priority: 'high' },
  ],
  APPROVED: [
    { field: 'client_id', channel: 'push', priority: 'normal' },
    { field: 'custodio_id', channel: 'push', priority: 'normal' },
    { field: 'copiloto_id', channel: 'push', priority: 'normal' },
  ],
  REJECTED: [
    { field: 'client_id', channel: 'push', priority: 'high' },
    { field: 'dispatcher_role', channel: 'push', priority: 'high' },
  ],
  ASSIGNED: [
    { field: 'custodio_id', channel: 'push', priority: 'high' },
    { field: 'custodio_id', channel: 'sms', priority: 'high' },
    { field: 'copiloto_id', channel: 'push', priority: 'high' },
    { field: 'copiloto_id', channel: 'sms', priority: 'high' },
  ],
  IN_TRANSIT: [
    { field: 'client_id', channel: 'push', priority: 'high' },
  ],
  DELIVERED: [
    { field: 'client_id', channel: 'push', priority: 'high' },
    { field: 'dispatcher_role', channel: 'push', priority: 'high' },
  ],
  INCIDENT: [
    { field: 'supervisor_role', channel: 'push', priority: 'critical' },
    { field: 'supervisor_role', channel: 'sms', priority: 'critical' },
    { field: 'dispatcher_role', channel: 'push', priority: 'critical' },
    { field: 'dispatcher_role', channel: 'sms', priority: 'critical' },
  ],
  EN_ROUTE_TO_PICKUP: [
    { field: 'client_id', channel: 'push', priority: 'normal' },
  ],
  AT_PICKUP: [
    { field: 'client_id', channel: 'push', priority: 'normal' },
  ],
  AT_DELIVERY: [
    { field: 'client_id', channel: 'push', priority: 'normal' },
  ],
  COMPLETED: [
    { field: 'client_id', channel: 'push', priority: 'normal' },
  ],
  CREW_CONFIRMED: [
    { field: 'dispatcher_role', channel: 'push', priority: 'normal' },
  ],
};

// Default titles/bodies per status
const ORDER_MESSAGES: Record<string, { title: string; body: string }> = {
  PENDING_APPROVAL: { title: 'Nueva orden pendiente de aprobación', body: 'Hay una orden de custodia esperando tu aprobación.' },
  APPROVED: { title: 'Orden aprobada', body: 'Tu orden de custodia ha sido aprobada.' },
  REJECTED: { title: 'Orden rechazada', body: 'Tu orden de custodia ha sido rechazada.' },
  ASSIGNED: { title: 'Orden asignada', body: 'Has sido asignado a una orden de custodia.' },
  IN_TRANSIT: { title: 'Custodia en tránsito', body: 'Tu custodia está en camino.' },
  DELIVERED: { title: 'Custodia entregada', body: 'La custodia ha sido entregada exitosamente.' },
  INCIDENT: { title: 'Incidente reportado', body: 'Se ha reportado un incidente en una orden de custodia activa.' },
  EN_ROUTE_TO_PICKUP: { title: 'Equipo en camino', body: 'El equipo de custodia está en camino al punto de recolección.' },
  AT_PICKUP: { title: 'Equipo en punto de recolección', body: 'El equipo de custodia llegó al punto de recolección.' },
  AT_DELIVERY: { title: 'Equipo en punto de entrega', body: 'El equipo de custodia llegó al punto de entrega.' },
  COMPLETED: { title: 'Orden completada', body: 'La orden de custodia ha sido completada.' },
  CREW_CONFIRMED: { title: 'Tripulación confirmada', body: 'La tripulación ha confirmado la asignación.' },
};

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function registerCustodyNotificationWorker(
  redis: Redis,
  notificationService: CustodyNotificationService,
  db: Knex,
): Worker<CustodyNotificationJobData> {
  const connection = redis.duplicate({ maxRetriesPerRequest: null });

  const worker = new Worker<CustodyNotificationJobData>(
    QUEUE_NAME,
    async (job) => {
      const data = job.data;

      if (data.type === 'order-transition') {
        await handleOrderTransition(data.payload, notificationService, db);
      } else if (data.type === 'alert') {
        await handleAlert(data.payload, notificationService, db);
      } else if (data.type === 'reminder') {
        await handleReminder(data.payload, notificationService, db);
      }
    },
    { connection },
  );

  worker.on('failed', (_job, err) => {
    console.error('[CustodyNotificationWorker] Job failed:', err.message);
  });

  return worker;
}

// ---------------------------------------------------------------------------
// handleOrderTransition
// ---------------------------------------------------------------------------

async function handleOrderTransition(
  payload: Extract<CustodyNotificationJobData, { type: 'order-transition' }>['payload'],
  notificationService: CustodyNotificationService,
  db: Knex,
): Promise<void> {
  const routes = ORDER_ROUTING[payload.to_status];
  if (!routes || routes.length === 0) {
    return;
  }

  const messages = ORDER_MESSAGES[payload.to_status] ?? {
    title: `Orden actualizada: ${payload.to_status}`,
    body: 'El estado de tu orden de custodia ha cambiado.',
  };

  const sendTasks: Array<Promise<unknown>> = [];

  for (const route of routes) {
    const userIds = await resolveUserIds(route.field, payload, db);

    for (const userId of userIds) {
      const isCritical = route.priority === 'critical' || route.priority === 'high';
      // Job retry config is informational here — actual retry is at BullMQ job level
      const retryLabel = isCritical ? 'attempts=10 exponential' : 'attempts=3 exponential';

      sendTasks.push(
        notificationService
          .send({
            user_id: userId,
            order_id: payload.order_id,
            channel: route.channel,
            priority: route.priority,
            title: messages.title,
            body: messages.body,
          })
          .catch((err: Error) => {
            console.error(
              `[CustodyNotificationWorker] send failed for user=${userId} status=${payload.to_status} ${retryLabel}:`,
              err.message,
            );
          }),
      );
    }
  }

  await Promise.all(sendTasks);
}

// ---------------------------------------------------------------------------
// handleAlert
// ---------------------------------------------------------------------------

async function handleAlert(
  payload: Extract<CustodyNotificationJobData, { type: 'alert' }>['payload'],
  notificationService: CustodyNotificationService,
  db: Knex,
): Promise<void> {
  const isCritical = payload.severity === 'critical';
  const isHigh = payload.severity === 'high';

  if (!isCritical && !isHigh) {
    return; // Only notify for critical and high severity
  }

  // Determine recipients and channels
  const entries: Array<{ userId: string; channel: NotificationChannel; priority: NotificationPriority }> = [];

  if (isCritical) {
    // Notify all supervisors and dispatchers via push + sms
    const supervisors = await db('users')
      .where({ role: 'supervisor', deleted_at: null })
      .select('id');
    const dispatchers = await db('users')
      .where({ role: 'dispatcher', deleted_at: null })
      .select('id');

    const allRecipients = [
      ...supervisors.map((u: { id: string }) => u.id),
      ...dispatchers.map((u: { id: string }) => u.id),
    ];

    for (const userId of allRecipients) {
      entries.push({ userId, channel: 'push', priority: 'critical' });
      entries.push({ userId, channel: 'sms', priority: 'critical' });
    }
  } else {
    // High severity — notify supervisors via push only
    const supervisors = await db('users')
      .where({ role: 'supervisor', deleted_at: null })
      .select('id');

    for (const u of supervisors as Array<{ id: string }>) {
      entries.push({ userId: u.id, channel: 'push', priority: 'high' });
    }
  }

  // Build title/body
  const isPanic = payload.alert_type === 'panic';
  const title = isPanic
    ? '⚠️ ALERTA CRÍTICA: Botón de pánico activado'
    : `Alerta de seguridad: ${payload.alert_type}`;
  const body = isPanic
    ? 'Orden activa en situación de emergencia. Responder inmediatamente.'
    : `Se ha registrado una alerta de tipo ${payload.alert_type} en una orden activa.`;

  const sendTasks: Array<Promise<unknown>> = entries.map(({ userId, channel, priority }) =>
    notificationService
      .send({
        user_id: userId,
        order_id: payload.order_id,
        alert_id: payload.alert_id,
        channel,
        priority,
        title,
        body,
      })
      .catch((err: Error) => {
        console.error(
          `[CustodyNotificationWorker] alert send failed for user=${userId}:`,
          err.message,
        );
      }),
  );

  await Promise.all(sendTasks);
}

// ---------------------------------------------------------------------------
// handleReminder
// ---------------------------------------------------------------------------

const REMINDER_MESSAGES: Record<ReminderType, { title: string; body: string }> = {
  reminder_24h: {
    title: 'Recordatorio: custodia programada mañana',
    body: 'Tienes una orden de custodia programada para mañana. Asegúrate de que todo esté listo.',
  },
  reminder_1h: {
    title: 'Recordatorio: custodia en 1 hora',
    body: 'Tu orden de custodia comienza en aproximadamente 1 hora.',
  },
  reminder_15m: {
    title: 'Custodia en 15 minutos',
    body: 'Tu orden de custodia comienza en 15 minutos. El equipo está en camino.',
  },
  dispatch_alert: {
    title: '⚠️ Orden sin asignar — ventana de despacho abierta',
    body: 'Hay una orden APROBADA cuya ventana de despacho ya abrió y no tiene equipo asignado.',
  },
};

async function handleReminder(
  payload: Extract<CustodyNotificationJobData, { type: 'reminder' }>['payload'],
  notificationService: CustodyNotificationService,
  db: Knex,
): Promise<void> {
  const messages = REMINDER_MESSAGES[payload.reminder_type as ReminderType];
  if (!messages) return;

  const isDispatchAlert = payload.reminder_type === 'dispatch_alert';

  if (isDispatchAlert) {
    // Notify all dispatchers
    const dispatchers = await db('users')
      .where({ role: 'dispatcher', deleted_at: null })
      .select('id') as Array<{ id: string }>;

    const tasks = dispatchers.flatMap(({ id: userId }) => [
      notificationService.send({
        user_id: userId,
        order_id: payload.order_id,
        channel: 'push',
        priority: 'high',
        title: messages.title,
        body: messages.body,
      }).catch((err: Error) => {
        console.error(`[CustodyNotificationWorker] dispatch_alert push failed user=${userId}:`, err.message);
      }),
      notificationService.send({
        user_id: userId,
        order_id: payload.order_id,
        channel: 'sms',
        priority: 'high',
        title: messages.title,
        body: messages.body,
      }).catch((err: Error) => {
        console.error(`[CustodyNotificationWorker] dispatch_alert sms failed user=${userId}:`, err.message);
      }),
    ]);
    await Promise.all(tasks);
  } else {
    // Notify client — resolve user_id from clients table
    const client = await db('clients')
      .where({ id: payload.client_id })
      .select('user_id')
      .first() as { user_id: string } | undefined;

    if (!client) return;

    await notificationService.send({
      user_id: client.user_id,
      order_id: payload.order_id,
      channel: 'push',
      priority: 'normal',
      title: messages.title,
      body: messages.body,
    }).catch((err: Error) => {
      console.error(
        `[CustodyNotificationWorker] reminder ${payload.reminder_type} failed user=${client.user_id}:`,
        err.message,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// resolveUserIds
// ---------------------------------------------------------------------------

async function resolveUserIds(
  field: string,
  payload: Extract<CustodyNotificationJobData, { type: 'order-transition' }>['payload'],
  db: Knex,
): Promise<string[]> {
  if (field === 'client_id') {
    return payload.client_id ? [payload.client_id] : [];
  }
  if (field === 'custodio_id') {
    return payload.custodio_id ? [payload.custodio_id] : [];
  }
  if (field === 'copiloto_id') {
    return payload.copiloto_id ? [payload.copiloto_id] : [];
  }
  if (field === 'supervisor_role') {
    const rows = await db('users')
      .where({ role: 'supervisor', deleted_at: null })
      .select('id') as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }
  if (field === 'dispatcher_role') {
    const rows = await db('users')
      .where({ role: 'dispatcher', deleted_at: null })
      .select('id') as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }
  return [];
}
