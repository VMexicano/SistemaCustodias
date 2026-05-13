# Sprint 5 — Pagos y Notificaciones: Design

> **Fecha:** 2026-04-07
> **Estado:** Aprobado
> **ADRs aplicables:** ADR-001, ADR-002, ADR-005, ADR-006, ADR-009, ADR-017, ADR-018, ADR-027, ADR-028

---

## Arquitectura al finalizar el sprint

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    UBER_BASE API — Sprint 5                              │
│                                                                          │
│  HTTP/WS                                                                 │
│  ─────────────────────────────────────────────────────────────────────  │
│  GET /trips/:id/payment ──► payment.controller ──► payment.service       │
│                                                          │               │
│  INTERNAL FLOW                                           ▼               │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                   payment.repository     │
│  trips.service                                          │               │
│      │  COMPLETED                              ┌────────┴────────┐      │
│      ├──► BullMQ queue:payment                 │    payments DB  │      │
│      └──► emitTripStatusChanged() [WebSocket]  └─────────────────┘      │
│                   │                                                      │
│           BullMQ queue:notification                                      │
│                                                                          │
│  WORKERS (BullMQ)                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  payment.worker                    notification.worker                   │
│      │                                   │                               │
│      ▼                                   ▼                               │
│  PaymentService                  NotificationService                    │
│      │                                   │                               │
│      ▼                                   ▼                               │
│  IPaymentGateway            INotificationChannel                        │
│  ┌───────────────┐          ┌──────────────────────────┐                │
│  │StripeGateway  │          │ LogChannel  │ FCMChannel  │                │
│  │(sk_test_xxx / │          │  (dev/test) │   (prod)   │                │
│  │ sk_live_xxx)  │          └──────────────────────────┘                │
│  └───────┬───────┘                    │                                  │
│          │ opossum                    │ opossum                          │
│          ▼ circuit breaker            ▼ circuit breaker                  │
│       Stripe API                   FCM API                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Estructura de directorios — módulos nuevos

```
apps/api/src/modules/
├── payments/
│   ├── payment.routes.ts              # GET /trips/:id/payment
│   ├── payment.controller.ts
│   ├── payment.service.ts             # lógica de cobro
│   ├── payment.repository.ts          # acceso a tabla payments
│   ├── payment.worker.ts              # BullMQ worker queue:payment
│   ├── payment.gateway.interface.ts   # IPaymentGateway
│   ├── stripe.payment.gateway.ts      # implementación Stripe
│   └── payment.schemas.ts             # Zod schemas
└── notifications/
    ├── notification.service.ts        # lógica de envío
    ├── notification.worker.ts         # BullMQ worker queue:notification
    ├── notification.channel.interface.ts  # INotificationChannel
    ├── log.notification.channel.ts    # dev/test
    └── fcm.notification.channel.ts    # producción

apps/api/src/
└── workers/
    └── index.ts                       # registro de workers BullMQ (ya existe)
```

---

## Interfaces TypeScript clave

### IPaymentGateway

```typescript
// payment.gateway.interface.ts

export interface CreatePaymentIntentParams {
  amountCents: number;          // final_fare * 100, en centavos
  currency: string;             // 'mxn'
  customerId: string;           // stripe_customer_id del pasajero
  paymentMethodId: string;      // stripe_pm_id guardado en Sprint 2
  metadata: {
    tripId: string;
    passengerId: string;
    driverId: string;
  };
}

export interface PaymentIntentResult {
  id: string;         // stripe_payment_intent_id (pi_xxx)
  chargeId: string;   // stripe_charge_id (ch_xxx)
  status: string;     // 'succeeded' | 'requires_action' | etc.
}

export interface IPaymentGateway {
  createAndConfirm(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
}
```

### StripePaymentGateway

```typescript
// stripe.payment.gateway.ts

export class StripePaymentGateway implements IPaymentGateway {
  private client: Stripe;

  constructor() {
    // Stripe detecta automáticamente test vs live por el prefijo del key
    this.client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });
  }

  async createAndConfirm(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const intent = await this.client.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      confirm: true,
      off_session: true,     // cobro sin presencia del usuario
      metadata: params.metadata,
    });
    const chargeId = typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id ?? '';
    return { id: intent.id, chargeId, status: intent.status };
  }
}
```

### Circuit breaker — Stripe (opossum)

```typescript
// payment.service.ts — inicialización del breaker

import CircuitBreaker from 'opossum';

const stripeBreaker = new CircuitBreaker(
  (params: CreatePaymentIntentParams) => gateway.createAndConfirm(params),
  {
    timeout: 10000,                  // 10s — steering/architecture.md
    errorThresholdPercentage: 30,    // 30% — steering/architecture.md
    resetTimeout: 120000,            // 120s — steering/architecture.md
    name: 'stripe-payment',
  }
);

// Métricas de observabilidad
stripeBreaker.on('open', () => logger.warn('circuit_breaker.opened', { service: 'stripe' }));
stripeBreaker.on('halfOpen', () => logger.info('circuit_breaker.half_open', { service: 'stripe' }));
stripeBreaker.on('close', () => logger.info('circuit_breaker.closed', { service: 'stripe' }));
```

