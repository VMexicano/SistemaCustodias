# Sprint 7 — Tasks: Módulo Notifications

**Sprint:** 7 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Grupo 1 — Sin dependencias

### NOTIF-001 — Backend módulo notifications + integración

**Tipo:** FEATURE
**Agente:** backend
**Depende de:** ninguna
**Irreversible:** sí — migración M-052 (tabla notifications)

**Checklist SDD:**
- [x] schema_verified — notifications: id, user_id, order_id, alert_id, channel, priority, status, title, body, sent_at, created_at
- [x] dependencies_verified — BullMQ ya instalado, Redis ya instalado, Knex ya instalado
- [x] actor_resolution — Los users se resuelven por role dentro del tenant (supervisor, dispatcher) o por FK directa (client_id, custodio_id, copiloto_id)
- [x] circuit_breaker_scope — CircuitBreaker solo aplica a FCM; SMS es siempre disponible

**Archivos a crear:**
```
apps/api/src/modules/custody-notifications/
  custody-notifications.types.ts
  custody-notifications.repository.ts
  custody-notifications.service.ts
  sms.client.ts              ← ISmsClient + LogSmsClient (MVP)
  circuit-breaker.ts         ← CircuitBreaker Redis closed/open/half-open

apps/api/src/queues/custody-notifications.queue.ts
apps/api/src/workers/custody-notification-worker.ts
apps/api/migrations/052_create_notifications_table.ts
```

**IMPORTANTE — evitar conflicto UBER_BASE:**
El módulo se llama `custody-notifications/` (NO `notifications/`).
El módulo `notifications/` existente es del UBER_BASE (viajes/pagos) — NO MODIFICAR.
Reutilizar `INotificationChannel` de `modules/notifications/notification.channel.interface.js` para FCM push.

**Archivos a modificar:**
```
apps/api/src/modules/custody-orders/custody-orders.controller.ts  ← +notificationsQueue en todas las transiciones
apps/api/src/modules/alerts/alert-engine.ts                        ← +notificationsQueue opcional (4to param)
apps/api/src/app.ts                                                 ← wiring NotificationService + worker
apps/api/src/config/environment.ts                                  ← FCM_ENABLED (bool, default false MVP)
```

**Definition of Done:**
- [ ] TypeScript: 0 errores
- [ ] NotificationService.send() con FCM primary → SMS fallback
- [ ] CircuitBreaker: closed/open/half-open funcional con Redis
- [ ] BullMQ worker procesa jobs 'order-transition' y 'alert'
- [ ] Routing table cubre los 12 estados de la tabla RF-003
- [ ] AlertEngine pasa notificationsQueue para alertas panic
- [ ] app.ts registra worker y pasa queue a ordersRoutes
- [ ] Migración M-052 corre sin error

---

## Grupo 2 — Espera NOTIF-001

### NOTIF-QA-001 — Tests NotificationService + CircuitBreaker

**Tipo:** QA_ONLY
**Agente:** qa
**Depende de:** NOTIF-001
**Irreversible:** no

**Archivos a crear:**
```
apps/api/src/__tests__/custody-notifications/
  custody-notification-service.test.ts
  circuit-breaker.test.ts
```

**Cobertura requerida:**
| Módulo | Umbral |
|---|---|
| `NotificationService` | ≥ 80% lines / ≥ 75% branches |
| `CircuitBreaker` | ≥ 90% lines / ≥ 85% branches |

**Casos de test obligatorios:**

NotificationService:
- push success → FCM enviado, status=sent, circuitBreaker.recordSuccess llamado
- push FCM falla → circuitBreaker.recordFailure, fallback SMS, status=sent
- push circuit open → skip FCM directo a SMS
- push sin fcm_token → skipped FCM, usa SMS
- push sin phone → status=skipped ambos
- sms success → SMS enviado, status=sent
- sms falla → status=failed

CircuitBreaker:
- estado inicial: closed
- recordFailure × 4 → sigue closed
- recordFailure × 5 → pasa a open
- isOpen() = true cuando open
- recordSuccess() en half-open → closed
- recordFailure() en half-open → open de nuevo
- reset() → closed, failures=0

**Definition of Done:**
- [ ] Todos los tests pasan
- [ ] NotificationService ≥ 80% lines / ≥ 75% branches
- [ ] CircuitBreaker ≥ 90% lines / ≥ 85% branches
- [ ] TypeScript 0 errores
