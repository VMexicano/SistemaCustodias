# Project Index — UBER_BASE
> Referencia densa para LLMs. Actualizar al final de cada sprint.
> Última actualización: 2026-05-07 — Sprint 17 completo. Flujo de aprobación multi-vertical (ADR-047): PENDING_APPROVAL + APPROVED + actor dispatcher. Migration 038: approved_at/approved_by en trips. Seed 11: requiresApproval=true en custody y cold-chain. Backoffice: AprobacionesPage + usePendingApprovals. Mobile: banners PENDING_APPROVAL/APPROVED en ActiveTripScreen.

---

## Stack (inamovible en MVP)

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Lenguaje | TypeScript strict | 5 |
| API | Fastify | 4 |
| ORM | Knex | 3 |
| BD | PostgreSQL + TimescaleDB | 15 |
| Cache / Queues | Redis + BullMQ | 7 / 5 |
| Real-time | Socket.io | 4 |
| Mobile | React Native (Expo SDK 54) | 0.81.5 |
| Web panel | Next.js | 14 |
| Monorepo | Turborepo + pnpm | 2 / 9 |
| Tests | Jest + Testcontainers + Supertest | 29 / 10 / 7 |
| CI | GitHub Actions | — |

---

## Módulos — estado actual

| Módulo | Estado | Tests | Endpoints |
|---|---|---|---|
| Auth | ✅ Sprint 2 | 65/65 | POST /auth/register, /verify-phone, /login, /refresh |
| Users | ✅ Sprint 2 | 65/65 | GET/PATCH /users/me, POST/GET /users/me/payment-methods |
| Drivers | ✅ Sprint 3 | 114/114 | 11 endpoints + PATCH /admin/documents/:id |
| Trips | ✅ Sprint 17 | 247+ tests + 60 SM | 10 endpoints REST + WebSocket + approval flow (ADR-047) |
| Pricing | ✅ Sprint 4 | 247/247 | POST /trips/estimate |
| Payments | ✅ Sprint 5 | 40 unit tests | GET /trips/:id/payment |
| Tracking | ✅ Sprint 7 | — | GET /trips/:id/track, POST /users/me/device-token |
| Notifications | ✅ Sprint 5 | 40 unit tests | — (BullMQ worker) |
| Scheduler | ✅ Sprint 9 | 26 unit tests | POST/GET/DELETE /trips/schedule (despacho T-30, push T-15) |
| Admin | ✅ Sprint 11 | 26 unit tests | 14 endpoints + AdminLayout + 6 páginas Backoffice v2 |
| Verticals | ✅ Sprint 10 | 5 unit tests | GET /config (público), GET/PATCH /admin/verticals |
| Companies | ✅ Sprint 10 | 7 unit tests | 7 endpoints CRUD /admin/companies + users |
| Configurations | ✅ Sprint 10 | 5 unit tests | GET/PUT/DELETE /config/entity/:type/:id/:ns/:key |
| Mobile v2 | ✅ Sprint 14 | 117 unit tests | CargoDeclaration + TemperatureLog + CustodyEvent + vertical-aware navigation |
| Backoffice web | ✅ Sprint 15 | 4 Playwright E2E | TripsPage tabs Temp+Custodia (Recharts) + VerticalesPage modal editor + Clone Kit |
| Custody | ✅ Sprint 13 | 13 unit tests | POST /trips/:id/custody/events, GET /trips/:id/custody (append-only) |
| Temperature | ✅ Sprint 13 | 11 unit tests | POST /trips/:id/temperature, GET /trips/:id/temperature (hypertable) |

---

## Schema de BD — tablas existentes (29 migraciones)

