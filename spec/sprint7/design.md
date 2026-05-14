# Sprint 7 — Design: Módulo Notifications

**Sprint:** 7 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Arquitectura del módulo

> **NOTA ADR-014 aplicado:** Ya existe `modules/notifications/` del UBER_BASE (viajes, pagos, sin SMS fallback).
> El módulo custody se crea como `custody-notifications/` — módulo separado, sin tocar el UBER_BASE.
> Se reutiliza `INotificationChannel` del UBER_BASE para la parte FCM push.

```
apps/api/src/modules/custody-notifications/
  custody-notifications.types.ts
  custody-notifications.repository.ts
  custody-notifications.service.ts  ← lógica central — 80% cobertura
  sms.client.ts                      ← ISmsClient + LogSmsClient (MVP)
  circuit-breaker.ts                 ← closed/open/half-open en Redis — 90% cobertura

apps/api/src/queues/
  custody-notifications.queue.ts    ← BullMQ Queue 'custody-notifications'

apps/api/src/workers/
  custody-notification-worker.ts    ← BullMQ Worker, routing table, push+SMS+CB
```

### Dependencias del CustodyNotificationService

```typescript
// Reutiliza INotificationChannel del UBER_BASE para FCM push
import type { INotificationChannel } from '../notifications/notification.channel.interface.js';

class CustodyNotificationService {
  constructor(
    private repo: CustodyNotificationsRepository,
    private pushChannel: INotificationChannel,  // ← reutiliza LogNotificationChannel / FCMNotificationChannel
    private sms: ISmsClient,
    private circuitBreaker: CircuitBreaker,
    private db: Knex,          // para lookup de users.phone y role-based recipients
  ) {}
}
```

---

## Migración M-052

```typescript
// migrations/052_create_notifications_table.ts
await knex.schema.createTable('notifications', (t) => {
  t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
  t.uuid('user_id').notNullable().references('id').inTable('users');
  t.uuid('order_id').nullable().references('id').inTable('custody_orders');
  t.uuid('alert_id').nullable().references('id').inTable('security_alerts');
  t.text('channel').notNullable();                // push | sms | email
  t.text('priority').notNullable();               // critical | high | normal | low
  t.text('status').notNullable().defaultTo('pending'); // pending | sent | failed | skipped
  t.text('title').notNullable();
  t.text('body').notNullable();
  t.timestamptz('sent_at').nullable();
  t.timestamptz('created_at').notNullable().defaultTo(knex.fn.now());
});
```

---

## notifications.types.ts

```typescript
export type NotificationChannel = 'push' | 'sms' | 'email';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface Notification {
  id: string;
  user_id: string;
  order_id: string | null;
  alert_id: string | null;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  body: string;
  sent_at: string | null;
  created_at: string;
}

export interface SendNotificationPayload {
  user_id: string;
  order_id?: string;
  alert_id?: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  body: string;
}

export interface NotifyOrderTransitionPayload {
  order_id: string;
  to_status: string;
  client_id: string | null;
  custodio_id: string | null;
  copiloto_id: string | null;
  tenant_id: string;
}

export interface NotifyAlertPayload {
  alert_id: string;
  order_id: string;
  alert_type: string;
  severity: string;
  tenant_id: string;
}

export type NotificationJobData =
  | { type: 'order-transition'; payload: NotifyOrderTransitionPayload }
  | { type: 'alert'; payload: NotifyAlertPayload };
```

---

## fcm.client.ts

```typescript
export interface IFcmClient {
  send(token: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
}

export class LogFcmClient implements IFcmClient {
  async send(token: string, title: string, body: string): Promise<void> {
    // Logs without sending — MVP mode
    console.log(`[FCM] token=${token.slice(0, 8)}... title="${title}" body="${body}"`);
  }
}
```

---

## sms.client.ts

```typescript
export interface ISmsClient {
  send(phone: string, message: string): Promise<void>;
}

export class LogSmsClient implements ISmsClient {
  async send(phone: string, message: string): Promise<void> {
    // Logs without sending — MVP mode
    console.log(`[SMS] to=${phone} message="${message}"`);
  }
}
```

---

## circuit-breaker.ts

```typescript
const CB_KEY_PREFIX = 'cb:fcm';
const CB_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;        // 5 fallos en 60s → open
const CB_COOLDOWN_MS = 5 * 60_000;  // open por 5 minutos
const CB_HALF_OPEN_TTL_MS = 30_000; // medio-abierto por 30s

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  constructor(
    private redis: Redis,
    private threshold = CB_THRESHOLD,
    private windowMs = CB_WINDOW_MS,
    private cooldownMs = CB_COOLDOWN_MS,
  ) {}

  async getState(): Promise<CircuitState>
  async isOpen(): Promise<boolean>           // true = NO enviar FCM
  async recordFailure(): Promise<void>       // incrementa contador, abre si threshold
  async recordSuccess(): Promise<void>       // regresa a closed si half-open
  async reset(): Promise<void>               // force-close (admin/tests)
}

// Patrón Redis:
// Hash key: 'cb:fcm'
// Fields: state, failure_count, opened_at, next_attempt_at
// TTL auto-expira cuando cooldown termina → vuelta a closed
```

