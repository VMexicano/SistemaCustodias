# Snapshot — custody-scheduler

**Estado:** ✅ Sprint 9 completo
**Última actualización:** 2026-05-14

## Módulo implementado

### CustodySchedulerService (`apps/api/src/modules/custody-scheduler/`)
- `custody-scheduler.repository.ts` — `getOrdersNeedingReminders` (FOR UPDATE SKIP LOCKED), `getUnassignedOpenOrders`, `markReminderSent` (ON CONFLICT IGNORE)
- `custody-scheduler.service.ts` — cron cada minuto, `scanUpcomingReminders` + `scanDispatchAlerts` en paralelo

### Endpoints REST (en `custody-orders.routes.ts`)
| Método | Path | Auth | Descripción |
|---|---|---|---|
| PATCH | /orders/:id/schedule | client, dispatcher | Establece `scheduled_at` + ventanas en orden DRAFT |
| DELETE | /orders/:id/schedule | client, dispatcher | Limpia programación en orden DRAFT |

### Tabla de BD — `custody_scheduled_reminders` (M-053)
```sql
custody_scheduled_reminders (
  id UUID PK,
  order_id UUID FK→custody_orders,
  reminder_type TEXT,   -- 'reminder_24h' | 'reminder_1h' | 'reminder_15m' | 'dispatch_alert'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  UNIQUE(order_id, reminder_type)
)
```

## Flujo de recordatorios

1. Cron cada minuto busca órdenes con `scheduled_at` en ventana (23.5h–24.5h / 50–70m / 10–20m)
2. Verifica que no exista ya en `custody_scheduled_reminders` (NOT EXISTS en SQL)
3. Inserta registro de deduplicación (ANTES de encolar — dedup-first pattern)
4. Encola job `reminder` en `custodyNotificationsQueue` (fuera de transacción)

## Flujo de dispatch alerts

1. Cron cada minuto busca órdenes APPROVED sin custodio con `pickup_window_start <= now()`
2. Verifica que no se haya enviado `dispatch_alert` ya
3. Marca + encola job `dispatch-alert` para notificar al dispatcher

## Business error codes nuevos

| Código | HTTP | Cuándo |
|---|---|---|
| `ORDER_NOT_IN_DRAFT_STATUS` | 409 | PATCH/DELETE /schedule en orden no-DRAFT |
| `SCHEDULED_AT_TOO_SOON` | 422 | `scheduled_at` < now + 30 min |
| `INVALID_PICKUP_WINDOW` | 422 | `pickup_window_end` <= `pickup_window_start` |

## Cobertura de tests

- `CustodySchedulerService`: **100% lines / 100% branches** (umbral: ≥90% / ≥85%) ✅
- Tests: `custody-scheduler.service.test.ts` — 15 casos
- ADR-019 documentado

## Dependencias

- `node-cron` ^4.x (ya instalado — UBER_BASE Sprint 6)
- `custodyNotificationsQueue` (Sprint 7)
- `custody_orders` tabla — campos `scheduled_at`, `pickup_window_start`, `pickup_window_end` existentes desde M-043