```
region_config          — id, country_code, currency, timezone, tax_pct
users                  — id, phone, full_name, status, phone_verified, region_id
user_roles             — user_id, role (passenger|driver|admin)
user_auth              — user_id, refresh_token_jti, otp_code, otp_expires_at
drivers                — id, user_id, region_id, license_number, license_expiry,
                         status(pending|documents_submitted|approved|suspended),
                         service_modes TEXT[] DEFAULT '{people}', online, rating_avg
document_requirements  — id, region_id, code, name, required, active
driver_documents       — id, driver_id, requirement_id, file_url,
                         status(pending|approved|rejected), expires_at
vehicles               — id, driver_id, make, model, year, color, license_plate,
                         status(pending|approved|rejected), active
trip_types             — id, region_id, code, name, base_fare, cost_per_km,
                         cost_per_minute, min_fare, service_mode VARCHAR(20)
pricing_factors        — id, region_id, code, name, type(fixed_amount|percentage|multiplier),
                         value, stackable, priority, active
pricing_factor_rules   — id, factor_id, condition_type, condition_value
commission_rules       — id, region_id, platform_fee_pct, active, valid_from, valid_until
verticals              — id, slug, name, description, features JSONB, config JSONB,
                         active, created_at, updated_at  ← Migration 034 (Sprint 10)
companies              — id, vertical_id FK, slug, name, rfc, tax_id, contact_email,
                         contact_phone, address, active, metadata JSONB,
                         created_at, updated_at, deleted_at  ← Migration 035 (Sprint 10)
company_users          — id, company_id FK, user_id FK, role (owner|admin|member),
                         created_at, updated_at  ← Migration 035
configurations         — id, entity_type (company|user|vertical), entity_id, namespace,
                         key, value JSONB, created_at, updated_at  ← Migration 035
trips                  — id, region_id, passenger_id, driver_id, trip_type_id,
                         status VARCHAR(30), origin_*, destination_*,
                         estimated_distance_km, estimated_duration_min, estimated_fare,
                         actual_distance_km, actual_duration_min, final_fare,
                         pricing_snapshot JSONB (inmutable — ADR-009),
                         metadata JSONB DEFAULT '{}' ← Migration 034 (Sprint 10),
                         accepted_at, started_at, completed_at, cancelled_at,
                         approved_at TIMESTAMP nullable, approved_by UUID nullable FK admin_users
                         ← Migration 038 (Sprint 17)
trip_status_history    — id, trip_id, from_status, to_status, changed_by (FK users nullable),
                         actor_type VARCHAR(20), notes
                         NOTA: dispatcher actorId siempre null (FK vs admin_users — ADR-047)
trip_locations         — trip_id, driver_id, lat, lng, recorded_at (hypertable TimescaleDB)
scheduled_trips        — trip_id, scheduled_for, reminder_24h_sent, reminder_1h_sent,
                         dispatch_window_min (DEFAULT 30), search_started_at,
                         passenger_notified_searching_at, pre_assigned_driver_id (FK drivers),
                         pre_assigned_at  ← Migration 033 (Sprint 9)
temperature_readings   — trip_id FK, recorded_at (hypertable partition key), celsius DECIMAL(5,2),
                         sensor_id TEXT, lat, lng  ← Migration 036 (Sprint 13) — NO PK propia
custody_events         — id UUID PK, trip_id FK, event_type CHECK(pick_up|handoff|delivery),
                         actor_id FK users, signature_url, photo_url, declared_value,
                         notes, lat, lng, occurred_at, sequence INTEGER
                         UNIQUE(trip_id, sequence) — append-only  ← Migration 036 (Sprint 13)
document_requirements  — [alterado] + vertical_id UUID nullable FK → verticals  ← Migration 036
trip_types             — [alterado] + weight_capacity_kg DECIMAL(8,2) nullable  ← Migration 036
payments               — id, trip_id, passenger_id, driver_id, amount, tax_amount,
                         platform_fee, driver_earnings, currency, status, stripe_payment_intent_id,
                         stripe_charge_id, failure_reason, retry_count, charged_at
passenger_payment_methods — id, passenger_id, stripe_customer_id (nullable, migración 029),
                         provider_method_id, last4, brand, is_default
trip_applied_factors   — id, trip_id, factor_id, factor_code, factor_value, impact_amount
ratings                — id, trip_id, rater_id, ratee_id, score, comment
audit_logs             — id, entity_type, entity_id, action, actor_type, actor_id, old_value, new_value
system_error_logs      — id, error_code, message, stack, context, resolved_at
```

---

## Seeds existentes