---

## NotificationService — lógica central

```typescript
async send(payload: SendNotificationPayload): Promise<Notification>
  // 1. Crear registro en notifications con status='pending'
  // 2. Si channel = 'push':
  //    a. isOpen() → si true → skip FCM, ir a SMS fallback
  //    b. Buscar fcm_token del usuario (device_tokens WHERE user_id=? ORDER BY created_at DESC LIMIT 1)
  //    c. Si no hay token → skipped, registrar
  //    d. Intentar fcm.send()
  //    e. Si falla → circuitBreaker.recordFailure() → intentar sms.send()
  //    f. Si éxito → circuitBreaker.recordSuccess()
  // 3. Si channel = 'sms':
  //    a. Buscar phone del usuario (users WHERE id=?)
  //    b. sms.send()
  // 4. Actualizar registro: status='sent'/'failed'/'skipped', sent_at=NOW()
  // 5. return notification
```

---

## notification-worker.ts

```typescript
// Tabla de routing — to_status → destinatarios + canal + prioridad
const ORDER_ROUTING: Record<string, Array<{ role_field: 'client_id'|'custodio_id'|'copiloto_id'|'supervisor'|'dispatcher', channel: NotificationChannel, priority: NotificationPriority }>> = {
  PENDING_APPROVAL: [
    { role_field: 'supervisor', channel: 'push', priority: 'high' },
    { role_field: 'supervisor', channel: 'sms',  priority: 'high' },
  ],
  APPROVED: [
    { role_field: 'client_id',    channel: 'push', priority: 'normal' },
    { role_field: 'custodio_id',  channel: 'push', priority: 'normal' },
    { role_field: 'copiloto_id',  channel: 'push', priority: 'normal' },
    { role_field: 'dispatcher',   channel: 'push', priority: 'normal' },
  ],
  // ... resto de estados
  INCIDENT: [
    { role_field: 'supervisor', channel: 'push', priority: 'critical' },
    { role_field: 'supervisor', channel: 'sms',  priority: 'critical' },
    { role_field: 'dispatcher', channel: 'push', priority: 'critical' },
    { role_field: 'dispatcher', channel: 'sms',  priority: 'critical' },
  ],
};

// Worker
export function registerNotificationWorker(
  redis: Redis,
  notificationService: NotificationService,
  db: Knex,
): Worker<NotificationJobData>
```

---

## Integración con custody-orders

El controller de órdenes enqueue después de cada transición de estado exitosa:

```typescript
// En custody-orders.controller.ts (patrón para TODAS las transiciones)
const order = await ordersService.approve(orderId, actor);
if (notificationsQueue) {
  await notificationsQueue.add('notification', {
    type: 'order-transition',
    payload: {
      order_id: order.id,
      to_status: order.status,
      client_id: order.client_id,
      custodio_id: order.custodio_id,
      copiloto_id: order.copiloto_id,
      tenant_id: req.user.tenant_id,
    },
  });
}
```

El `notificationsQueue` se inyecta como parámetro opcional al registrar el plugin de rutas:
```typescript
// app.ts
app.register(ordersRoutes, { ordersService, notificationsQueue });
```

---

## Integración con AlertEngine

AlertEngine recibe `notificationsQueue` como 4to parámetro opcional:

```typescript
class AlertEngine {
  constructor(
    private repo: AlertsRepository,
    private db: Knex,
    private ordersService: CustodyOrdersService,
    private notificationsQueue?: Queue,   // ← nuevo, opcional
  ) {}
}

// En createAlert(), después de ordersService.reportIncident():
if (alert.alert_type === 'panic' && this.notificationsQueue) {
  await this.notificationsQueue.add('notification', {
    type: 'alert',
    payload: {
      alert_id: createdAlert.id,
      order_id: payload.order_id,
      alert_type: 'panic',
      severity: 'critical',
      tenant_id, // del lookup de la orden
    },
  });
}
```

---

## ADR-017 — NotificationService: FCM + SMS fallback + CircuitBreaker

**Decisión:** FCM como canal primario con SMS como fallback garantizado. CircuitBreaker en Redis controla cuando FCM está degradado. Para MVP, se usan `LogFcmClient` y `LogSmsClient` que loguean sin envío real — el circuito se conecta a clientes reales cuando las credenciales estén disponibles.

**Razón:** Evita la complejidad de Firebase Admin SDK en desarrollo. Las interfaces `IFcmClient` e `ISmsClient` permiten swap sin cambio de código en `NotificationService`.

---

## Cobertura requerida

| Módulo | Umbral |
|---|---|
| `NotificationService` | ≥ 80% lines / ≥ 75% branches |
| `CircuitBreaker` | ≥ 90% lines / ≥ 85% branches |