### INotificationChannel

```typescript
// notification.channel.interface.ts

export type NotificationType =
  | 'trip_accepted'
  | 'driver_arrived'
  | 'trip_started'
  | 'trip_completed'
  | 'payment_processed'
  | 'payment_failed';

export interface NotificationPayload {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;  // metadata extra (tripId, amount, etc.)
}

export interface INotificationChannel {
  send(payload: NotificationPayload): Promise<void>;
}
```

### LogNotificationChannel

```typescript
// log.notification.channel.ts

export class LogNotificationChannel implements INotificationChannel {
  async send(payload: NotificationPayload): Promise<void> {
    // Dev/test: imprime en consola con formato legible
    console.log('[NOTIFICATION]', JSON.stringify(payload, null, 2));
  }
}
```

### FCMNotificationChannel (prod)

```typescript
// fcm.notification.channel.ts

import * as admin from 'firebase-admin';

export class FCMNotificationChannel implements INotificationChannel {
  async send(payload: NotificationPayload): Promise<void> {
    // Requiere FCM token del dispositivo — en Sprint 7 se registra desde mobile
    // Por ahora se obtiene de un store (Redis o BD) que Sprint 7 llenará
    const fcmToken = await this.getDeviceToken(payload.recipientUserId);
    if (!fcmToken) {
      logger.warn('fcm_token_not_found', { userId: payload.recipientUserId });
      return; // No fallar si el token no existe — dispositivo no registrado
    }
    await admin.messaging().send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });
  }
}
```

### Circuit breaker — FCM

```typescript
const fcmBreaker = new CircuitBreaker(
  (payload: NotificationPayload) => channel.send(payload),
  {
    timeout: 5000,                   // 5s — steering/architecture.md
    errorThresholdPercentage: 50,    // 50% — steering/architecture.md
    resetTimeout: 30000,             // 30s — steering/architecture.md
    name: 'fcm-notification',
  }
);
```

### PaymentService — flujo principal

```typescript
// payment.service.ts

export class PaymentService {
  async charge(tripId: string): Promise<void> {
    // 1. Fetch trip con final_fare y pricing_snapshot
    const trip = await this.tripRepo.findById(tripId);
    if (!trip || trip.status !== 'COMPLETED') throw new BusinessError('TRIP_NOT_CHARGEABLE');

    // 2. Fetch método de pago del pasajero
    const pm = await this.paymentMethodRepo.findDefaultByUserId(trip.passengerId);
    if (!pm) {
      await this.paymentRepo.createFailed(tripId, 'NO_PAYMENT_METHOD');
      return;
    }

    // 3. Insertar payments record en estado pending
    const payment = await this.paymentRepo.create({
      tripId,
      passengerId: trip.passengerId,
      driverId: trip.driverId!,
      amount: trip.finalFare,
      taxAmount: trip.pricingSnapshot.taxAmount,
      platformFee: trip.pricingSnapshot.platformFee,
      driverEarnings: trip.pricingSnapshot.driverEarnings,
      currency: 'MXN',
    });

    // 4. Cobrar via circuit breaker
    try {
      const result = await stripeBreaker.fire({
        amountCents: Math.round(trip.finalFare * 100),
        currency: 'mxn',
        customerId: pm.stripeCustomerId,
        paymentMethodId: pm.stripePmId,
        metadata: { tripId, passengerId: trip.passengerId, driverId: trip.driverId! },
      });
      await this.paymentRepo.markCompleted(payment.id, result.id, result.chargeId);
    } catch (err) {
      await this.paymentRepo.markFailed(payment.id, String(err));
      throw err; // re-throw para que BullMQ reintente
    }
  }
}
```

### BullMQ payment worker

```typescript
// payment.worker.ts

export const paymentWorker = new Worker(
  'payment',
  async (job: Job<{ tripId: string }>) => {
    await paymentService.charge(job.data.tripId);
    // Encolar notificación de éxito
    await notificationQueue.add('notification', {
      recipientUserId: job.data.passengerId,
      type: 'payment_processed',
      tripId: job.data.tripId,
    });
  },
  {
    connection: redisConnection,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  }
);

// En caso de fallo después de todos los reintentos
paymentWorker.on('failed', async (job, err) => {
  await notificationQueue.add('notification', {
    recipientUserId: job?.data.passengerId,
    type: 'payment_failed',
    tripId: job?.data.tripId,
  });
});
```

### Integración en trips.service — COMPLETED

```typescript
// trips.service.ts — método completeTrip (modificar existente)

// DESPUÉS de la transacción:
await paymentQueue.add('payment', { tripId, passengerId: trip.passengerId });
await this.realtime.emitTripStatusChanged(tripId, 'COMPLETED');
// ↑ Este emit era el pendiente de Sprint 4
```

---

