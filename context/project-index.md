# project-index.md — SistemaCustodias
> Leer PRIMERO en cada sesión. Fuente de verdad del proyecto.
> Última actualización: 2026-05-14 — Sprint 10 completado. Módulo compliance activo: GET /orders/:id/chain-of-custody + GET /orders/:id/chain-of-custody/pdf + GET /orders/:id/signatures, SHA-256 integridad, pdfkit, 28 tests 100% cobertura service, ADR-020.

---

## Stack (inamovible)

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 LTS |
| Lenguaje | TypeScript 5 strict |
| API | Fastify 4 |
| BD relacional | PostgreSQL 15 (TimescaleDB para tracking) |
| Cache / Pub-Sub | Redis 7 |
| Queue | BullMQ |
| ORM / Query | Knex |
| Mobile | React Native 0.81 + Expo SDK 54 |
| Web admin | Vite 5 + React 19 + TanStack Router |
| Mapas | Mapbox (rnmapbox/maps) |
| Pagos | Stripe |
| Notificaciones | FCM + SMS fallback |
| Monorepo | pnpm workspaces + Turborepo |

---

## Actores del sistema

| Actor | Código interno | Plataforma |
|---|---|---|
| Cliente | `client` | Mobile (flujo cliente) + Web |
| Custodio | `custodio` | Mobile (flujo operador) |
| Copiloto | `copiloto` | Mobile (flujo operador) |
| Despachador | `dispatcher` | Web |
| Supervisor | `supervisor` | Web |

---

## Tipos de custodia (`custody_types` table — escalables)

| Slug | Descripción | `value_declaration` schema clave |
|---|---|---|
| `cash_transport` | Efectivo, cheques, documentos bancarios | `amount_mxn, currency, denomination_breakdown` |
| `high_value_package` | Joyería, electrónicos, mercancía costosa | `description, estimated_value_mxn, insurance_required` |
| `confidential_docs` | Documentos legales, notariales, corporativos | `document_type, issuing_entity, sensitivity_level` |
| `vip_escort` | Escolta y protección de personas | `person_name, threat_level, route_restrictions` |

Agregar un nuevo tipo = solo un INSERT en `custody_types`. Sin cambios de código.

---

## Módulos del sistema

| # | Módulo | Estado | Descripción |
|---|---|---|---|
| 01 | `auth` | ✅ Sprint 1 | OTP, JWT con `tenant_id` + `role`, 5 roles custodia, TenantMiddleware |
| 02 | `clients` | ✅ Sprint 2 | CRUD clientes — POST/GET/PATCH/DELETE + GET /me |
| 03 | `operadores` | ✅ Sprint 2 | CRUD operadores — disponibilidad, suspensión, estado |
| 04 | `custody-orders` | ✅ Sprint 3 | State machine 18 estados, 20 endpoints, snapshots, audit log |
| 05 | `value-declaration` | ✅ Sprint 4 | POST/GET /orders/:id/value-declaration, Ajv JSONB schema, GET /custody-types, CustodyClientStack mobile |
| 06 | `routing` | ⬜ Pendiente | Planeación y validación de rutas seguras |
| 07 | `custody-tracking` | ✅ Sprint 5 | GPS tiempo real — TimescaleDB + WebSocket + geofence worker, 35 tests |
| 08 | `alerts` | ✅ Sprint 6 | AlertEngine (panic/tamper/geofence/custom), severity map, dedup 30s, supervisor-only critical, 34 tests |
| 09 | `custody-notifications` | ✅ Sprint 7 | FCM push + SMS fallback + CircuitBreaker Redis (threshold 5/60s), routing 12 estados, 44 tests |
| 10 | `payments` | ✅ Sprint 8 | Cobro automático Stripe post-COMPLETED, BullMQ worker, idempotencia, GET /orders/:id/payment |
| 11 | `custody-scheduler` | ✅ Sprint 9 | Recordatorios 24h/1h/15m + dispatch alerts, PATCH/DELETE /orders/:id/schedule, cron + FOR UPDATE SKIP LOCKED |
| 12 | `admin` | ⬜ Pendiente | Dashboard despachador/supervisor |
| 13 | `compliance` | ✅ Sprint 10 | Cadena de custodia, firmas digitales, reportes auditables + PDF, SHA-256, 28 tests |

