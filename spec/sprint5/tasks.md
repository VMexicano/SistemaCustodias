# Sprint 5 — Pagos y Notificaciones: Tasks

> **Fecha:** 2026-04-07
> **Estado:** Aprobado — listo para ejecutar con `/team`
> **Ref:** spec/sprint5/requirements.md · spec/sprint5/design.md

---

## Resumen de tareas

| ID | Título | Tipo | Agentes | Depende de | Irreversible | Estado |
|---|---|---|---|---|---|---|
| PAY-001 | PaymentService + IPaymentGateway + StripeGateway | FEATURE | backend | — | — | 🔲 |
| NOTIF-001 | NotificationService + INotificationChannel + workers | FEATURE | backend | — | — | 🔲 |
| PAY-002 | BullMQ payment worker con circuit breaker | FEATURE | backend | PAY-001 | — | 🔲 |
| NOTIF-002 | BullMQ notification worker con circuit breaker | FEATURE | backend | NOTIF-001 | — | 🔲 |
| PAY-003 | Integración: COMPLETED → payment queue + WebSocket emit | FEATURE | backend | PAY-001, PAY-002, NOTIF-002 | — | 🔲 |
| QA-001 | Tests PaymentService (≥95%) + NotificationService (≥75%) | QA_ONLY | qa | PAY-003 | — | 🔲 |

---

## Grafo de dependencias

```
PAY-001 (PaymentService) ──────────────┐
                                        ├──► PAY-002 (payment worker) ──┐
                                        │                                ├──► PAY-003 (integración) ──► QA-001
NOTIF-001 (NotificationService) ────────┴──► NOTIF-002 (notif worker) ──┘
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| **Grupo 1** | PAY-001 ∥ NOTIF-001 | Sin dependencias — arrancan simultáneamente |
| **Grupo 2** | PAY-002 ∥ NOTIF-002 | PAY-001 ✅ Y NOTIF-001 ✅ |
| **Grupo 3** | PAY-003 | PAY-002 ✅ Y NOTIF-002 ✅ |
| **Grupo 4** | QA-001 | PAY-003 ✅ |

---

## PAY-001 — PaymentService + IPaymentGateway + StripeGateway

### Checklist del planner

```
✅ task_id:              PAY-001
✅ title:                Implementar PaymentService con abstracción IPaymentGateway y StripeGateway
✅ description:          Servicio de cobro que usa IPaymentGateway para aislar Stripe.
                         Crea registros en payments, extrae montos del pricing_snapshot del viaje.
                         Stripe test mode activado automáticamente con sk_test_xxx.
✅ scope_in:             PaymentService.charge(), IPaymentGateway, StripePaymentGateway,
                         PaymentRepository (create, markCompleted, markFailed, findByTripId),
                         GET /trips/:id/payment endpoint, Zod schemas, pnpm add stripe
✅ scope_out:            BullMQ worker (PAY-002), circuit breaker (PAY-002),
                         reembolsos, webhooks de Stripe
✅ agents:               backend
✅ depends_on:           ninguna
✅ acceptance_business:  PaymentService.charge() crea un PaymentIntent en Stripe y actualiza
                         payments.status a 'completed' o 'failed'
✅ acceptance_technical: IPaymentGateway inyectable, StripeGateway como implementación por defecto,
                         GET /trips/:id/payment retorna 200 con schema correcto
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            FEATURE
✅ dependencies_verified: stripe — instalar con pnpm add stripe @uber-base/api
✅ schema_verified:      tabla payments existe (migración 017) con todos los campos necesarios.
                         NO se requiere nueva migración.
✅ actor_resolution:     JWT.sub = user_id. Para verificar ownership del pago:
                         payment.passenger_id debe coincidir con user_id del JWT