| Archivo | Contenido |
|---|---|
| 01_region_config | region MX: currency MXN, tax_pct 0.16 |
| 02_trip_types | basic(UberX $25+8.5/km), plus($35+12/km), premium($60+18/km) |
| 03_pricing_factors | night(+20%), rain(×1.3), peak_hour(×1.5), high_demand(×2.0) — todos inactive |
| 04_admin_user | usuario admin con rol admin |
| 05_document_requirements | drivers_license, vehicle_registration, vehicle_insurance, driver_photo, vehicle_photo |
| 09_verticals_and_companies | 3 verticals (taxi, custody, cold-chain) + empresa-demo SA + link trip_types→taxi |
| 10_vertical_document_requirements | doc requirements por vertical (custody: 2, cold-chain: 2) + features JSONB merge (pricingModel + cargo/temp/custody flags) |
| 11_enable_approval_verticals | requiresApproval: true en custody y cold-chain via features `||` jsonb operator |

---

## Reglas de negocio críticas (no violar)

```
R-TRIP-001  Un pasajero no puede tener dos viajes activos simultáneos
R-TRIP-002  Un conductor no puede tener dos viajes activos simultáneos
R-TRIP-003  pricing_snapshot es inmutable — solo se escribe al completar, nunca se modifica
R-TRIP-004  Todas las transiciones de estado usan SELECT FOR UPDATE
R-DRV-001   go-online requiere: status=approved + sin docs vencidos + vehículo activo
R-DRV-003   Auto-aprobación de conductor cuando TODOS los docs requeridos están aprobados
R-AUTH-001  OTP expira en 10 minutos
R-AUTH-002  Refresh token rotation — el token usado queda revocado inmediatamente
R-DATA-001  Soft delete siempre (deleted_at) — nunca DELETE
R-DATA-002  Audit log obligatorio en todo cambio de entidad de negocio
```

---

## Trip State Machine

```
Flujo taxi (requiresApproval: false):
  REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
                  ↓           ↓↓            ↓↓               ↓↓
              CANCELLED   CANCELLED     CANCELLED         CANCELLED

Flujo B2B (requiresApproval: true — custody, cold-chain):
  REQUESTED → PENDING_APPROVAL → APPROVED → SEARCHING → ACCEPTED → ...
                    ↓↓               ↓↓
                CANCELLED        CANCELLED
```

Estados válidos: `REQUESTED | PENDING_APPROVAL | APPROVED | SEARCHING | ACCEPTED | DRIVER_EN_ROUTE | DRIVER_ARRIVED | IN_PROGRESS | COMPLETED | CANCELLED`
Actores: `system | driver | passenger | dispatcher`
Nota: dispatcher actorId siempre null en trip_status_history (FK vs admin_users — ADR-047)

---

## Patrones de código obligatorios

```typescript
// Orden de capas: routes → controller → service → repository
// Errores de negocio: throw new BusinessError('CODE')
// Errores técnicos: throw new TechnicalError('CODE', originalError)

// BusinessError — toMatchObject({ code }) en tests (NO toThrow(new BusinessError(msg)))
await expect(fn()).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });

// TEXT[] en Knex — pasar array JS directo (pg driver serializa automáticamente)
service_modes: data.serviceModes   // ✅
service_modes: db.raw("ARRAY[?]::text[]", [...])  // ❌

// JSONB en Knex — pasar objeto JS directo
metadata: data.meta    // ✅
metadata: JSON.stringify(data.meta)  // ❌

// Fastify params — NO usar format:'uuid' sin ajv-formats
documentId: { type: 'string', minLength: 1 }  // ✅ MVP
documentId: { type: 'string', format: 'uuid' } // ❌ requiere ajv-formats

// SELECT FOR UPDATE — obligatorio en transiciones de estado
const trip = await trx('trips').where({ id }).forUpdate().first();

// Efectos secundarios FUERA de transacciones
await trx('audit_logs').insert({...});  // ✅ dentro
await queue.add('job', {...});           // ✅ dentro (se ejecuta fuera)
await externalApi.call();               // ❌ nunca dentro de trx
```

---

## Puertos locales

| Servicio | Puerto | Tipo |
|---|---|---|
| API (Fastify) | 3333 | App nativa |
| Web (Next.js) | 3002 | App nativa |
| Mobile (Metro) | 8081 | App nativa |
| PostgreSQL | 5432 | Docker |
| Redis | 6379 | Docker |
| Grafana | 3000 | Docker |
| Bull Board | 3001 | Docker |
| Prometheus | 9090 | Docker |
| Jaeger | 16686 | Docker |

---

## ADRs clave (ver docs/13_decisions_log.md para detalle)