## Migraciones aplicadas

```
M-001–038  UBER_BASE heredadas (ride-hailing)  ← no modificar
M-039      custody_types                        ✅ Sprint 1
M-040      clients                              ✅ Sprint 1
M-041      custody_vehicles                     ✅ Sprint 1
M-042      operators                            ✅ Sprint 1
M-043      custody_orders                       ✅ Sprint 1
M-044      value_declarations                   ✅ Sprint 1
M-045      order_transitions (INSERT-ONLY)      ✅ Sprint 1
M-046      security_alerts                      ✅ Sprint 1
M-047      location_readings (hypertable)       ✅ Sprint 1
M-048      pricing_rules                        ✅ Sprint 1
M-049      custody_payments                     ✅ Sprint 1
M-050      alter_companies_add_tenant_id        ✅ Sprint 1
M-051      alter_user_roles_add_custody_check   ✅ Sprint 1
```

---

## CustodyStateMachine — Estados y Transiciones

```
DRAFT
  → PENDING_APPROVAL        (cliente o despachador envía a aprobación)

PENDING_APPROVAL
  → APPROVED                (supervisor aprueba)
  → REJECTED                (supervisor rechaza con motivo obligatorio)
  → CANCELLED               (cliente/despachador cancela antes de aprobación)

APPROVED
  → ASSIGNED                (despachador asigna custodio + copiloto)
  → CANCELLED               (antes de asignación)

ASSIGNED
  → CREW_CONFIRMED          (custodio Y copiloto aceptan — ambos requeridos)
  → REASSIGNED              (despachador reasigna equipo)

CREW_CONFIRMED
  → EN_ROUTE_TO_PICKUP      (equipo sale hacia el punto de recolección)

EN_ROUTE_TO_PICKUP
  → AT_PICKUP               (equipo llega al punto de recolección)

AT_PICKUP
  → IN_TRANSIT              (cargo recibido y cargado — firma digital del cliente)
  → PICKUP_FAILED           (no se pudo recolectar — motivo obligatorio)

IN_TRANSIT
  → AT_DELIVERY             (equipo llega al destino)
  → INCIDENT                (incidente de seguridad reportado)

AT_DELIVERY
  → DELIVERED               (cargo entregado — firma digital del receptor)
  → DELIVERY_FAILED         (no se pudo entregar — motivo obligatorio)

DELIVERED
  → COMPLETED               (orden cerrada, pago procesado)

INCIDENT
  → IN_TRANSIT              (incidente resuelto, continúa tránsito)
  → RESOLVED                (incidente resuelto, orden terminada)
```

**Reglas críticas de la máquina de estados:**
- Toda transición registra `actor_id`, `actor_role`, `location`, `timestamp` en `order_transitions`
- `CREW_CONFIRMED` requiere confirmación de **ambos** — custodio y copiloto
- `IN_TRANSIT` genera `custody_snapshot` inmutable (tipo, valor declarado, equipo, vehículo)
- `APPROVED` genera `pricing_snapshot` inmutable
- Toda transición usa `SELECT FOR UPDATE` para evitar race conditions
- `AT_PICKUP→IN_TRANSIT` y `AT_DELIVERY→DELIVERED` requieren firma digital

---

## Schema de Base de Datos

### Tablas principales

