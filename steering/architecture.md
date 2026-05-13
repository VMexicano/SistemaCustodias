# Steering — Arquitectura
> Decisiones de stack inamovibles y restricciones de arquitectura.
> Antes de proponer cualquier cambio técnico, leer este archivo completo.
> Actualizado: 2026-05-13

---

## Decisiones inamovibles (no debatir en MVP)

| Decisión | Razón |
|---|---|
| Monolito modular (no microservicios) | Velocidad de iteración en MVP — ADR-001 |
| Node.js 20 + TypeScript 5 strict | Ecosistema mobile compartido y tipo-seguro |
| Fastify 4 (no Express, no NestJS) | Performance + schema-first nativo |
| PostgreSQL 15 + TimescaleDB | ACID para transacciones críticas + time-series para GPS |
| Redis 7 para cache y pub-sub | OTP, refresh tokens, WebSocket pub-sub, circuit breaker |
| BullMQ para colas | Efectos secundarios fuera de transacciones |
| Knex (no Prisma, no TypeORM) | Control total sobre SQL — crítico para SELECT FOR UPDATE |
| Expo SDK 54 (no bare workflow) | OTA updates, menor complejidad de build |
| Mapbox (no Google Maps) | Mejor soporte offline y tracking, mejor pricing para México |

---

## Principios de arquitectura

### 1. Transacciones de BD solo para estado

Las transacciones DB solo tocan tablas de estado (custody_orders, order_transitions, etc.).
Los efectos secundarios (notificaciones, WebSocket, alertas) siempre van a BullMQ **después** de que la transacción hace commit.

```
❌ Incorrecto: enviar FCM push dentro de db.transaction()
✅ Correcto: db.transaction() → commit → queue.add('send-notification', ...)
```

### 2. Snapshots inmutables

`custody_snapshot` y `pricing_snapshot` se escriben una sola vez y nunca se modifican.
Representan el estado acordado en el momento de la orden — son evidencia legal.

### 3. Monolito modular

Cada módulo es autocontenido: `routes + controller + service + repository + types`.
Los módulos se comunican a través de sus services — nunca importan el repository de otro módulo.

```
✅ ordersService.getById(id)         ← usa su propio repo
❌ import operatorsRepository from '../operadores/repository'  ← violación de módulo
```

### 4. TimescaleDB solo para time-series

La tabla `location_readings` es una hypertable de TimescaleDB.
Todas las demás tablas son PostgreSQL puro — no mezclar.

---

## Flujo de datos (C4 — nivel 2)

```
Cliente/Operador (Mobile)
  ↕ HTTPS/WSS
API (Fastify)
  ├── Módulos de negocio (custody-orders, alerts, tracking, ...)
  ├── PostgreSQL (estado + audit log)
  ├── TimescaleDB (location_readings)
  ├── Redis (OTP, tokens, pub-sub, circuit breaker)
  └── BullMQ Workers
        ├── notifications-worker → FCM + SMS
        ├── tracking-worker → geofence check
        └── compliance-worker → genera reportes

Despachador/Supervisor (Web)
  ↕ HTTPS/WSS
API (Fastify)  [mismo API]
```

---

## Seguridad

| Área | Implementación |
|---|---|
| Autenticación | JWT RS256 (15min) + refresh token opaco en Redis (30 días) |
| Autorización | RBAC por role en cada endpoint — middleware `authorize([roles])` |
| OTP | 6 dígitos, 5 min TTL, máx 3 intentos, Redis counter |
| Firma digital | Base64 SVG capturado en canvas, almacenado en order_transitions |
| Logs | Audit log inmutable en order_transitions — nunca UPDATE |
| Secrets | Variables de entorno — nunca en código, nunca en git |

---

## Restricciones de escalabilidad (MVP)

- No sharding de BD en MVP — PostgreSQL single node
- Horizontal scaling del API vía load balancer cuando sea necesario (stateless por diseño)
- TimescaleDB compresión automática de location_readings > 7 días
- Bull Board para monitoreo de queues

---

## ADRs vigentes

Ver `docs/13_decisions_log.md` para el registro completo con pros/contras.

| ADR | Resumen |
|---|---|
| ADR-001 | Monolito modular |
| ADR-002 | TimescaleDB para GPS |
| ADR-003 | BullMQ para efectos secundarios |
| ADR-004 | JSONB para tipos de custodia extensibles |
| ADR-005 | Aprobación obligatoria (nunca opcional) |
| ADR-006 | Regla dos-personas |
| ADR-007 | Snapshots inmutables |
| ADR-008 | Soft delete universal |