```

### Specs TDD — tests a escribir

**`tests/unit/payment.service.test.ts`**

```typescript
describe('PaymentService', () => {
  describe('charge()', () => {
    it('crea PaymentIntent y marca payment como completed cuando Stripe responde ok')
    it('extrae tax_amount, platform_fee, driver_earnings del pricing_snapshot')
    it('inserta payment en estado pending antes de llamar a Stripe')
    it('marca payment como failed cuando no hay método de pago guardado — no reintenta')
    it('marca payment como failed y re-lanza error cuando Stripe falla — BullMQ reintenta')
    it('lanza TRIP_NOT_CHARGEABLE si el viaje no está en COMPLETED')
    it('lanza TRIP_NOT_FOUND si el viaje no existe')
  })

  describe('getPaymentByTripId()', () => {
    it('retorna el payment completo cuando existe')
    it('lanza PAYMENT_NOT_FOUND cuando no existe registro aún')
    it('lanza FORBIDDEN si el user_id del JWT no es el passenger_id del pago')
  })
})
```

**`tests/unit/stripe.payment.gateway.test.ts`**

```typescript
describe('StripePaymentGateway', () => {
  it('llama a paymentIntents.create con off_session: true y confirm: true')
  it('retorna { id, chargeId, status } del PaymentIntent creado')
  it('propaga el error de Stripe sin modificarlo')
})
```

### Referencias SDD

- `spec/sprint5/design.md` — IPaymentGateway, StripePaymentGateway, PaymentService.charge()
- `spec/sprint5/design.md` — GET /trips/:id/payment contrato completo
- `apps/api/migrations/20240101000017_create_payments.ts` — schema de la tabla payments
- `apps/api/migrations/20240101000018_create_passenger_payment_methods.ts` — stripe_pm_id

---

## NOTIF-001 — NotificationService + INotificationChannel

### Checklist del planner

```
✅ task_id:              NOTIF-001
✅ title:                Implementar NotificationService con INotificationChannel abstracta
✅ description:          Servicio de notificaciones push con patrón canal abstracto (ADR-028).
                         LogNotificationChannel para dev/test, FCMNotificationChannel para prod.
                         Controlado por NOTIFICATION_PROVIDER env var.
✅ scope_in:             INotificationChannel, LogNotificationChannel, FCMNotificationChannel,
                         NotificationService.send(), tipos de notificación (5 tipos),
                         pnpm add firebase-admin @uber-base/api
✅ scope_out:            BullMQ worker (NOTIF-002), circuit breaker (NOTIF-002),
                         SMS Twilio, notificaciones in-app, registro de FCM tokens
✅ agents:               backend
✅ depends_on:           ninguna
✅ acceptance_business:  Con NOTIFICATION_PROVIDER=log, cada tipo de notificación aparece
                         en consola con el payload completo
✅ acceptance_technical: INotificationChannel inyectable, LogChannel imprime JSON completo,
                         FCMChannel llama a firebase-admin.messaging().send()
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            FEATURE
✅ dependencies_verified: firebase-admin — instalar con pnpm add firebase-admin @uber-base/api
✅ schema_verified:      No requiere tabla nueva. FCM tokens se guardarán en Sprint 7.
                         FCMNotificationChannel debe manejar gracefully el caso token-not-found.
✅ actor_resolution:     NotificationService recibe recipientUserId (user_id). FCMChannel
                         busca el FCM token por user_id (pendiente Sprint 7 — manejar con warn log).
```

### Specs TDD — tests a escribir

**`tests/unit/notification.service.test.ts`**

```typescript
describe('NotificationService', () => {
  describe('send() con LogNotificationChannel', () => {
    it('imprime el payload completo en consola sin lanzar error')
    it('no lanza si el recipientUserId está vacío')
  })

  describe('send() con FCMNotificationChannel (mock)', () => {
    it('llama a firebase-admin messaging().send() con token, title, body y data')
    it('retorna sin error cuando el FCM token no existe para el usuario (warn log)')
    it('propaga el error de FCM para que el circuit breaker lo detecte')
  })

  describe('tipos de notificación', () => {
    it('trip_accepted — incluye nombre del conductor en body')
    it('driver_arrived — incluye dirección de pickup en data')
    it('trip_completed — incluye monto final en data')
    it('payment_processed — incluye monto y últimos 4 dígitos en body')
    it('payment_failed — indica al pasajero que verifique su método de pago')
  })
})
```

### Referencias SDD

- `spec/sprint5/design.md` — INotificationChannel, LogChannel, FCMChannel, ADR-028
- `apps/api/src/modules/otp/` — referencia al patrón ADR-018 que se reutiliza

---

## PAY-002 — BullMQ payment worker con circuit breaker

### Checklist del planner

```
✅ task_id:              PAY-002
✅ title:                BullMQ payment worker con opossum circuit breaker
✅ description:          Worker que consume la queue 'payment', llama a PaymentService.charge()
                         protegido por circuit breaker opossum. 3 reintentos exponenciales.
                         Al completar (éxito o fallo definitivo) encola job de notificación.