```sql
-- Tipos de custodia (extensible sin código)
custody_types (
  id UUID PK, slug TEXT UNIQUE, name TEXT,
  value_declaration_schema JSONB,  -- JSON Schema para validar declaraciones
  active BOOL DEFAULT true, created_at TIMESTAMPTZ
)

-- Usuarios del sistema (todos los actores)
users (
  id UUID PK, phone TEXT UNIQUE, email TEXT UNIQUE,
  role ENUM('client','custodio','copiloto','dispatcher','supervisor'),
  first_name TEXT, last_name TEXT,
  deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)

-- Clientes (empresa o persona)
clients (
  id UUID PK, user_id UUID FK→users,
  company_name TEXT, rfc TEXT,
  contact_name TEXT, credit_limit_mxn DECIMAL,
  deleted_at TIMESTAMPTZ
)

-- Operadores (custodios y copilotos)
operators (
  id UUID PK, user_id UUID FK→users,
  operator_type ENUM('custodio','copiloto'),
  license_number TEXT, certifications JSONB,
  vehicle_id UUID FK→vehicles,
  status ENUM('available','busy','offline','suspended'),
  deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)

-- Vehículos blindados/seguros
vehicles (
  id UUID PK, plate TEXT UNIQUE, model TEXT, year INT,
  gps_device_id TEXT, active BOOL,
  deleted_at TIMESTAMPTZ
)

-- Órdenes de custodia (entidad principal)
custody_orders (
  id UUID PK, order_number TEXT UNIQUE,
  client_id UUID FK→clients,
  custody_type_id UUID FK→custody_types,
  status ENUM(todos los estados de la máquina),
  pickup_address JSONB, delivery_address JSONB,
  scheduled_at TIMESTAMPTZ,
  pickup_window_start TIMESTAMPTZ, pickup_window_end TIMESTAMPTZ,
  custodio_id UUID FK→operators,
  copiloto_id UUID FK→operators,
  approved_by UUID FK→users, approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  custody_snapshot JSONB,   -- inmutable desde IN_TRANSIT
  pricing_snapshot JSONB,   -- inmutable desde APPROVED
  notes TEXT,
  deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)

-- Declaración de valores (schema dinámico)
value_declarations (
  id UUID PK, order_id UUID FK→custody_orders,
  custody_type_id UUID FK→custody_types,
  declared_value JSONB,         -- validado contra custody_types.value_declaration_schema
  insurance_policy_id TEXT,
  verified_at TIMESTAMPTZ, verified_by UUID FK→users,
  created_at TIMESTAMPTZ
)

-- Audit log de transiciones
order_transitions (
  id UUID PK, order_id UUID FK→custody_orders,
  from_status TEXT, to_status TEXT,
  actor_id UUID FK→users, actor_role TEXT,
  location POINT, notes TEXT,
  digital_signature TEXT,
  created_at TIMESTAMPTZ
)

-- Tracking GPS (TimescaleDB hypertable)
location_readings (
  time TIMESTAMPTZ NOT NULL,
  order_id UUID, operator_id UUID, vehicle_id UUID,
  lat DECIMAL(10,8), lng DECIMAL(11,8),
  speed_kmh DECIMAL, accuracy_m DECIMAL, heading DECIMAL
)

-- Alertas de seguridad
security_alerts (
  id UUID PK, order_id UUID FK, operator_id UUID FK,
  alert_type ENUM('panic','tamper','geofence_violation','communication_loss','custom'),
  severity ENUM('low','medium','high','critical'),
  location POINT, description TEXT,
  resolved_at TIMESTAMPTZ, resolved_by UUID FK→users,
  created_at TIMESTAMPTZ
)

-- Reglas de precios por tipo de custodia
pricing_rules (
  id UUID PK, custody_type_id UUID FK,
  base_price_mxn DECIMAL, per_km_price DECIMAL,
  conditions JSONB, active BOOL
)

-- Pagos
payments (
  id UUID PK, order_id UUID FK, amount_mxn DECIMAL,
  status ENUM('pending','processing','completed','failed','refunded'),
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ
)

-- Notificaciones
notifications (
  id UUID PK, user_id UUID FK, order_id UUID FK,
  type TEXT, channel ENUM('push','sms','email'),
  status ENUM('pending','sent','failed'),
  sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
```

---

## Reglas de negocio críticas

1. **Aprobación obligatoria** — Toda orden pasa por PENDING_APPROVAL. Sin excepción.
2. **Regla dos-personas** — Toda orden asigna custodio + copiloto. No se confirma con solo uno.
3. **custody_snapshot inmutable** — Se genera al entrar a IN_TRANSIT. Nunca se reescribe.
4. **pricing_snapshot inmutable** — Se genera al entrar a APPROVED. Nunca se reescribe.
5. **Chain of custody** — Toda transición genera registro en `order_transitions` con actor y GPS.
6. **Soft delete siempre** — `deleted_at` en toda entidad. Nunca `DELETE` en BD.
7. **SELECT FOR UPDATE** — En toda transición de estado para evitar race conditions.
8. **Efectos secundarios fuera de transacción** — Notificaciones, alertas, WebSocket → BullMQ.
9. **Firma digital en puntos clave** — `AT_PICKUP→IN_TRANSIT` y `AT_DELIVERY→DELIVERED`.
10. **Tipos escalables** — Agregar tipo = INSERT en `custody_types`. Sin cambios de código.

