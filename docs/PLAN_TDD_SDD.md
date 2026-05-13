# Plan TDD/SDD — Plataforma UBER Base

> **Generado:** 2026-04-04
> **Estado del proyecto:** Pre-desarrollo — arquitectura definida, código = 0%
> **Propósito:** Guía maestra de specs, tests y steering para el desarrollo del MVP.

---

## Índice

1. [Estructura de documentación](#1-estructura-de-documentación)
2. [Steering del proyecto](#2-steering-del-proyecto)
3. [SDD — Software Design Specs por módulo](#3-sdd---software-design-specs-por-módulo)
4. [TDD — Test Specs por módulo](#4-tdd---test-specs-por-módulo)
5. [Checklist de Definition of Done](#5-checklist-de-definition-of-done)
6. [Orden de implementación](#6-orden-de-implementación)

---

## 1. Estructura de documentación

### Documentos existentes (no modificar sin consenso)

| Archivo | Tipo | Propósito |
|---|---|---|
| `00_arquitectura_base_v1.md` | Referencia | Documento técnico completo — fuente de verdad de BD y APIs |
| `01_product.md` | Producto | Verticales, actores, fases, monetización |
| `02_design.md` | Diseño | Paleta, componentes, wireframes, UX patterns |
| `03_tech.md` | Técnico | Stack, configuraciones, seguridad, resiliencia |
| `04_structure.md` | Estructura | Árbol de archivos, convenciones de código |
| `05_context.md` | Steering | Reglas de negocio críticas, decisiones inamovibles |
| `06_memory.md` | Estado vivo | Progreso actual, tareas, bloqueos — **actualizar en cada sesión** |
| `07_skills.md` | Agentes | Patrones de código, checklist por módulo |
| `08_agents.md` | Agentes | Roles de agentes, protocolo de comunicación |
| `09_api_contracts.md` | API | Contratos de todos los endpoints |
| `10_data_dictionary.md` | BD | Todas las tablas, campos, restricciones |
| `11_runbook.md` | Ops | Procedimientos de incidente en producción |
| `12_environment_setup.md` | Dev | Setup del entorno local paso a paso |
| `13_decisions_log.md` | ADR | Registro de decisiones de arquitectura (ADR-001 a ADR-010) |

### Documentos nuevos (creados por este plan)

| Archivo | Tipo | Propósito |
|---|---|---|
| `PLAN_TDD_SDD.md` | **Este archivo** | Guía maestra de specs, tests y steering |
| `specs/` | Directorio | Un archivo `.spec.md` por módulo con contratos detallados |
| `specs/auth.spec.md` | Spec | Casos de prueba y contratos del módulo auth |
| `specs/trips.spec.md` | Spec | Casos de prueba y contratos del módulo trips |
| *(ver sección 3 y 4)* | | |

---

## 2. Steering del proyecto

### Mapa de fases

```
FASE 1 — MVP Taxi México (Sprints 1-7, ~16 semanas)
├── Sprint 1: Fundamentos          [sem 1-2]
├── Sprint 2: Auth + Usuarios      [sem 3-4]
├── Sprint 3: Conductores          [sem 5-6]
├── Sprint 4: Ciclo de Viaje       [sem 7-9]
├── Sprint 5: Pagos + Notif.       [sem 10-11]
├── Sprint 6: Programados + Admin  [sem 12-13]
└── Sprint 7: Mobile MVP           [sem 14-16]

FASE 2 — Estabilización (post-MVP)
├── Historial de rutas
├── Soporte modo oscuro
└── Sistema de rating avanzado

FASE 3 — Inteligencia (con datos reales)
├── Matching por ML
└── Precios dinámicos por demanda real

FASE 4 — Nuevos verticales
├── Delivery
├── Custodia
└── Expansión LATAM
```

### Criterios de MVP completo (Fase 1)

```
✅ Pasajero puede registrarse con OTP
✅ Pasajero puede solicitar y pagar un viaje
✅ Conductor puede registrarse y onboardear documentos
✅ Conductor puede aceptar y ejecutar un viaje
✅ Tracking GPS en tiempo real
✅ Admin puede ver dashboard, aprobar conductores y gestionar errores
✅ App mobile iOS + Android funcional
✅ Cobertura de tests > 75% global, 100% en TripStateMachine y PricingEngine
✅ CI/CD corriendo en GitHub Actions
✅ Deployment en Railway/Render
```

### Decisiones pendientes que bloquean sprints

| Decisión | Bloquea | Urgencia |
|---|---|---|
| Radio inicial de búsqueda de conductores (km) | Sprint 4 — matching | Alta |
| Tiempo máximo de espera sin conductor (seg) | Sprint 4 — SEARCHING timeout | Alta |
| Porcentaje de comisión inicial (%) | Sprint 4 — seeds | Alta |
| Política de cancelación (¿cargo?) | Sprint 4 — lógica de negocio | Alta |
| Proceso de verificación de conductores (¿manual o externo?) | Sprint 3 | Media |
| Nombre de dominio de la API | Sprint 1 — CORS config | Baja |

---

## 3. SDD — Software Design Specs por módulo

### Módulo: `auth`

**Responsabilidad:** OTP por teléfono, JWT access/refresh, registro de sesiones.

**Endpoints:**
```
POST /api/v1/auth/register          → Registro con teléfono
POST /api/v1/auth/verify-phone      → Verificar OTP
POST /api/v1/auth/login             → Login con teléfono + OTP
POST /api/v1/auth/refresh           → Renovar access token
POST /api/v1/auth/logout            → Invalidar refresh token
```

**Flujo principal (registro):**
```
1. Cliente envía teléfono → validar formato E.164
2. Verificar que el teléfono no esté banned
3. Generar OTP de 6 dígitos → TTL 10 min en Redis
4. Enviar OTP por Twilio (o mock en TEST_MODE)
5. Cliente envía OTP → verificar contra Redis
6. Crear user + user_role(passenger) + user_auth en transacción
7. Marcar phone_verified = true
8. Emitir access token (15 min) + refresh token (30 días)
```

**Tablas afectadas:** `users`, `user_roles`, `user_auth`
**Redis keys:** `otp:{phone}` (TTL 10 min), `blacklist:token:{jti}` (refresh invalidado)
**Rate limits:** login: 5 req/15 min, verify-phone: 3 req/10 min

---

### Módulo: `drivers`

**Responsabilidad:** Perfil conductor, onboarding de documentos, disponibilidad.

**Endpoints:**
```
GET    /api/v1/drivers/me                    → Perfil del conductor
PATCH  /api/v1/drivers/me                    → Actualizar perfil
GET    /api/v1/drivers/me/documents          → Lista de documentos requeridos y estado
POST   /api/v1/drivers/me/documents/:reqId   → Subir documento
GET    /api/v1/drivers/me/vehicles           → Vehículos registrados
POST   /api/v1/drivers/me/vehicles           → Registrar vehículo
POST   /api/v1/drivers/me/go-online          → Activar disponibilidad
POST   /api/v1/drivers/me/go-offline         → Desactivar disponibilidad
PATCH  /api/v1/drivers/me/location           → Actualizar posición GPS (cada 3-5 seg)
```

**Flujo de onboarding:**
```
pending → documents_submitted → under_review → approved
```
La aprobación es automática cuando TODOS los documentos requeridos (required=true) están aprobados.

**Tablas afectadas:** `drivers`, `driver_documents`, `document_requirements`, `vehicles`, `audit_logs`
**Redis keys:** `driver:{id}:location` (HSET, TTL 5 min), `driver:{id}:active_trip`

---

### Módulo: `trips` — Estado de máquina (crítico)

**Responsabilidad:** Ciclo de vida completo del viaje.

**Transiciones válidas:**
```
REQUESTED      → SEARCHING           (sistema, al buscar conductor)
SEARCHING      → ACCEPTED            (conductor acepta)
SEARCHING      → CANCELLED_NO_DRIVER (timeout sin conductor)
ACCEPTED       → DRIVER_EN_ROUTE     (conductor confirma salida)
ACCEPTED       → CANCELLED_BY_DRIVER (conductor cancela antes de salir)
DRIVER_EN_ROUTE → DRIVER_ARRIVED    (conductor llega al origen)
DRIVER_ARRIVED → IN_PROGRESS         (pasajero aborda)
DRIVER_ARRIVED → NO_SHOW             (timeout de espera al pasajero)
IN_PROGRESS    → COMPLETED           (llegan al destino)
* → CANCELLED_BY_PASSENGER           (pasajero cancela — según política)
```

**Concurrencia:** Toda transición usa `SELECT FOR UPDATE` para evitar race conditions.

**Endpoints:**
```
POST   /api/v1/trips/estimate         → Cotizar viaje (sin crear)
POST   /api/v1/trips                  → Crear y solicitar viaje
GET    /api/v1/trips/:id              → Detalle del viaje
GET    /api/v1/trips/me/active        → Viaje activo del usuario
POST   /api/v1/trips/:id/accept       → Conductor acepta
POST   /api/v1/trips/:id/start-route  → Conductor inicia trayecto al origen
POST   /api/v1/trips/:id/arrived      → Conductor llegó al origen
POST   /api/v1/trips/:id/start        → Conductor inicia viaje (pasajero a bordo)
POST   /api/v1/trips/:id/complete     → Completar viaje
POST   /api/v1/trips/:id/cancel       → Cancelar viaje
```

**Tablas afectadas:** `trips`, `trip_status_history`, `trip_locations`, `trip_applied_factors`, `payments`

---

### Módulo: `pricing`

**Responsabilidad:** Calcular precio del viaje con factores dinámicos.

**Fórmula:**
```
subtotal = base_fare + (distance_km × cost_per_km) + (duration_min × cost_per_minute)

// Aplicar factores en orden:
subtotal += sum(fixed_amount factors)
subtotal *= (1 + sum(percentage factors))
subtotal *= product(multiplier factors)

fare = MAX(subtotal, min_fare)
total = fare + (fare × tax_rate)   // IVA
```

**Tablas afectadas:** `trip_types`, `pricing_factors`, `pricing_factor_rules`, `commission_rules`
**Redis keys:** `pricing:factors:{region_id}` (cache 5 min)

---

### Módulo: `payments`

**Responsabilidad:** Abstracción sobre Stripe, procesamiento async vía BullMQ.

**Flujo:**
```
1. Viaje pasa a COMPLETED
2. trips.service encola job 'payment.charge' en BullMQ
3. payment.worker ejecuta el cobro vía Stripe
4. Si exitoso → crear registro en payments (completed)
5. Si falla → reintentar con backoff exponencial
6. Después de 3 fallos → registrar en system_error_logs para revisión manual
```

**Tablas afectadas:** `payments`, `passenger_payment_methods`, `system_error_logs`
**Nota crítica:** Si Stripe falla, el viaje YA está COMPLETED — no revertir el estado.

---

### Módulo: `tracking`

**Responsabilidad:** GPS en tiempo real (Redis) y persistencia histórica (TimescaleDB).

**Flujo:**
```
Conductor: PATCH /drivers/me/location cada 3-5 seg
  → Actualizar driver:{id}:location en Redis (inmediato)
  → Encolar punto en buffer local
  → Cada 30 seg: flush batch a trip_locations (TimescaleDB)
  → Emitir evento WS trip:driver_location_updated a pasajero y admin
```

**Tablas afectadas:** `trip_locations` (TimescaleDB)
**Redis keys:** `driver:{id}:location`
**WebSocket events:** `trip:driver_location_updated`

---

## 4. TDD — Test Specs por módulo

### Convención de nomenclatura

```
__tests__/
  {module}.service.test.ts     → Unit tests (mocks de repos y servicios externos)
  {module}.integration.test.ts → Integration tests (BD real con Testcontainers)
```

---

### Test Specs: `auth`

#### Unit tests — `auth.service.test.ts`

```
describe('AuthService')
  describe('register')
    ✓ should create user with passenger role when phone is new
    ✓ should throw PHONE_ALREADY_REGISTERED when phone exists and is active
    ✓ should throw PHONE_BANNED when user is banned
    ✓ should send OTP via Twilio (or mock in TEST_MODE)
    ✓ should store OTP in Redis with 10-min TTL
    ✓ should validate phone format (E.164)

  describe('verifyPhone')
    ✓ should verify OTP and mark phone_verified = true
    ✓ should return access + refresh tokens on success
    ✓ should throw OTP_INVALID when OTP does not match
    ✓ should throw OTP_EXPIRED when OTP TTL has passed
    ✓ should throw too many attempts after 3 wrong OTPs

  describe('login')
    ✓ should send new OTP to registered phone
    ✓ should throw USER_NOT_FOUND when phone not registered
    ✓ should throw USER_SUSPENDED when account is suspended

  describe('refresh')
    ✓ should issue new access token with valid refresh token
    ✓ should rotate refresh token (old token is invalidated)
    ✓ should throw TOKEN_INVALID when refresh token is blacklisted
    ✓ should throw TOKEN_EXPIRED when refresh token is expired

  describe('logout')
    ✓ should add refresh token to blacklist in Redis
```

#### Integration tests — `auth.integration.test.ts`

```
describe('POST /api/v1/auth/register')
  ✓ 201 — creates user and returns tokens (TEST_MODE OTP = 123456)
  ✓ 422 — returns validation error for invalid phone format
  ✓ 409 — returns PHONE_ALREADY_REGISTERED for duplicate phone
  ✓ 429 — returns rate limit error after 5 requests in 15 min

describe('POST /api/v1/auth/verify-phone')
  ✓ 200 — verifies OTP and returns tokens
  ✓ 400 — OTP_INVALID for wrong code
  ✓ 410 — OTP_EXPIRED for expired OTP

describe('POST /api/v1/auth/refresh')
  ✓ 200 — returns new access token
  ✓ 401 — TOKEN_INVALID for blacklisted token
```

---

### Test Specs: `trips` — `TripStateMachine` (cobertura requerida: 100%)

#### Unit tests — `trips.state-machine.test.ts`

```
describe('TripStateMachine')
  describe('valid transitions')
    ✓ REQUESTED → SEARCHING
    ✓ SEARCHING → ACCEPTED (with driver assignment)
    ✓ SEARCHING → CANCELLED_NO_DRIVER (timeout)
    ✓ ACCEPTED → DRIVER_EN_ROUTE
    ✓ ACCEPTED → CANCELLED_BY_DRIVER
    ✓ DRIVER_EN_ROUTE → DRIVER_ARRIVED
    ✓ DRIVER_ARRIVED → IN_PROGRESS
    ✓ DRIVER_ARRIVED → NO_SHOW (timeout)
    ✓ IN_PROGRESS → COMPLETED
    ✓ REQUESTED → CANCELLED_BY_PASSENGER (free cancellation window)
    ✓ ACCEPTED → CANCELLED_BY_PASSENGER (dentro de ventana gratuita)
    ✓ DRIVER_EN_ROUTE → CANCELLED_BY_PASSENGER

  describe('invalid transitions')
    ✓ should throw INVALID_TRANSITION for COMPLETED → any
    ✓ should throw INVALID_TRANSITION for CANCELLED_* → any
    ✓ should throw INVALID_TRANSITION for IN_PROGRESS → SEARCHING

  describe('concurrency protection')
    ✓ should use SELECT FOR UPDATE on every transition
    ✓ should reject second accept when trip is already ACCEPTED

  describe('business rules')
    ✓ should not allow passenger with active trip to create new trip
    ✓ should not allow driver with active trip to accept another
    ✓ should record every transition in trip_status_history
    ✓ should write pricing_snapshot when completing trip
    ✓ should never recalculate pricing_snapshot after completion
```

---

### Test Specs: `pricing` — `PricingEngine` (cobertura requerida: 100%)

#### Unit tests — `pricing-engine.test.ts`

```
describe('PricingEngine')
  describe('base fare calculation')
    ✓ should calculate: base_fare + (km × cost_per_km) + (min × cost_per_minute)
    ✓ should apply min_fare floor (fare never below min_fare)
    ✓ should add IVA 16% on top of fare

  describe('factor application order')
    ✓ should apply fixed_amount factors first
    ✓ should apply percentage factors on updated subtotal
    ✓ should apply multiplier factors last
    ✓ should combine multiple factors of same type correctly

  describe('stackable factors')
    ✓ should apply all stackable factors
    ✓ should apply only highest-priority non-stackable factor when multiple match

  describe('factor rules evaluation')
    ✓ should activate time_range factor when current time matches window
    ✓ should NOT activate time_range factor outside window
    ✓ should activate demand_threshold factor when ratio matches
    ✓ should activate weather_condition factor for matching condition
    ✓ should activate distance_threshold for long trips
    ✓ manual factors should not be evaluated (require admin activation)

  describe('pricing_snapshot')
    ✓ should produce snapshot with all factor codes, values, and impact_amounts
    ✓ snapshot format should include: base, distance_fare, time_fare, factors[], tax, total

  describe('edge cases')
    ✓ should handle zero active factors (no multipliers)
    ✓ should handle very short trips (apply min_fare)
    ✓ should handle very long trips (no cap by default)
    ✓ should return consistent result for same inputs (deterministic)
```

---

### Test Specs: `payments` (cobertura requerida: 95%)

#### Unit tests — `payment.service.test.ts`

```
describe('PaymentService')
  describe('charge')
    ✓ should create Stripe PaymentIntent and confirm charge
    ✓ should create payment record with status = completed on success
    ✓ should create payment record with status = failed on Stripe error
    ✓ should calculate: driver_earnings = amount - tax - platform_fee
    ✓ should NOT revert trip status if Stripe fails

  describe('retry logic')
    ✓ should retry up to 3 times with exponential backoff
    ✓ should escalate to system_error_logs after 3 failed attempts
    ✓ should not process already-completed payment (idempotency)

  describe('refund')
    ✓ should create Stripe refund and update payment status = refunded
    ✓ should throw PAYMENT_NOT_FOUND for invalid payment_id

describe('StripeAdapter')
  ✓ should throw IntegrationError when circuit breaker is open
  ✓ should fallback gracefully on timeout
  ✓ should retry 3 times before opening circuit
```

---

### Test Specs: `drivers`

#### Unit tests — `drivers.service.test.ts`

```
describe('DriversService')
  describe('goOnline')
    ✓ should set online = true and update Redis location
    ✓ should throw DRIVER_NOT_APPROVED when status != approved
    ✓ should throw DOCUMENTS_EXPIRED when any required document is expired

  describe('goOffline')
    ✓ should set online = false and remove from Redis
    ✓ should NOT go offline if driver has active trip (wait for completion)

  describe('updateLocation')
    ✓ should update Redis HSET with lat, lng, heading, speed
    ✓ should set TTL of 5 minutes on location key
    ✓ should NOT update location if driver is offline

  describe('document approval (auto)')
    ✓ should set driver status = approved when all required docs are approved
    ✓ should NOT approve if any required document is pending or rejected
    ✓ should set online = false if driver is suspended during active trip

  describe('document expiry')
    ✓ should allow completing active trip if document expires mid-ride
    ✓ should suspend driver after trip completes if document expired during ride
```

---

### Test Specs: E2E con Playwright (`@smoke`)

```
describe('Happy Path — Passenger books a ride', () => {
  ✓ Passenger registers with phone (OTP = 123456 in TEST_MODE)
  ✓ Passenger adds payment method (Stripe test card 4242...)
  ✓ Passenger requests estimate for a route
  ✓ Passenger creates trip (REQUESTED → SEARCHING)
  ✓ Driver goes online
  ✓ Driver accepts trip (SEARCHING → ACCEPTED)
  ✓ Driver updates location every 3 seconds
  ✓ Passenger sees driver location update in real time
  ✓ Driver arrives (DRIVER_ARRIVED)
  ✓ Trip starts (IN_PROGRESS)
  ✓ Trip completes (COMPLETED)
  ✓ Payment charge is processed
  ✓ Both actors can rate each other
})

describe('Cancellation flows', () => {
  ✓ Passenger cancels before driver assigned
  ✓ Passenger cancels after driver assigned
  ✓ Driver cancels after accepting
  ✓ System cancels trip when no driver found (timeout)
})

describe('Admin panel', () => {
  ✓ Admin logs in
  ✓ Admin sees active trips on dashboard
  ✓ Admin approves driver documents
  ✓ Admin resolves failed payment
})
```

---

## 5. Checklist de Definition of Done

Todo módulo se considera COMPLETO cuando:

```
[ ] routes.ts implementado con validación Zod
[ ] controller.ts sin lógica de negocio
[ ] service.ts con lógica completa e inyección de dependencias
[ ] repository.ts con solo acceso a BD (Knex, sin SQL crudo)
[ ] schema.ts con tipos Zod de request/response
[ ] types.ts con interfaces TypeScript
[ ] __tests__/{module}.service.test.ts pasa al 100%
[ ] __tests__/{module}.integration.test.ts pasa
[ ] Cobertura: 100% para TripStateMachine y PricingEngine, 95% para PaymentService, 75% global
[ ] npm run agent:verify:quick pasa
[ ] memory.md actualizado con el nuevo estado del módulo
[ ] Commit con formato: feat({module}): descripción
[ ] Sin `any` explícito en TypeScript
[ ] Sin secrets hardcoded
[ ] Sin DELETE (solo soft delete con deleted_at)
[ ] Audit log registrado para cambios de entidades de negocio
```

---

## 6. Orden de implementación

### Sprint 1 — Fundamentos (prioridad bloqueante para todo lo demás)

```
1. Inicializar monorepo con Turborepo
   → apps/api, apps/web, apps/mobile, packages/shared-types

2. docker-compose.yml con:
   → postgres:timescale/timescaledb:latest-pg15
   → redis:7-alpine
   → bull-board, prometheus, grafana, jaeger

3. apps/api — estructura base:
   → src/config/database.ts (Knex)
   → src/config/redis.ts (ioredis)
   → src/config/environment.ts (Zod validation de env vars)
   → src/app.ts (Fastify + plugins)
   → src/main.ts

4. Migraciones iniciales (en orden de dependencias):
   → 001_create_region_config
   → 002_create_users
   → 003_create_user_roles
   → 004_create_user_auth
   → 005_create_drivers
   → 006_create_document_requirements
   → 007_create_driver_documents
   → 008_create_vehicles
   → 009_create_trip_types
   → 010_create_pricing_factors
   → 011_create_pricing_factor_rules
   → 012_create_commission_rules
   → 013_create_trips
   → 014_create_trip_status_history
   → 015_create_trip_locations (hypertable TimescaleDB)
   → 016_create_scheduled_trips
   → 017_create_payments
   → 018_create_passenger_payment_methods
   → 019_create_trip_applied_factors
   → 020_create_ratings
   → 021_create_audit_logs
   → 022_create_system_error_logs

5. Seeds:
   → 01_region_config.ts (México)
   → 02_trip_types.ts (Basic, Plus, Premium)
   → 03_pricing_factors.ts (noche, lluvia, hora pico, etc.)
   → 04_admin_user.ts

6. Jest + Supertest + Testcontainers setup
7. Playwright setup
8. GitHub Actions CI (lint + test + type-check)
9. Estructura de errores compartidos (BusinessError, TechnicalError)
10. Middleware base (authenticate, authorize, request-logger)
```

### Sprint 2 — Auth y Usuarios
```
Implementar en orden:
1. auth.repository.ts (CRUD de users, user_roles, user_auth)
2. auth.service.ts (OTP, JWT, refresh)
3. auth.routes.ts
4. __tests__/auth.service.test.ts
5. __tests__/auth.integration.test.ts
6. users.service.ts (GET/PATCH /users/me)
7. users.service.ts → POST /users/me/payment-methods (Stripe SetupIntent)
```

### Sprint 3 — Conductores
```
1. drivers.repository.ts
2. drivers.service.ts (perfil, documentos, disponibilidad)
3. tracking.service.ts → updateLocation (solo Redis por ahora)
4. admin routes → revisión de documentos
5. Tests: drivers.service.test.ts
```

### Sprint 4 — Ciclo de Viaje (el más crítico)
```
1. pricing-engine.ts → pricing-engine.test.ts (100% cobertura)
2. trips.state-machine.ts → trips.state-machine.test.ts (100% cobertura)
3. trips.repository.ts
4. trips.service.ts
5. socket.server.ts + passenger.namespace.ts + driver.namespace.ts
6. trips.integration.test.ts (flujo completo)
```

### Sprint 5 — Pagos y Notificaciones
```
1. stripe.adapter.ts (con circuit breaker)
2. payment.service.ts
3. payment.worker.ts (BullMQ)
4. payment.service.test.ts (95% cobertura)
5. notification.service.ts + fcm.adapter.ts + sms.adapter.ts
6. notification.worker.ts
```

### Sprint 6 — Scheduler y Admin
```
1. scheduler.service.ts (cron + BullMQ)
2. tracking.repository.ts (flush a TimescaleDB)
3. admin.service.ts + dashboard
4. Panel web admin (Next.js)
5. Smoke tests con Playwright
```

### Sprint 7 — Mobile
```
1. App pasajero: HomeScreen → EstimateScreen → ActiveTripScreen
2. App conductor: OnlineScreen → TripRequestModal → ActiveTripScreen
3. location.service.ts (GPS + offline queue con MMKV)
4. socket.service.ts (Socket.io client)
5. FCM push notifications
```

---

## Notas de arquitectura para el agente

Al implementar cualquier módulo, leer antes:

```
1. docs/05_context.md      → Reglas de negocio y restricciones
2. docs/06_memory.md       → Estado actual (¿ya existe algo?)
3. docs/10_data_dictionary.md → Schema exacto de las tablas
4. docs/09_api_contracts.md   → Contratos de la API
5. Este documento          → Spec de tests esperados
```

Al finalizar cada módulo:
```
1. Actualizar docs/06_memory.md con el estado nuevo
2. Agregar nota en ~/.claude/projects/.../memory/conversation_log.md
3. Commit con formato convencional: feat({module}): descripción
```