✅ scope_in:             payment.worker.ts, circuit breaker opossum (Stripe),
                         pnpm add opossum @types/opossum @uber-base/api,
                         retry config: 3 intentos, backoff exponencial 5s
✅ scope_out:            Notification worker (NOTIF-002), reembolsos, métricas Prometheus (Sprint 6)
✅ agents:               backend
✅ depends_on:           PAY-001
✅ acceptance_business:  Si Stripe falla, el worker reintenta 3 veces. Si falla definitivamente,
                         payments.status queda en 'failed' con failure_reason registrado
✅ acceptance_technical: Worker registrado en workers/index.ts, circuit breaker con parámetros
                         de steering/architecture.md (10s/30%/120s)
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            FEATURE
✅ dependencies_verified: opossum + @types/opossum — instalar con pnpm add opossum @types/opossum @uber-base/api
✅ schema_verified:      payments.retry_count ya existe en migración 017
✅ actor_resolution:     Job payload incluye tripId y passengerId (para encolar notificación)
```

### Specs TDD — tests a escribir

**`tests/unit/payment.worker.test.ts`**

```typescript
describe('payment worker', () => {
  it('llama a PaymentService.charge() con el tripId del job')
  it('encola job de notificación payment_processed cuando el cobro es exitoso')
  it('encola job de notificación payment_failed cuando se agotan los reintentos')
  it('el circuit breaker abre después de 30% de fallos consecutivos')
  it('el job falla inmediatamente con breaker abierto (sin esperar timeout de Stripe)')
})
```

### Referencias SDD

- `spec/sprint5/design.md` — BullMQ payment worker, parámetros circuit breaker
- `steering/architecture.md` — Stripe: timeout 10s, threshold 30%, reset 120s

---

## NOTIF-002 — BullMQ notification worker con circuit breaker

### Checklist del planner

```
✅ task_id:              NOTIF-002
✅ title:                BullMQ notification worker con opossum circuit breaker
✅ description:          Worker que consume la queue 'notification', llama a
                         NotificationService.send() protegido por circuit breaker.
                         3 reintentos exponenciales. Fallo no bloquea flujo de pago.
✅ scope_in:             notification.worker.ts, circuit breaker opossum (FCM),
                         retry config: 3 intentos, backoff exponencial 3s
✅ scope_out:            SMS fallback (Twilio), métricas Prometheus (Sprint 6)
✅ agents:               backend
✅ depends_on:           NOTIF-001
✅ acceptance_business:  Notificaciones llegan al canal correcto según NOTIFICATION_PROVIDER.
                         Fallo en notificación no revierte el pago.
✅ acceptance_technical: Worker registrado en workers/index.ts, circuit breaker con parámetros
                         de steering/architecture.md (5s/50%/30s)
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            FEATURE
✅ dependencies_verified: opossum ya instalado en PAY-002 (misma dependencia)
✅ schema_verified:      No requiere tabla nueva
✅ actor_resolution:     Job payload incluye recipientUserId, type, data (tripId, amount, etc.)
```

### Specs TDD — tests a escribir

**`tests/unit/notification.worker.test.ts`**

```typescript
describe('notification worker', () => {
  it('llama a NotificationService.send() con el payload del job')
  it('el circuit breaker abre después de 50% de fallos en FCM')
  it('el job falla inmediatamente con breaker abierto (sin esperar timeout FCM)')
  it('no interfiere con el flujo de pago cuando falla — jobs son independientes')
})
```

### Referencias SDD

- `spec/sprint5/design.md` — BullMQ notification worker, parámetros circuit breaker FCM
- `steering/architecture.md` — FCM: timeout 5s, threshold 50%, reset 30s

---

## PAY-003 — Integración: COMPLETED → payment queue + WebSocket emit

### Checklist del planner

```
✅ task_id:              PAY-003
✅ title:                Integrar trips.service con payment queue y emitTripStatusChanged
✅ description:          Conectar trips.service.ts para que al transicionar a COMPLETED
                         encole un job de pago en BullMQ. Conectar también emitTripStatusChanged()
                         de realtime.events.ts en todas las transiciones (pendiente Sprint 4).
