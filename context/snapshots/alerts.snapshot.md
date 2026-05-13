# Snapshot: alerts
> Sistema de alertas de seguridad — botón de pánico, tamper, geofence, incidentes.
> Última actualización: 2026-05-13 — Sprint 0

---

## Archivo(s) principal(es)

```
apps/api/src/modules/alerts/
  alerts.routes.ts
  alerts.controller.ts
  alerts.service.ts
  alerts.repository.ts
  alert-engine.ts         ← 95% cobertura obligatoria
  alerts.types.ts
```

---

## Tipos de alerta

| Tipo | Código | Severidad default | Disparado por |
|---|---|---|---|
| Botón de pánico | `panic` | critical | custodio, copiloto (app) |
| Tamper detection | `tamper` | high | GPS device (hardware) |
| Violación de geocerca | `geofence_violation` | medium | Sistema automático |
| Pérdida de comunicación | `communication_loss` | high | Sistema automático |
| Alerta personalizada | `custom` | variable | supervisor, dispatcher |

---

## Severidades

```
critical  → Notificación inmediata + llamada telefónica al despachador + supervisor
high      → Notificación push + SMS inmediatos
medium    → Notificación push
low       → Solo registro en BD
```

---

## Flujo de botón de pánico

```
1. Operador presiona botón en app
2. App envía POST /alerts con type='panic', location, order_id
3. AlertEngine registra en security_alerts (severity=critical)
4. BullMQ despacha job inmediato:
   a. Notificación push + SMS a dispatcher y supervisor
   b. Actualiza la orden a status=INCIDENT
   c. Emite evento WebSocket a dashboard admin
5. Dashboard muestra orden en mapa con alerta roja
6. Supervisor resuelve: INCIDENT → IN_TRANSIT o INCIDENT → RESOLVED
```

---

## Geocerca

- Cada orden tiene una ruta declarada (polyline)
- Durante IN_TRANSIT, si el vehículo se desvía más de X metros de la ruta → alerta automática
- El threshold de desvío es configurable por tipo de custodia en `custody_types`

---

## Endpoints

| Método | Ruta | Actor | Descripción |
|---|---|---|---|
| POST | `/alerts` | custodio, copiloto | Crear alerta (incluye pánico) |
| GET | `/alerts` | dispatcher, supervisor | Listar alertas activas |
| GET | `/alerts/:id` | dispatcher, supervisor | Ver alerta por ID |
| PATCH | `/alerts/:id/resolve` | supervisor | Resolver alerta |
| GET | `/orders/:id/alerts` | dispatcher, supervisor | Alertas de una orden |

---

## Schema de alerta

```typescript
interface SecurityAlert {
  id: string;
  order_id: string;
  operator_id: string;
  alert_type: 'panic' | 'tamper' | 'geofence_violation' | 'communication_loss' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location?: { lat: number; lng: number };
  description?: string;
  resolved_at?: Date;
  resolved_by?: string;
  created_at: Date;
}
```

---

## AlertEngine — lógica central

```typescript
class AlertEngine {
  // Valida que la orden existe y está en estado activo
  async validateOrderForAlert(orderId: string): Promise<CustodyOrder>

  // Crea la alerta y despacha efectos secundarios (BullMQ)
  async createAlert(payload: CreateAlertPayload): Promise<SecurityAlert>

  // Verifica si el vehículo se desvió de la ruta
  async checkGeofence(orderId: string, location: Point): Promise<boolean>

  // Resuelve la alerta y actualiza la orden si es necesario
  async resolveAlert(alertId: string, resolvedBy: string): Promise<SecurityAlert>
}
```

---

## Reglas de negocio

1. Las alertas `panic` siempre cambian la orden a `INCIDENT` automáticamente
2. Los registros de alertas son inmutables — nunca UPDATE, solo INSERT y resolved_at
3. Un botón de pánico repetido en < 30 segundos se ignora (dedup por order_id + operator_id)
4. Las alertas `critical` y `high` siempre tienen efectos secundarios en BullMQ (fuera de transacción)
5. Solo el supervisor puede resolver alertas `critical`

---

## Dependencias entre módulos

- `custody-orders` — Las alertas referencian la orden activa
- `tracking` — La ubicación GPS se incluye en la alerta
- `notifications` — BullMQ worker notifica a dispatcher y supervisor
- `operadores` — Las alertas se originan desde un operador