## Contrato de API

### GET /trips/:id/payment

**Descripción:** Consultar el estado del pago de un viaje.

**Auth:** Bearer JWT — solo el pasajero del viaje.

**Request:**
```
GET /trips/:id/payment
Authorization: Bearer <access_token>
```

**Response 200:**
```typescript
{
  id: string;                    // UUID del payment
  tripId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;                // total en MXN (incluye IVA)
  taxAmount: number;             // IVA 16%
  platformFee: number;           // comisión plataforma
  driverEarnings: number;        // ganancia neta conductor
  currency: 'MXN';
  stripePaymentIntentId: string | null;
  chargedAt: string | null;      // ISO 8601
  failureReason: string | null;
  retryCount: number;
  createdAt: string;             // ISO 8601
}
```

**Errores:**

| HTTP | Código | Condición |
|---|---|---|
| 404 | `PAYMENT_NOT_FOUND` | No existe registro de pago para ese trip (job aún pendiente) |
| 404 | `TRIP_NOT_FOUND` | El trip no existe |
| 403 | `FORBIDDEN` | El JWT no pertenece al pasajero del viaje |
| 401 | `UNAUTHORIZED` | JWT ausente o expirado |

---

## Variables de entorno nuevas

```bash
# Stripe — ya declarada, completar con valor real
STRIPE_SECRET_KEY=sk_test_xxxxx   # cert/QA
# STRIPE_SECRET_KEY=sk_live_xxx   # producción

# Notifications
NOTIFICATION_PROVIDER=log         # dev/test (LogNotificationChannel)
# NOTIFICATION_PROVIDER=fcm       # producción (FCMNotificationChannel)

# Firebase — solo requeridas cuando NOTIFICATION_PROVIDER=fcm
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

---

## ADRs aplicables al sprint

### ADR-006 — Stripe como único procesador de pagos (existente)

Stripe es el procesador MVP. No MercadoPago, no efectivo.

### ADR-017 — Stripe SetupIntent en Sprint 2, PaymentIntent en Sprint 5 (existente)

El SetupIntent se ejecutó en Sprint 2 para guardar el método de pago. En Sprint 5 se usa el `stripe_pm_id` guardado para crear un `PaymentIntent` con `off_session: true`.

### ADR-018 — Canal abstracto (existente, patrón reutilizado)

Mismo patrón que OTPChannelService: interfaz `INotificationChannel` con implementaciones `LogNotificationChannel` (dev) y `FCMNotificationChannel` (prod), controladas por env var.

### ADR-027 — Circuit breaker: opossum (nueva)

**Fecha:** 2026-04-07 · **Estado:** Aceptado · **Área:** Resiliencia

**Contexto:** PaymentService y NotificationService llaman a Stripe y FCM respectivamente. Ambos servicios externos pueden fallar o degradarse. Sin circuit breaker, un fallo en Stripe podría acumular workers bloqueados durante 10s cada uno, agotando el pool de conexiones de BullMQ.

**Opciones consideradas:**

| Opción | Pros | Contras |
|---|---|---|
| `opossum` | Mantenido por Red Hat, battle-tested en Node.js, métricas integradas | Dependencia externa |
| Implementación manual | Sin dependencia | Tiempo de desarrollo, bugs potenciales |
| Sin circuit breaker | Sin overhead | Cascada de fallos en Stripe downtime |

**Decisión:** `opossum` — es el estándar de facto para circuit breakers en Node.js. Configuraciones ya definidas en `steering/architecture.md`.

**Consecuencias:**
- Facilita: detección rápida de fallos externos, métricas de `circuit_breaker.opened` en Prometheus
- Complica: configuración inicial por servicio externo
- Criterio de revisión: migrar a Hystrix/Resilience4j si se pasa a microservicios

### ADR-028 — Notification channel abstracto: Log (dev) + FCM (prod), sin SMS (nueva)

**Fecha:** 2026-04-07 · **Estado:** Aceptado · **Área:** Notificaciones

**Contexto:** Necesitamos notificaciones push para los eventos del viaje y pagos. En dev/test no queremos depender de Firebase. Twilio (SMS) fue evaluado pero descartado para Sprint 5 — no es crítico para MVP y añade complejidad operacional sin valor inmediato.

**Decisión:** `INotificationChannel` abstracta con dos implementaciones controladas por `NOTIFICATION_PROVIDER`:
- `log` → imprime en consola (dev/test, sin credenciales externas)
- `fcm` → Firebase Admin SDK (producción)

Sin fallback SMS en Sprint 5. Si un push falla, BullMQ reintenta hasta 3 veces. Si todos fallan, el error queda en `system_error_logs`.

**Consecuencias:**
- Facilita: desarrollo sin credenciales Firebase, mismo patrón ya conocido (ADR-018)
- Complica: sin notificación garantizada si FCM cae (sin SMS fallback)
- Criterio de revisión: agregar Twilio SMS en Sprint 6+ si el negocio requiere notificación crítica garantizada