✅ scope_in:             Modificar trips.service.ts — enqueue payment job al completar,
                         conectar emitTripStatusChanged() en todas las transiciones de estado,
                         ambos efectos FUERA de la transacción de BD
✅ scope_out:            Modificar TripStateMachine (no tocar — 100% coverage),
                         nuevos endpoints de trips, cambios en pricing
✅ agents:               backend
✅ depends_on:           PAY-001, PAY-002, NOTIF-002
✅ acceptance_business:  Al completar un viaje: 1) el pago se encola automáticamente,
                         2) el pasajero y conductor reciben WebSocket trip:status_changed
✅ acceptance_technical: El enqueue ocurre FUERA de la trx de BD.
                         Los tests existentes de realtime.test.ts siguen pasando (no romper).
                         tests/integration/trips.integration.test.ts actualizado para verificar
                         que el job payment fue encolado al completar.
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            FEATURE
✅ dependencies_verified: paymentQueue ya disponible (BullMQ instalado Sprint 4)
✅ schema_verified:      No requiere cambios de schema
✅ actor_resolution:     trips.service ya tiene driver_id y passenger_id del viaje completado
```

### Specs TDD — tests a escribir

**`tests/integration/trips.integration.test.ts`** (modificar — agregar casos)

```typescript
describe('Trip COMPLETED → side effects', () => {
  it('encola job en queue:payment con tripId y passengerId al completar el viaje')
  it('emite trip:status_changed vía WebSocket al completar el viaje')
  it('el enqueue ocurre fuera de la transacción — si el enqueue falla, el viaje ya está COMPLETED')
})
```

> **Nota crítica:** NO modificar trip-state-machine.test.ts — TripStateMachine tiene 100% de
> cobertura y es clase pura sin efectos secundarios. El enqueue vive en trips.service, no en la máquina.

### Referencias SDD

- `spec/sprint5/design.md` — Integración en trips.service, patrón de efectos fuera de trx
- `spec/sprint4/design.md` — TripStateMachine (referencia — no modificar)
- `apps/api/src/modules/realtime/realtime.events.ts` — emitTripStatusChanged() ya implementado

---

## QA-001 — Tests PaymentService (≥95%) + NotificationService (≥75%)

### Checklist del planner

```
✅ task_id:              QA-001
✅ title:                Suite de tests completa — Payment (95%) + Notification (75%)
✅ description:          Tests de integración end-to-end: flujo completo COMPLETED → payment worker
                         → payments table actualizada → notification worker → log/FCM.
                         Validar umbrales de cobertura del proyecto.
✅ scope_in:             payment.service.test.ts con Testcontainers (PostgreSQL real),
                         notification.service.test.ts (LogChannel — sin Firebase real),
                         integration test: COMPLETED → payment → notification,
                         verificar umbrales: PaymentService ≥95%, global ≥75%
✅ scope_out:            Tests E2E móvil (Sprint 7), tests Playwright (Sprint 6),
                         tests con Stripe en modo live (nunca en CI)
✅ agents:               qa
✅ depends_on:           PAY-003
✅ acceptance_business:  Todos los tests pasan. Los umbrales de cobertura se cumplen.
✅ acceptance_technical: PaymentService ≥95% lines, ≥90% branches.
                         NotificationService ≥75% lines.
                         Global ≥75% lines, ≥70% branches.
                         CI verde en GitHub Actions.
✅ irreversible:         false
✅ sprint:               5
✅ task_type:            QA_ONLY
✅ dependencies_verified: Testcontainers ya configurado (Sprint 1). IPaymentGateway mockeable.
✅ schema_verified:      payments table disponible en Testcontainers PostgreSQL
✅ actor_resolution:     Tests usan JWT de pasajero de prueba (factory existente)
```

### Specs TDD — tests a escribir

**`tests/integration/payment.integration.test.ts`** (nuevo)

```typescript
describe('Payment integration', () => {
  describe('flujo completo', () => {
    it('COMPLETED → payment job encolado → worker ejecuta → payments.status = completed')
    it('COMPLETED → payment job → Stripe falla (mock) → payments.status = failed tras 3 reintentos')
    it('COMPLETED → sin payment_method → payments.status = failed sin reintentos')
  })

  describe('GET /trips/:id/payment', () => {
    it('retorna 200 con payment completo cuando el cobro es exitoso')
    it('retorna 404 PAYMENT_NOT_FOUND cuando el job aún no procesó')
    it('retorna 403 FORBIDDEN cuando el JWT es del conductor, no del pasajero')
    it('retorna 404 TRIP_NOT_FOUND cuando el tripId no existe')
  })
})
```

**Estrategia de mock para Stripe en tests:**

```typescript
// En tests de integración: usar IPaymentGateway mock
class MockPaymentGateway implements IPaymentGateway {
  constructor(private readonly shouldFail = false) {}

