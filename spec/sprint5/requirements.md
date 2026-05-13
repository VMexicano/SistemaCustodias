# Sprint 5 — Pagos y Notificaciones: Requirements

> **Fecha:** 2026-04-07
> **Estado:** Aprobado
> **Módulos:** Payments · Notifications

---

## Objetivo del sprint

Implementar el cobro automático al pasajero cuando un viaje se completa, usando Stripe en modo test para cert/QA y modo live para producción sin cambios de código. Añadir el sistema de notificaciones push con una arquitectura abstracta (LogChannel en dev, FCMChannel en prod) siguiendo el patrón establecido en ADR-018. Integrar ambos flujos con BullMQ y conectar los efectos secundarios pendientes de trips.service.ts (WebSocket emit + payment enqueue).

---

## Scope

| Incluye | Excluye |
|---|---|
| PaymentService con Stripe (PaymentIntent confirm) | Reembolsos / refunds |
| IPaymentGateway abstracta (testabilidad) | Pagos en efectivo |
| Stripe test mode via env var `sk_test_xxx` | Pagos parciales |
| BullMQ worker `payment` — retry exponencial 3 veces | MercadoPago, otros procesadores |
| BullMQ worker `notification` | SMS vía Twilio |
| INotificationChannel: LogChannel (dev) + FCMChannel (prod) | Notificaciones in-app (badge/inbox) |
| Circuit breakers: Stripe (opossum) + FCM (opossum) | Dashboard de notificaciones |
| Integración: trips COMPLETED → enqueue payment | Webhooks de Stripe |
| Integración: conectar emitTripStatusChanged() en trips.service | Tracking GPS (Sprint 6) |
| `GET /trips/:id/payment` — consultar estado del pago | Scheduler de pagos diferidos |
| Tests PaymentService ≥ 95% lines, 90% branches | Tests E2E móvil (Sprint 7) |
| Tests NotificationService ≥ 75% lines | — |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| **Pasajero** | Ser cobrado correctamente al completar el viaje; recibir push de confirmación de pago |
| **Conductor** | Recibir push cuando el pasajero es cobrado (ganancia confirmada) |
| **Sistema** | Encolar cobro al completar viaje, reintentar si Stripe falla, notificar resultado |
| **Dev/QA** | Poder probar el flujo completo sin tarjeta real — usando `sk_test_xxx` de Stripe |

---

## Requerimientos funcionales

### RF-501 — Cobro automático al completar el viaje

**Como** sistema, **quiero** cobrar automáticamente al pasajero cuando el viaje pasa a `COMPLETED`, **para** que el conductor confirme su ganancia sin intervención manual.

Criterios de aceptación:
- [ ] Cuando `trips.service` transiciona a `COMPLETED`, se encola un job en la queue `payment`
- [ ] El worker crea un `PaymentIntent` de Stripe por el monto `final_fare` en centavos
- [ ] El `stripe_pm_id` del método de pago por defecto del pasajero se usa como `payment_method`
- [ ] Si el cobro es exitoso: `payments.status = 'completed'` y `charged_at = NOW()`
- [ ] Si Stripe falla: `payments.status = 'failed'`, `failure_reason` registrado, `retry_count` incrementado
- [ ] El job tiene 3 reintentos con backoff exponencial antes de marcar definitivamente como fallido
- [ ] Si el pasajero no tiene método de pago guardado: `payments.status = 'failed'` sin reintentar

### RF-502 — Modo test/sandbox para Stripe

**Como** desarrollador o QA, **quiero** ejecutar flujos de pago completos sin tarjeta real, **para** probar en ambientes de desarrollo y certificación.

Criterios de aceptación:
- [ ] Cambiar `STRIPE_SECRET_KEY=sk_test_xxx` activa automáticamente el modo test de Stripe
- [ ] Con `4242 4242 4242 4242` simulado vía Stripe test, el flujo de cobro es exitoso
- [ ] Con `4000 0000 0000 0002` simulado, el worker registra el fallo correctamente
- [ ] No requiere cambios de código entre ambientes test y producción

### RF-503 — Circuit breaker en Stripe

**Como** sistema, **quiero** detectar cuando Stripe no responde, **para** no bloquear el worker indefinidamente y reintentar de forma controlada.

Criterios de aceptación:
- [ ] Timeout de 10 segundos por llamada a Stripe
- [ ] Si ≥ 30% de las llamadas fallan en una ventana: el circuit breaker abre
- [ ] Con breaker abierto: el job falla inmediatamente (sin timeout) y BullMQ lo reencola
- [ ] El breaker se resetea automáticamente después de 120 segundos

