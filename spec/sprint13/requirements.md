# Requirements — Sprint 13: Backend Vertical Data Models

**Fecha:** 2026-04-27
**Sprint:** 13
**Tipo:** FEATURE + MIGRATION

---

## Objetivo

Construir la capa de datos y servicios backend que permite a los verticales de custodia de valores y cadena de frío operar con sus modelos de negocio propios: registro inmutable de eventos de custodia, monitoreo de temperatura en tiempo real, requisitos de conductor por vertical, y modelos de pricing alternativos — todo sin romper el vertical de taxi existente.

---

## Scope

| Incluye | Excluye |
|---|---|
| Migración 036: tablas temperature_readings + custody_events + columnas nuevas | Pantallas mobile (Sprint 14) |
| Seed 10: requisitos de conductor por vertical + features JSONB actualizados | Backoffice enrichment (Sprint 15) |
| Módulo custody_events: POST/GET /trips/:id/custody | Firma digital criptográfica (Sprint futuro) |
| Módulo temperature_readings: POST/GET /trips/:id/temperature | Alertas en tiempo real vía WebSocket (Sprint futuro) |
| Extensión PricingEngine: fixed_rate + per_weight_km | Modelos de pricing más complejos (por zona, por hora) |
| Tests de cobertura para los 3 módulos nuevos | Tests E2E Playwright (Sprint 15) |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| Conductor (custody) | Poder registrar eventos de custodia en cada punto de la cadena |
| Conductor (cold-chain) | Poder reportar temperatura del compartimento durante el viaje |
| Pasajero / Cliente B2B | Ver el historial de custodia y temperatura de su envío |
| Administrador | Configurar requisitos de conductor por vertical; ver datos en detalle de viaje |
| Arquitecto | Garantizar que los nuevos modelos de pricing no rompen taxi |

---

## Requerimientos funcionales

### RF-1301 — Registro de eventos de custodia

**Como** conductor de custodia de valores,  
**quiero** registrar cada evento de la cadena (recogida, traspaso, entrega) con foto y notas,  
**para** mantener una cadena de custodia auditable e inmutable.

**Criterios de aceptación:**
- [ ] `POST /trips/:id/custody/events` crea un evento con `sequence` auto-incremental por `trip_id`
- [ ] Solo conductores con viaje activo (`ACCEPTED` o `IN_PROGRESS`) pueden crear eventos
- [ ] Los eventos no se pueden modificar ni eliminar vía API
- [ ] `GET /trips/:id/custody` retorna todos los eventos ordenados por `sequence`
- [ ] El conductor, pasajero y admin pueden consultar el historial
- [ ] `event_type` acepta solo: `pick_up | handoff | delivery`

### RF-1302 — Monitoreo de temperatura

**Como** conductor de cadena de frío,  
**quiero** reportar la temperatura del compartimento durante el viaje,  
**para** que el cliente y el admin puedan verificar que la cadena de frío no se rompió.

**Criterios de aceptación:**
- [ ] `POST /trips/:id/temperature` inserta lectura en hypertable TimescaleDB
- [ ] Solo conductores con viaje en estado `IN_PROGRESS` pueden reportar temperatura
- [ ] `GET /trips/:id/temperature` retorna lecturas con `summary: {min, max, avg, out_of_range_count}`
- [ ] El campo `out_of_range_count` cuenta lecturas fuera del rango declarado en `trips.metadata.setpoints` (si existe)
- [ ] Soporta filtros `?from=&to=` por rango de tiempo
- [ ] Conductor, pasajero y admin pueden consultar

### RF-1303 — Requisitos de conductor por vertical

**Como** administrador,  
**quiero** definir requisitos de documentación distintos por vertical,  
**para** que conductores de custodia y cold-chain completen la certificación adecuada.

**Criterios de aceptación:**
- [ ] `document_requirements.vertical_id` nullable; `NULL` = aplica a todos los verticales
- [ ] El seed 10 crea 2 requisitos para `custody` (security_cert, vehicle_armored_cert) y 2 para `cold-chain` (refrigeration_cert, temperature_logger_cert)
- [ ] El query de onboarding filtra `WHERE region_id = ? AND (vertical_id IS NULL OR vertical_id = ?)`
- [ ] Los 5 requisitos existentes de taxi (vertical_id = NULL) siguen funcionando sin cambio de datos

### RF-1304 — Pricing model por vertical

**Como** operador de plataforma,  
**quiero** que custody y cold-chain usen modelos de tarifa distintos a taxi,  
**para** reflejar correctamente el costo del servicio (tarifa fija o por peso × distancia).

**Criterios de aceptación:**
- [ ] `verticals.features.pricingModel` acepta: `'per_km_min' | 'fixed_rate' | 'per_weight_km'`
- [ ] `POST /trips/estimate` acepta campo opcional `weight_kg` en el body
- [ ] Con `pricingModel = 'fixed_rate'`: `fare = trip_type.base_fare` (ignora km/min)
- [ ] Con `pricingModel = 'per_weight_km'`: `fare = weight_kg * base_fare + distance * cost_per_km`
- [ ] Con `pricingModel = 'per_km_min'` (default): comportamiento existente sin cambio
- [ ] Los tests existentes de PricingEngine con 100% cobertura siguen pasando

---

## Requerimientos no funcionales

- `temperature_readings` es hypertable TimescaleDB — mismo patrón que `trip_locations`
- `custody_events` es append-only — el service no expone métodos de update/delete
- Todos los módulos nuevos siguen el patrón `routes → controller → service → repository`
- Cobertura de tests: `custody_events.service` ≥ 90%, `temperature.service` ≥ 90%, extensión PricingEngine 100% en ramas nuevas
- PricingEngine existente: 100% cobertura se debe mantener (sin regresión)

---

## Restricciones técnicas

- No agregar estados nuevos a `TripStateMachine` (conservar 100% coverage sin refactor)
- No fork del PricingEngine — extensión mediante switch en método `estimate()`
- `custody_events` sin soft delete — inmutabilidad por diseño de API (ADR-041)
- TimescaleDB ya activo en Docker — no requiere nuevo servicio

---

## Decisiones pendientes (no bloquean este sprint)

- Firma digital criptográfica en custody_events (Sprint futuro — requiere PKI)
- Alertas en tiempo real de temperatura fuera de rango vía WebSocket (Sprint futuro)
- `company_id` en JWT access token para contexto B2B (Sprint futuro — ADR-038)
- App iOS + firma con Apple certificates (post-MVP)