  async createAndConfirm(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    if (this.shouldFail) throw new Error('Stripe connection refused');
    return {
      id: `pi_test_${Date.now()}`,
      chargeId: `ch_test_${Date.now()}`,
      status: 'succeeded',
    };
  }
}
// Inyectar MockPaymentGateway en PaymentService para tests
// Usar StripePaymentGateway real solo en tests de smoke con sk_test_xxx (opcional, no en CI)
```

**Verificación de umbrales:**

```bash
# Comando para verificar cobertura por módulo
npx jest --silent --coverage --coverageReporters=text 2>/dev/null \
  | grep -E "^\s*(PASS|FAIL|%|All files|payment|notification)" | head -30
```

### Referencias SDD

- `spec/sprint5/design.md` — todos los contratos e interfaces
- `spec/sprint5/requirements.md` — umbrales de cobertura (RF-501 a RF-507)
- `steering/testing-standards.md` — patrones de test del proyecto

---

## Definition of Done — Sprint 5

```
✅ PaymentService.charge() cobra correctamente con Stripe test mode (sk_test_xxx)
✅ payments.status refleja correctamente 'completed' o 'failed' con failure_reason
✅ Circuit breaker Stripe configurado (10s / 30% / 120s) con opossum
✅ NotificationService envía a LogChannel en dev — payload completo en consola
✅ Circuit breaker FCM configurado (5s / 50% / 30s) con opossum
✅ BullMQ workers payment y notification registrados y funcionando
✅ trips.service encola payment job al COMPLETED (fuera de transacción)
✅ trips.service llama emitTripStatusChanged() en todas las transiciones
✅ GET /trips/:id/payment retorna estado del pago al pasajero
✅ PaymentService ≥ 95% lines, ≥ 90% branches
✅ NotificationService ≥ 75% lines
✅ Global ≥ 75% lines, ≥ 70% branches
✅ Tests previos sin regresión (247 tests Sprint 4 siguen en verde)
✅ CI GitHub Actions verde
✅ ADR-027 y ADR-028 escritas en docs/13_decisions_log.md
✅ Snapshots actualizados: payments.snapshot.md + notifications.snapshot.md
✅ Commit: feat(payments): Sprint 5 — payments + notifications
```

---

## Notas por agente

### Backend
- Instalar paquetes en orden: `pnpm add stripe opossum firebase-admin @uber-base/api`, luego `pnpm add -D @types/opossum @uber-base/api`
- `StripePaymentGateway` usa `off_session: true` — no confundir con SetupIntent (Sprint 2)
- `IPaymentGateway` e `INotificationChannel` deben ser inyectables en el constructor del service (no instanciados internamente) para permitir mocks en QA
- El circuit breaker envuelve la llamada al gateway, no al service completo
- `FCMNotificationChannel` debe manejar gracefully `fcm_token_not_found` (warn log, no throw) — los tokens de dispositivo se registrarán en Sprint 7

### QA
- Usar `MockPaymentGateway` en lugar de Stripe real en todos los tests de CI
- `LogNotificationChannel` no requiere mock — usar la implementación real en tests
- Verificar que trips.integration.test.ts sigue pasando sin modificaciones adicionales
- Si la cobertura de PaymentService no llega a 95%, revisar ramas del circuit breaker (open/half-open)

### Notas de configuración local
- Crear cuenta en stripe.com (gratuito) → Dashboard → Developers → API Keys → copiar `sk_test_xxx`
- Agregar a `apps/api/.env`: `STRIPE_SECRET_KEY=sk_test_xxx` y `NOTIFICATION_PROVIDER=log`
- No se requieren credenciales de Firebase para desarrollo local
