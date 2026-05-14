# Snapshot: custody-notifications
> FCM push + SMS fallback + CircuitBreaker Redis — módulo custody separado del UBER_BASE.
> Última actualización: 2026-05-14 — Sprint 7 ✅ COMPLETO

---

## Estado de cobertura — Sprint 7

| Archivo | Lines | Branches | Funciones |
|---|---|---|---|
| `circuit-breaker.ts` | **100%** | **100%** | **100%** |
| `custody-notifications.service.ts` | **100%** | **100%** | **100%** |

Umbrales requeridos: circuit-breaker ≥ 90%/85%, service ≥ 80%/75% → **APROBADO**

Tests: 44 tests, 44 pasando · Suites: 2/2

---

## Archivo(s) principal(es)

```
apps/api/src/modules/custody-notifications/   ← módulo separado (ADR-014, ADR-017)
  custody-notifications.types.ts
  custody-notifications.repository.ts
  custody-notifications.service.ts
  sms.client.ts           (ISmsClient + LogSmsClient MVP)
  circuit-breaker.ts      (CircuitBreaker Redis)

apps/api/src/queues/custody-notifications.queue.ts
apps/api/src/workers/custody-notification-worker.ts
apps/api/migrations/20260514_052_create_notifications_table.ts
```

**NOTA:** El módulo `apps/api/src/modules/notifications/` pertenece al UBER_BASE (viajes/pagos). NO modificar.

---

## Canales disponibles

| Canal | Cuándo usar | Fallback |
|---|---|---|
| FCM push | Siempre como primer intento | SMS |
| SMS | Si FCM falla o actor no tiene app instalada | — |
| Email | Reportes y documentos (no alertas urgentes) | — |

---

## Notificaciones por evento

| Evento | Actor notificado | Canal | Prioridad |
|---|---|---|---|
| PENDING_APPROVAL creada | supervisor | push + SMS | high |
| APPROVED | client, custodio, copiloto, dispatcher | push | normal |
| REJECTED | client, dispatcher | push + SMS | high |
| ASSIGNED | custodio, copiloto | push + SMS | high |
| CREW_CONFIRMED | dispatcher, client | push | normal |
| EN_ROUTE_TO_PICKUP | client | push | normal |
| AT_PICKUP | client | push | normal |
| IN_TRANSIT | client | push | high |
| AT_DELIVERY | client | push | normal |
| DELIVERED | client, dispatcher | push | high |
| COMPLETED | client | push | normal |
| INCIDENT | supervisor, dispatcher | push + SMS | critical |
| panic alert | supervisor, dispatcher | push + SMS + llamada* | critical |

*La llamada es un webhook a servicio externo de llamadas automáticas.

---

## Flujo de notificación (BullMQ)

```
Transición de estado en custody-orders
  → (fuera de la transacción DB)
  → notificationsQueue.add('send-notification', payload)
  → notification-worker.ts procesa:
    1. Intenta FCM push
    2. Si falla → SMS fallback
    3. Registra resultado en notifications table
    4. Circuit breaker: si > 5 fallos en 60s → pausa FCM, solo SMS
```

---

## Circuit breaker

```typescript
// Estado del circuit breaker (en Redis)
{
  state: 'closed' | 'open' | 'half-open',
  failure_count: number,
  last_failure_at: string,
  next_attempt_at: string   // solo en 'open'
}
```

---

## Reglas

1. Las notificaciones siempre se despachan fuera de la transacción DB (BullMQ)
2. Las notificaciones `critical` tienen reintentos ilimitados con backoff exponencial
3. Las notificaciones `normal` tienen máximo 3 reintentos
4. El circuit breaker solo aplica a FCM — SMS es siempre el canal de respaldo final
5. Los tokens FCM de los usuarios se almacenan en `users.fcm_token` (actualizado al login)

---

## Dependencias entre módulos

- `custody-orders` — Dispara notificaciones en cada transición de estado
- `alerts` — Las alertas `critical` disparan notificaciones urgentes
- `auth` — Los tokens FCM se registran al autenticar