### RF-504 — Notificaciones push en eventos del viaje

**Como** pasajero o conductor, **quiero** recibir push notifications en cada evento relevante del viaje, **para** estar informado sin hacer polling.

Criterios de aceptación:
- [ ] El pasajero recibe push en: `trip_accepted`, `driver_arrived`, `trip_completed`, `payment_processed`, `payment_failed`
- [ ] El conductor recibe push en: `trip_completed`
- [ ] En ambiente dev (`NOTIFICATION_PROVIDER=log`): las notificaciones se imprimen en consola con el payload completo
- [ ] En ambiente prod (`NOTIFICATION_PROVIDER=fcm`): se envía via Firebase Admin SDK
- [ ] Si FCM falla: el error se loggea, el job falla, BullMQ reintenta (máximo 3 veces)

### RF-505 — Circuit breaker en FCM

**Como** sistema, **quiero** detectar cuando FCM no responde, **para** no bloquear el worker de notificaciones.

Criterios de aceptación:
- [ ] Timeout de 5 segundos por llamada a FCM
- [ ] Si ≥ 50% de las llamadas fallan: el circuit breaker abre
- [ ] Reseteo automático a los 30 segundos
- [ ] Con breaker abierto: el job falla inmediatamente, BullMQ reintenta

### RF-506 — Consultar estado del pago de un viaje

**Como** pasajero, **quiero** consultar el estado del pago de un viaje, **para** saber si mi tarjeta fue cargada correctamente.

Criterios de aceptación:
- [ ] `GET /trips/:id/payment` retorna el registro de pago con `status`, `amount`, `charged_at`
- [ ] Solo el pasajero del viaje puede consultar su pago (403 si es otro usuario)
- [ ] Si el pago aún no existe (job pendiente): retorna 404 con código `PAYMENT_NOT_FOUND`
- [ ] Si el viaje no existe: retorna 404 con código `TRIP_NOT_FOUND`

### RF-507 — Integración WebSocket en trips.service (pendiente Sprint 4)

**Como** pasajero o conductor, **quiero** recibir eventos WebSocket en cada transición de estado, **para** ver la actualización en tiempo real en la app.

Criterios de aceptación:
- [ ] `trips.service.ts` llama a `emitTripStatusChanged()` después de cada transición exitosa
- [ ] El emit ocurre FUERA de la transacción de BD (evitar efectos secundarios en trx)
- [ ] Los tests existentes de realtime.test.ts siguen pasando sin modificación

---

## Requerimientos no funcionales

| Requerimiento | Valor |
|---|---|
| Latencia `GET /trips/:id/payment` | < 100ms |
| Timeout Stripe | 10 segundos |
| Timeout FCM | 5 segundos |
| Reintentos BullMQ (payment) | 3 con backoff exponencial |
| Reintentos BullMQ (notification) | 3 con backoff exponencial |
| Cobertura PaymentService | ≥ 95% lines, ≥ 90% branches |
| Cobertura NotificationService | ≥ 75% lines |
| Cobertura global | ≥ 75% lines |

---

## Restricciones técnicas inamovibles

```
✓ IPaymentGateway abstracta — no llamar Stripe directamente desde PaymentService
✓ INotificationChannel abstracta — no llamar FCM directamente desde NotificationService
✓ Efectos secundarios (BullMQ enqueue, WebSocket emit) FUERA de transacciones de BD
✓ Nunca almacenar números de tarjeta — solo stripe_pm_id (R-PAY-003)
✓ Stripe test mode controlado únicamente por STRIPE_SECRET_KEY — sin flags en código
✓ Circuit breaker obligatorio en toda llamada a servicio externo (Stripe, FCM)
✓ Soft delete (deleted_at) — nunca DELETE
✓ Audit log en cambios de entidades de negocio (payments)
```

---

## Decisiones pendientes que NO bloquean este sprint

| Decisión | Sprint que la necesita |
|---|---|
| Reembolsos automáticos (passenger cancela después de IN_PROGRESS) | Sprint 6 |
| Webhooks de Stripe (reconciliación asíncrona) | Sprint 6 |
| Notificaciones in-app / inbox de mensajes | Sprint 7 |
| SMS fallback via Twilio para payment_failed | Sprint 6+ (si negocio lo requiere) |
| FCM tokens de dispositivo — cómo se registran desde mobile | Sprint 7 |