| ADR | Decisión |
|---|---|
| 001 | Monolito modular (no microservicios en MVP) |
| 008 | SELECT FOR UPDATE en transiciones de estado |
| 009 | pricing_snapshot inmutable en trips |
| 013 | Testcontainers sobre mocks de BD |
| 014 | SDD/TDD en spec/sprintN/ antes de implementar |
| 016 | Refresh token: híbrido PostgreSQL+Redis |
| 018 | OTPChannel abstracto — Firebase gratis, sin Twilio |
| 021 | service_modes TEXT[] multi-vertical (people/cargo/mixed) |
| 022 | Dev: Docker solo infra, apps nativas con pnpm dev |
| 023 | Distancia: Haversine × 1.30 road_factor |
| 024 | WebSocket: Socket.io /passenger + /driver namespaces |
| 025 | TripStateMachine: grafo de estados, lock en service caller |
| 026 | Política de cancelación: cargo fijo $50 MXN ≥120s |
| 027 | Circuit breaker: opossum para Stripe y FCM |
| 028 | INotificationChannel abstracta: Log (dev) + FCM (prod) |
| 029 | Scheduler: node-cron cada minuto en proceso principal (MVP monolito) |
| 030 | Admin panel: Vite 5 + React 19 + TanStack Router/Query + Tailwind (reemplaza Next.js) |
| 031 | Mapbox en mobile-v2 (reemplaza Google Maps — sin costo por tile en dev) |
| 032 | Expo Bare Workflow (reemplaza Managed — requiere build nativo para módulos nativos) |
| 033 | admin_users separado de users (bcrypt, roles=['admin'] en JWT, sin OTP) |
| 034 | @react-native-community/datetimepicker (UX nativa Android/iOS para DateTimePicker) |
| 035 | dispatch_window_min por viaje en scheduled_trips DEFAULT 30 (no hardcodeado en scheduler) |
| 036 | verticals como entidad de primera clase con features JSONB — feature flags sin deploy |
| 037 | trips.metadata JSONB para extensibilidad por vertical sin migraciones adicionales |
| 038 | companies + company_users como capa B2B sobre B2C — usuarios compartidos entre empresas |
| 039 | configurations key-value por entidad (company/user/vertical) con namespace |
| 040 | temperature_readings como hypertable TimescaleDB — mismo patrón que trip_locations |
| 041 | custody_events append-only inmutable — cadena de custodia auditable sin posibilidad de borrar |
| 042 | pricingModel en verticals.features — extensión sin fork de PricingEngine (switch en estimate()) |
| 043 | document_requirements.vertical_id nullable — backward-compatible; NULL = todos los verticales |
| 044 | UX mobile vertical-aware vía feature flags — cargoDeclaration + temperatureLog + chainOfCustody |
| 045 | Clone Kit como documentación estática en docs/VERTICAL_CLONE_GUIDE.md |
| 046 | Extensibilidad vertical: custodyEventTypes + cargoFields + unitTypeDetermination en features JSONB |
| 047 | Flujo aprobación opcional: PENDING_APPROVAL + APPROVED + actor dispatcher, activado por requiresApproval en features |

---

## Variables de entorno (apps/api/.env)

```
NODE_ENV, PORT=3333, DATABASE_URL, REDIS_URL
JWT_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES_IN=15m, JWT_REFRESH_EXPIRES_IN=30d
OTP_PROVIDER=log|firebase, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
STRIPE_SECRET_KEY
CORS_ORIGIN=http://localhost:3002
LOG_LEVEL=info, OTEL_EXPORTER_OTLP_ENDPOINT
VERTICAL_SLUG=taxi   # slug del vertical activo (taxi|custody|cold-chain) — Sprint 10 ADR-036
```

---

## Cobertura de tests requerida

| Módulo | Umbral |
|---|---|
| TripStateMachine | 100% líneas y branches |
| PricingEngine | 100% líneas y branches |
| PaymentService | 95% líneas, 90% branches |
| Global | 75% líneas, 70% branches |

---

## Comandos frecuentes

```bash
pnpm dev                        # Levanta api + web + mobile en paralelo
pnpm test                       # Todos los tests (Testcontainers — requiere Docker)
pnpm run agent:verify:quick     # tsc + tests rápido antes de PR
pnpm knex migrate:latest        # Correr migraciones pendientes
pnpm knex seed:run              # Correr seeds
git add <files> && git commit   # Commit (siempre archivos específicos, no git add .)
```
