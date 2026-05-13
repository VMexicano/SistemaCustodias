# Vertical Spec — Taxi CDMX
> Fork de UBER_BASE Sprint 17 (2026-05-07)
> Este archivo es la referencia de identidad del vertical. Leerlo junto con `context/project-index.md`.

---

## Identidad

| Campo | Valor |
|---|---|
| slug | `taxi` |
| Nombre | Taxi CDMX |
| Mercado | B2C — pasajeros urbanos, Ciudad de México y área metropolitana |
| Modelo de negocio | Comisión por viaje (20% plataforma / 80% conductor) |
| pricingModel | `per_km_min` — tarifa base + costo por km + costo por minuto |
| requiresApproval | `false` — viajes pasan directo a SEARCHING sin aprobación manual |
| B2B | No — solo usuarios individuales, sin cuentas corporativas |
| Base sprint | Sprint 17 completo |

---

## Features activas

```json
{
  "scheduling": true,
  "multiStop": false,
  "cargoDeclaration": false,
  "chainOfCustody": false,
  "temperatureLog": false,
  "b2bAccounts": false,
  "requiresApproval": false,
  "pricingModel": "per_km_min"
}
```

Activar/desactivar sin deploy:
```bash
PATCH /admin/verticals/:id  { "features": { "multiStop": true } }
```

---

## Flujo de viaje (state machine activo)

```
REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
                ↓           ↓↓            ↓↓               ↓↓
            CANCELLED   CANCELLED     CANCELLED         CANCELLED
```

El flujo PENDING_APPROVAL → APPROVED del base está desactivado (`requiresApproval: false`).

---

## Tipos de viaje seeded (del base)

| code | Tarifa base | $/km | $/min | Notas |
|---|---|---|---|---|
| basic | $25 MXN | $8.50 | — | UberX equivalente |
| plus | $35 MXN | $12.00 | — | Vehículo premium |
| premium | $60 MXN | $18.00 | — | Ejecutivo |

Modificar tarifas: `PATCH /admin/config/trip-types/:id` o seed `12_taxi_pricing.ts`.

---

## Diferencias vs UBER_BASE

> Al hacer el fork, este bloque estará vacío. Documentar aquí cada cambio que se haga.

```
# Formato: [Sprint] archivo — descripción del cambio
# Ejemplo:
# [Sprint 18] apps/api/seeds/12_taxi_zones.ts — zonas de cobertura CDMX
# [Sprint 18] apps/api/src/modules/trips/trips.service.ts — validación de zona antes de crear viaje
```

_(vacío — fork limpio de UBER_BASE Sprint 17)_

---

## Reglas de negocio adicionales

> Sobre las reglas R-TRIP-001..R-DATA-002 del base (en `context/project-index.md`).

```
# Agregar aquí las reglas específicas de este vertical a medida que se implementan.
# Ejemplo:
# R-TAXI-001  Radio de búsqueda máximo: 5 km en horas pico, 10 km en horas valle
# R-TAXI-002  Surge pricing activo solo en zonas configuradas como "surge_enabled"
```

_(sin reglas adicionales — fork limpio)_

---

## Roadmap

> El agente implementa sprints en orden. Cada sprint sigue el ciclo SDD → TDD del base.
> Antes de iniciar un sprint, crear el spec en `docs/specs/sprint{N}/`.

### Sprint 18 — Zonas de servicio (geofencing)

**Objetivo:** Restringir viajes a polígonos de cobertura configurables desde backoffice.

**Tareas:**
```
[ ] Migration 039: CREATE TABLE service_zones (id, vertical_id FK, name, polygon JSONB, active)
[ ] Seed 12: zonas CDMX (Centro, Norte, Sur, Oriente, Poniente, NAICM)
[ ] trips.service: validateTripZone() antes de REQUESTED — lanza TRIP_OUTSIDE_ZONE si aplica
[ ] BusinessError: TRIP_OUTSIDE_ZONE
[ ] Admin: ZonasPage en backoffice (mapa Mapbox + polígonos editables)
[ ] GET /admin/zones, POST /admin/zones, PATCH /admin/zones/:id
[ ] Tests: trips.service zone validation (unit) + e2e smoke
```

**Archivos clave a modificar:**
- `apps/api/src/modules/trips/trips.service.ts` — añadir `validateTripZone(origin)` antes de insertar viaje
- `apps/api/migrations/039_service_zones.ts` — nueva tabla
- `apps/web/src/pages/ZonasPage.tsx` — nueva página backoffice

**Extension point:** `service_zones.polygon JSONB` acepta GeoJSON Polygon. Usar `@turf/boolean-point-in-polygon` para validación.

---

### Sprint 19 — Surge pricing dinámico

**Objetivo:** Multiplicador de precio automático por zona + franja horaria de alta demanda.

**Tareas:**
```
[ ] Migration 040: CREATE TABLE surge_events (id, zone_id FK, multiplier DECIMAL, starts_at, ends_at, active)
[ ] PricingEngine: leer surge activo en estimate() — pricingModel per_km_min con surge
[ ] Admin: SurgeControlPage — activar/desactivar surge por zona en tiempo real
[ ] POST /admin/surge, DELETE /admin/surge/:id
[ ] WebSocket: emitir evento surge_changed a pasajeros en zona afectada
[ ] Tests: pricing-engine.test.ts surge cases (100% coverage obligatorio)
```