---

## ADRs registradas

| # | Decisión | Estado |
|---|---|---|
| ADR-001 | Monolito modular (no microservicios) en MVP | ✅ Vigente |
| ADR-002 | TimescaleDB para tracking GPS (no InfluxDB) | ✅ Vigente |
| ADR-003 | BullMQ para efectos secundarios fuera de transacción | ✅ Vigente |
| ADR-004 | Tipos de custodia vía JSONB schema (no herencia de tablas) | ✅ Vigente |
| ADR-005 | Aprobación de supervisor obligatoria para toda orden | ✅ Vigente |
| ADR-006 | Regla dos-personas (custodio + copiloto) en toda orden | ✅ Vigente |
| ADR-007 | custody_snapshot + pricing_snapshot inmutables | ✅ Vigente |
| ADR-008 | Soft delete en todas las entidades | ✅ Vigente |
| ADR-009 | Multi-tenant activo desde S1 — TenantMiddleware antes de S3 | ✅ Vigente |
| ADR-010 | Módulos UBER_BASE intactos — dominio custodia en paralelo | ✅ Vigente |
| ADR-011 | GPS: IGpsProvider interface — MockAdapter MVP, WinlogAdapter posterior | ✅ Vigente |
| ADR-012 | CustodyEvent envelope con doble timestamp anti-fraude | ✅ Vigente |
| ADR-013 | Modelo de precios en dos niveles: por viaje (cliente) + renta fija (empresa custodio) | ✅ Vigente |
| ADR-014 | custody-tracking como módulo separado de tracking UBER_BASE | ✅ Vigente |
| ADR-015 | Socket.io namespace injection via setIo() post-construcción | ✅ Vigente |
| ADR-016 | AlertEngine como autoridad central para creación de alertas | ✅ Vigente |
| ADR-017 | CustodyNotificationService: FCM + SMS fallback + CircuitBreaker en Redis | ✅ Vigente |
| ADR-018 | CustodyPaymentService: reutiliza IPaymentGateway UBER_BASE + BullMQ post-COMPLETED | ✅ Vigente |
| ADR-019 | custody-scheduler: cron cada minuto + custody_scheduled_reminders + FOR UPDATE SKIP LOCKED | ✅ Vigente |
| ADR-020 | compliance: reporte on-demand + node:crypto SHA-256 + pdfkit | ✅ Vigente |

---

## Puertos locales

| Servicio | Puerto |
|---|---|
| API (Fastify) | 3333 |
| Web admin (Vite) | 3002 |
| Mobile (Expo) | 8081 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Bull Board | 3001 |
| Grafana | 3000 |

---

## Patrones de código establecidos

```typescript
// Transición de estado — patrón obligatorio
async function transitionOrder(
  orderId: string,
  toStatus: OrderStatus,
  actor: { id: string; role: ActorRole },
  opts?: { location?: Point; notes?: string; signature?: string }
): Promise<CustodyOrder> {
  return db.transaction(async (trx) => {
    const order = await trx('custody_orders')
      .where({ id: orderId })
      .forUpdate()           // SELECT FOR UPDATE obligatorio
      .first();

    CustodyStateMachine.validateTransition(order.status, toStatus);

    await trx('order_transitions').insert({
      order_id: orderId,
      from_status: order.status,
      to_status: toStatus,
      actor_id: actor.id,
      actor_role: actor.role,
      location: opts?.location
        ? db.raw('POINT(?, ?)', [opts.location.lng, opts.location.lat])
        : null,
      notes: opts?.notes,
      digital_signature: opts?.signature,
      created_at: new Date(),
    });

    const [updated] = await trx('custody_orders')
      .where({ id: orderId })
      .update({ status: toStatus, updated_at: new Date() })
      .returning('*');

    return updated;
  });
  // efectos secundarios → BullMQ FUERA de la transacción
}
```
