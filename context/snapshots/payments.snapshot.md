# Snapshot — Módulo: payments (UBER_BASE) + custody-payments (Sprint 8)
> Última actualización: 2026-05-14 | Estado: ✅ Sprint 5 (UBER_BASE) + ✅ Sprint 8 (custody) completos

## Estado — UBER_BASE payments (viajes)
- Implementación: 100%
- Tests: ✅ 100% lines / 96% branches (umbral: 95%/90%) — 40 tests
- Integrado en app.ts: ✅

## Estado — custody-payments (Sprint 8)
- Implementación: 100%
- Tests: ✅ 100% lines / 100% branches — 17 tests (custody-payment-service.test.ts)
- Integrado en app.ts: ✅
- ADR-018: IPaymentGateway UBER_BASE reutilizada + BullMQ post-COMPLETED

### Archivos custody-payments
```
apps/api/src/modules/custody-payments/
  custody-payments.types.ts
  custody-payments.repository.ts
  custody-payments.service.ts      ← 100% cobertura
  custody-payments.controller.ts
  custody-payments.routes.ts
apps/api/src/queues/custody-payments.queue.ts
apps/api/src/workers/custody-payment-worker.ts
```

### Endpoint custody
```
GET /orders/:id/payment   → estado del cobro de la orden de custodia
```

### Flujo custody-payments
```
PATCH /orders/:id/complete → COMPLETED
  → custodyPaymentsQueue.add('process-payment', { orderId, tenantId })
  → worker: verifica idempotencia → resuelve método de pago → Stripe → completed|failed
```

## Responsabilidad
Cobro automático al pasajero al completar el viaje via Stripe PaymentIntent.
Procesamiento async vía BullMQ. Circuit breaker con opossum. Abstracción IPaymentGateway.

## Decisiones Sprint 5
- Stripe test mode via `STRIPE_SECRET_KEY=sk_test_xxx` — sin cambios de código entre ambientes
- `IPaymentGateway` abstracta — StripePaymentGateway como implementación, MockPaymentGateway en tests
- Reembolsos: descoped — Sprint 6+
- Webhooks Stripe: descoped — Sprint 6+

## Flujo de pago
```
1. trips.service → COMPLETED → encola job en BullMQ queue:payment
2. payment.worker → PaymentService.charge(tripId) con circuit breaker opossum
3. Éxito → payments.status = 'completed', charged_at = NOW()
4. Error → BullMQ reintenta 3 veces (backoff exponencial 5s)
5. Fallo total → payments.status = 'failed', failure_reason registrado
6. Siempre → encola job en queue:notification (processed o failed)
```

## Endpoint Sprint 5
```
GET /trips/:id/payment   → consultar estado del pago (solo pasajero del viaje)
```

## Tablas afectadas
`payments` · `passenger_payment_methods` (solo lectura)
Migración 017 — sin cambios de schema en Sprint 5.

## Reglas críticas
- R-PAY-001: Si Stripe falla, el viaje permanece COMPLETED — NO revertir estado
- R-PAY-002: Máx 3 reintentos → payments.status = failed + failure_reason
- R-PAY-003: Nunca almacenar números de tarjeta — solo stripe_pm_id (pm_xxxx)
- Sin payment_method guardado → failed inmediato, sin reintentos

## Circuit breaker (opossum) — ADR-027
Stripe: timeout 10s, threshold 30%, reset 120s

## Archivos implementados
```
apps/api/src/modules/payments/
├── payment.routes.ts
├── payment.controller.ts
├── payment.service.ts
├── payment.repository.ts
├── payment.worker.ts
├── payment.gateway.interface.ts   ← IPaymentGateway
├── stripe.payment.gateway.ts
└── payment.schemas.ts
```

## Spec
- `spec/sprint5/requirements.md` — RF-501, RF-502, RF-503, RF-506
- `spec/sprint5/design.md` — contratos completos
- `spec/sprint5/tasks.md` — PAY-001, PAY-002, PAY-003
