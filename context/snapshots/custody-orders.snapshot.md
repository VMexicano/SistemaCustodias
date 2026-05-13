# Snapshot: custody-orders
> Módulo más crítico. State machine + aprobación + asignación de equipo.
> Última actualización: 2026-05-13 — Sprint 0

---

## Archivo(s) principal(es)

```
apps/api/src/modules/custody-orders/
  custody-orders.routes.ts
  custody-orders.controller.ts
  custody-orders.service.ts
  custody-orders.repository.ts
  custody-state-machine.ts      ← 100% cobertura obligatoria
  custody-orders.schemas.ts
  custody-orders.types.ts
```

---

## CustodyStateMachine — Transiciones válidas

```typescript
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:               ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL:    ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:            ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:            ['CREW_CONFIRMED', 'REASSIGNED'],
  REASSIGNED:          ['CREW_CONFIRMED'],
  CREW_CONFIRMED:      ['EN_ROUTE_TO_PICKUP'],
  EN_ROUTE_TO_PICKUP:  ['AT_PICKUP'],
  AT_PICKUP:           ['IN_TRANSIT', 'PICKUP_FAILED'],
  IN_TRANSIT:          ['AT_DELIVERY', 'INCIDENT'],
  AT_DELIVERY:         ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED:           ['COMPLETED'],
  INCIDENT:            ['IN_TRANSIT', 'RESOLVED'],
  // Estados finales — sin transiciones
  COMPLETED:           [],
  REJECTED:            [],
  CANCELLED:           [],
  PICKUP_FAILED:       [],
  DELIVERY_FAILED:     [],
  RESOLVED:            [],
};
```

---

## Endpoints

| Método | Ruta | Actor | Descripción |
|---|---|---|---|
| POST | `/orders` | client, dispatcher | Crear orden (DRAFT) |
| GET | `/orders` | dispatcher, supervisor | Listar órdenes con filtros |
| GET | `/orders/:id` | all | Ver orden por ID |
| PATCH | `/orders/:id/submit` | client, dispatcher | DRAFT → PENDING_APPROVAL |
| PATCH | `/orders/:id/approve` | supervisor | PENDING_APPROVAL → APPROVED |
| PATCH | `/orders/:id/reject` | supervisor | PENDING_APPROVAL → REJECTED |
| PATCH | `/orders/:id/cancel` | client, dispatcher | Cancelar (desde DRAFT/PENDING_APPROVAL/APPROVED) |
| PATCH | `/orders/:id/assign` | dispatcher | APPROVED → ASSIGNED |
| PATCH | `/orders/:id/confirm-crew` | custodio, copiloto | ASSIGNED → CREW_CONFIRMED |
| PATCH | `/orders/:id/depart` | custodio | CREW_CONFIRMED → EN_ROUTE_TO_PICKUP |
| PATCH | `/orders/:id/arrive-pickup` | custodio | EN_ROUTE_TO_PICKUP → AT_PICKUP |
| PATCH | `/orders/:id/pickup` | custodio | AT_PICKUP → IN_TRANSIT (requiere firma) |
| PATCH | `/orders/:id/arrive-delivery` | custodio | IN_TRANSIT → AT_DELIVERY |
| PATCH | `/orders/:id/deliver` | custodio | AT_DELIVERY → DELIVERED (requiere firma) |
| PATCH | `/orders/:id/complete` | dispatcher, supervisor | DELIVERED → COMPLETED |
| PATCH | `/orders/:id/report-incident` | custodio, copiloto | IN_TRANSIT → INCIDENT |
| PATCH | `/orders/:id/resolve-incident` | supervisor | INCIDENT → IN_TRANSIT/RESOLVED |
| GET | `/orders/:id/transitions` | all | Historial de transiciones (audit log) |

---

## Reglas de negocio críticas

1. `PENDING_APPROVAL → REJECTED` requiere `rejected_reason` (no nulo, mín 10 chars)
2. `APPROVED → ASSIGNED` requiere `custodio_id` Y `copiloto_id` — ambos obligatorios
3. `ASSIGNED → CREW_CONFIRMED` requiere confirmación de custodio Y copiloto (dos registros)
4. `AT_PICKUP → IN_TRANSIT` requiere `digital_signature` del cliente + genera `custody_snapshot`
5. `AT_DELIVERY → DELIVERED` requiere `digital_signature` del receptor
6. `APPROVED` genera `pricing_snapshot` inmutable
7. Toda transición usa `SELECT FOR UPDATE` en `custody_orders`
8. Efectos secundarios siempre en BullMQ fuera de la transacción

---

## custody_snapshot (inmutable desde IN_TRANSIT)

```typescript
interface CustodySnapshot {
  order_id: string;
  order_number: string;
  custody_type: { slug: string; name: string };
  value_declaration: Record<string, unknown>;
  client: { id: string; name: string };
  custodio: { id: string; name: string; license: string };
  copiloto: { id: string; name: string; license: string };
  vehicle: { id: string; plate: string; model: string };
  pickup_address: Address;
  delivery_address: Address;
  in_transit_at: string;   // ISO 8601
}
```

---

## pricing_snapshot (inmutable desde APPROVED)

```typescript
interface PricingSnapshot {
  base_price_mxn: number;
  distance_km: number;
  per_km_price: number;
  subtotal_mxn: number;
  iva_mxn: number;
  total_mxn: number;
  rule_id: string;
  calculated_at: string;  // ISO 8601
}
```

---

## Dependencias entre módulos

- `value-declaration` — La orden referencia una declaración de valores
- `operadores` — La orden asigna custodio + copiloto por su ID
- `tracking` — Durante IN_TRANSIT se reciben location_readings asociados a la orden
- `alerts` — INCIDENT dispara una security_alert
- `payments` — COMPLETED dispara el procesamiento de pago
- `notifications` — Toda transición notifica a los actores relevantes
- `compliance` — IN_TRANSIT y DELIVERED generan registros de cadena de custodia