**Archivos clave:**
- `apps/api/src/modules/pricing/pricing.engine.ts` — añadir rama `surge` en `estimate()`
- ADR nuevo: ADR-048 surge pricing — documentar en `docs/13_decisions_log.md`

**Nota:** `pricing_snapshot` es inmutable (ADR-009). El multiplicador surge se captura en el snapshot al momento del estimate.

---

### Sprint 20 — Perfil enriquecido del conductor

**Objetivo:** Pasajero puede ver foto, calificación, vehículo y viajes completados del conductor asignado.

**Tareas:**
```
[ ] drivers.repository: getPublicProfile(driverId) — datos visibles al pasajero
[ ] GET /drivers/:id/public — sin auth, solo datos públicos
[ ] trips.service: incluir driverProfile en evento trip_accepted (WebSocket)
[ ] Mobile: DriverProfileCard en ActiveTripScreen pasajero
[ ] Tests: drivers.service public profile (unit)
```

---

### Sprint 21 — Sistema de propinas

**Objetivo:** Pasajero puede dar propina al conductor al completar el viaje.

**Tareas:**
```
[ ] Migration 041: CREATE TABLE trip_tips (id, trip_id FK UNIQUE, amount, currency, charged_at, stripe_charge_id)
[ ] PaymentService: chargeTip(tripId, amount) — Stripe PaymentIntent separado
[ ] POST /trips/:id/tip — disponible solo cuando status=COMPLETED, ventana 30 min
[ ] Mobile: TipScreen después de RatingScreen al completar viaje
[ ] Drivers earnings: incluir tips en GET /trips/:id/payment breakdown
[ ] Tests: payment.service tip flow (95% coverage)
```

---

### Sprint 22 — Favoritos y lugares frecuentes

**Objetivo:** Pasajero guarda lugares frecuentes (casa, trabajo, etc.) para solicitar viajes más rápido.

**Tareas:**
```
[ ] Migration 042: CREATE TABLE saved_places (id, passenger_id FK, label, lat, lng, address, icon, created_at)
[ ] GET/POST/DELETE /users/me/places
[ ] Mobile: SavedPlacesScreen + integración en HomeScreen (chips de lugares)
[ ] Tests: saved_places CRUD (integration)
```

---

### Sprint 23 — Métricas del conductor (dashboard)

**Objetivo:** Conductor ve sus métricas: ganancias del día/semana, calificación, viajes completados.

**Tareas:**
```
[ ] GET /drivers/me/stats?period=day|week|month
[ ] trips.repository: driverEarningsSummary(driverId, period)
[ ] Mobile: EarningsScreen con gráfica de barras (Recharts o Victory Native)
[ ] Tests: trips.repository earnings aggregation (unit)
```

---

## Extension points disponibles (del base)

| Extension point | Cómo usar | Caso de uso taxi |
|---|---|---|
| `verticals.features JSONB` | `PATCH /admin/verticals/:id` | Activar multiStop cuando esté listo |
| `trips.metadata JSONB` | Enviar en `POST /trips { metadata: {...} }` | Notas del pasajero, preferencias |
| `pricingModel` en features | Cambiar a `fixed_rate` para rutas aeropuerto | Rutas fijas NAICM |
| `pricing_factors` tabla | Activar factor `peak_hour` en seed | Ya existe, solo activar |
| `configurations` key-value | `PUT /config/entity/vertical/taxi/pricing/airport_zone_rate` | Config sin migración |
| `document_requirements.vertical_id` | Insertar req con `vertical_id = taxi_uuid` | Doc taxi adicional |

---

## Cómo agregar una feature nueva (guía rápida)

```
1. Definir el spec: docs/specs/sprint{N}/01_spec.md
   - Endpoints nuevos con request/response completo
   - Migration si hay tabla nueva
   - Tests requeridos (thresholds del base aplican)

2. Migration (si aplica): apps/api/migrations/{N}_{nombre}.ts
   - Siempre up() + down()
   - Irreversibles: pedir aprobación antes de correr en prod

3. Backend layer: routes → controller → service → repository
   - Archivo por módulo en apps/api/src/modules/{modulo}/
   - Errores de negocio: throw new BusinessError('CODE')
   - SELECT FOR UPDATE en transiciones de estado

4. Tests: apps/api/src/__tests__/{modulo}/{modulo}.service.test.ts
   - TripStateMachine y PricingEngine: 100% obligatorio
   - Módulos nuevos: 75% mínimo global

5. Mobile (si aplica): apps/mobile-v2/src/screens/{Screen}.tsx
   - Feature flag check: const { features } = useVerticalFeatures()

6. Verificar: npm run agent:verify:quick

7. Actualizar context/vertical-spec.md — sección "Diferencias vs UBER_BASE"
   y context/snapshots/{modulo}.snapshot.md
```

---

## Variables de entorno del fork

```bash
# apps/api/.env
VERTICAL_SLUG=taxi

# apps/web/.env
VITE_VERTICAL_SLUG=taxi
```

Para setup completo (Docker, migraciones, seeds): ver `docs/VERTICAL_CLONE_GUIDE.md` Pasos 1–5.
> ⚠️ `docs/12_environment_setup.md` está desactualizada — no usar.
