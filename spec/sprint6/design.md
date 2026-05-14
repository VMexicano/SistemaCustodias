# Sprint 6 — Design: Módulo Alerts

**Sprint:** 6 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Arquitectura del módulo

```
apps/api/src/modules/alerts/
  alerts.types.ts
  alerts.repository.ts
  alert-engine.ts        ← lógica central — 95% cobertura obligatoria
  alerts.controller.ts
  alerts.routes.ts

apps/api/src/workers/
  geofence-check.worker.ts  ← REFACTORIZAR para usar AlertEngine
```

### Dependencias del AlertEngine

```typescript
class AlertEngine {
  constructor(
    private repo: AlertsRepository,
    private db: Knex,
    private ordersService: CustodyOrdersService,  // para panic → INCIDENT
  ) {}
}
```

---

## Contrato de API

### POST /alerts

```
Auth: JWT — onRequest: [authenticate, authorize('custodio', 'copiloto'), tenantGuard]

Body:
{
  order_id:     string (minLength: 1)
  alert_type:   'panic' | 'tamper' | 'geofence_violation' | 'communication_loss' | 'custom'
  location?:    { lat: number, lng: number }
  description?: string (maxLength: 2000)
}

Response 201:
{
  id: string, order_id: string, operator_id: string,
  alert_type: string, severity: string,
  location: {lat, lng} | null, description: string | null,
  resolved_at: null, created_at: string
}

Errors:
  400 VALIDATION_ERROR
  403 OPERATOR_NOT_ASSIGNED
  404 ORDER_NOT_FOUND
  409 ORDER_NOT_ACTIVE_FOR_ALERT
  409 PANIC_ALERT_TOO_SOON
```

### GET /alerts

```
Auth: JWT — dispatcher, supervisor
Query: order_id?: string, resolved?: 'true'|'false', limit?: number (max 200, default 50)
Response 200: { alerts: SecurityAlert[], count: number }
```

### GET /alerts/:id

```
Auth: JWT — dispatcher, supervisor
Response 200: SecurityAlert
Errors: 404 ALERT_NOT_FOUND
```

### PATCH /alerts/:id/resolve

```
Auth: JWT — supervisor
Body: { notes?: string }
Response 200: SecurityAlert (con resolved_at y resolved_by)
Errors:
  404 ALERT_NOT_FOUND
  409 ALERT_ALREADY_RESOLVED
  403 ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL  (si severity=critical y role≠supervisor)
```

### GET /orders/:id/alerts

```
Auth: JWT — dispatcher, supervisor
Response 200: { order_id: string, alerts: SecurityAlert[], count: number }
Errors: 404 ORDER_NOT_FOUND
```

---

## AlertEngine — lógica central

```typescript
const ALERTABLE_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_DELIVERY', 'INCIDENT'
]);

const SEVERITY_MAP: Record<AlertType, Severity> = {
  panic:               'critical',
  tamper:              'high',
  geofence_violation:  'medium',
  communication_loss:  'high',
  custom:              'low',
};

const PANIC_DEDUP_SECONDS = 30;

async validateOrderForAlert(orderId: string, operatorId: string): Promise<CustodyOrder>
  // 1. SELECT custody_orders WHERE id = orderId AND deleted_at IS NULL
  // 2. Si no existe → ORDER_NOT_FOUND
  // 3. Si status NOT IN ALERTABLE_STATUSES → ORDER_NOT_ACTIVE_FOR_ALERT
  // 4. Si custodio_id ≠ operatorId AND copiloto_id ≠ operatorId → OPERATOR_NOT_ASSIGNED
  // 5. return order

async createAlert(payload: CreateAlertPayload, userId: string, operatorId: string): Promise<SecurityAlert>
  // 1. validateOrderForAlert(order_id, operatorId)
  // 2. Si alert_type = 'panic':
  //    a. Verificar dedup: SELECT WHERE order_id=? AND operator_id=? AND alert_type='panic'
  //                                AND created_at > NOW() - INTERVAL '30 seconds'
  //    b. Si existe → PANIC_ALERT_TOO_SOON
  //    c. Determinar severity = SEVERITY_MAP[alert_type]
  // 3. INSERT en security_alerts (via repo.create())
  // 4. Si alert_type = 'panic':
  //    → ordersService.reportIncident(order_id, { userId, role: 'custodio' }, description)
  //    (fuera de transacción — side effect)
  // 5. return alert

async resolveAlert(alertId: string, resolverUserId: string, resolverRole: string): Promise<SecurityAlert>
  // 1. findById(alertId) → ALERT_NOT_FOUND si no existe
  // 2. Si alert.resolved_at ≠ null → ALERT_ALREADY_RESOLVED
  // 3. Si alert.severity = 'critical' AND resolverRole ≠ 'supervisor' → ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL
  // 4. UPDATE security_alerts SET resolved_at=NOW(), resolved_by=resolverUserId WHERE id=alertId
  // 5. return updated alert
```

---

## Tabla security_alerts — Knex patterns

```typescript
// INSERT — usar Knex query builder (no raw, no TimescaleDB needed)
const [alert] = await db('security_alerts')
  .insert({
    order_id, operator_id, alert_type, severity,
    location: location ? db.raw('POINT(?, ?)', [location.lng, location.lat]) : null,
    description: description ?? null,
    created_at: new Date(),
  })
  .returning('*');

// SELECT con filtros opcionales
const rows = await db('security_alerts')
  .where({ order_id })
  .modify((qb) => {
    if (resolved === false) qb.whereNull('resolved_at');
    if (resolved === true) qb.whereNotNull('resolved_at');
  })
  .orderBy('created_at', 'desc')
  .limit(limit);
```

**PUNTO DE DATOS IMPORTANTE:** La columna `location` es tipo `POINT` en PostgreSQL. Al leerla desde Knex, el driver pg devuelve una string en formato `(lng,lat)`. Al insertarla, usar `db.raw('POINT(?, ?)', [lng, lat])`. En el response HTTP, convertir a `{ lat, lng }` con un parser.

---

## Refactor geofence-check.worker.ts

El worker actual inserta directo en `security_alerts`. Debe ser refactorizado para llamar a `AlertEngine`:

```typescript
// ANTES (eliminar):
await db.raw(`INSERT INTO security_alerts ...`);

// DESPUÉS:
await alertEngine.createAlert(
  { order_id, alert_type: 'geofence_violation', location: { lat, lng } },
  operator_id,  // userId del operador (o usar operator_id como proxy)
  operator_id,
);
```

El `AlertEngine` se instancia en `app.ts` y se pasa al worker via `registerGeofenceWorker(db, redis, alertEngine)`.

---

## Nuevos BusinessErrorCodes

```typescript
| 'ALERT_NOT_FOUND'                    // 404
| 'ALERT_ALREADY_RESOLVED'             // 409
| 'PANIC_ALERT_TOO_SOON'               // 409
| 'ORDER_NOT_ACTIVE_FOR_ALERT'         // 409
| 'ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL' // 403
```

---

## ADR-016 — AlertEngine como autoridad central para creación de alertas

**Decisión:** Cualquier módulo que necesite crear una alerta (geofence worker, futuros timers, módulos de compliance) debe llamar a `AlertEngine.createAlert()`. Nunca INSERT directo en `security_alerts`.

**Razón:** Centraliza la lógica de severidad, deduplicación, side effects (panic → INCIDENT) y futura integración con notifications. El geofence worker del Sprint 5 se refactoriza como deuda técnica.
