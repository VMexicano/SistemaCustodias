# Sprint 4 — Ciclo de Viaje: Requirements

> **Fecha:** 2026-04-06
> **Estado:** Aprobado
> **Módulos:** Trips · Pricing Engine

---

## Objetivo del sprint

Implementar el ciclo de vida completo de un viaje: desde la solicitud del pasajero hasta la finalización con precio calculado. Incluye el motor de precios con factores configurables, la máquina de estados con todas las transiciones válidas, los endpoints REST del ciclo de vida, recálculo de ruta en progreso, y la capa WebSocket que notifica a pasajero y conductor en tiempo real.

---

## Scope

| Incluye | Excluye |
|---|---|
| PricingEngine con factores `fixed_amount → percentage → multiplier` | Surge pricing dinámico (Sprint 5) |
| `POST /trips/estimate` (sin crear viaje) | Matching geográfico avanzado (nearest driver — Sprint 5) |
| `PATCH /trips/:id/destination` (recálculo mid-trip) | Pagos automáticos al completar (Sprint 5) |
| TripStateMachine completa (7 estados, 11 transiciones) | Notificaciones push (Sprint 5) |
| Todos los endpoints REST del ciclo de vida | Tracking GPS en TimescaleDB de alta frecuencia (Sprint 5) |
| BullMQ job: timeout SEARCHING → CANCELLED (300s) | ETA en tiempo real (Sprint 5) |
| WebSocket `/passenger` y `/driver` con auth JWT | Dashboard admin (Sprint 6) |
| Seed `commission_rules` (20% MX) | Viajes programados (Sprint 6) |
| Tests: PricingEngine 100% · StateMachine 100% · integración E2E | — |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| **Pasajero** | Solicitar viaje, ver estimado de precio, seguir al conductor en tiempo real, cambiar destino |
| **Conductor** | Recibir solicitudes, aceptar/rechazar, navegar, completar viaje |
| **Sistema** | Hacer transitar estados, detectar timeouts, calcular precio final |
| **Admin** | Configurar factores de precio y comisiones (ya implementado en schema) |

---

## Requerimientos funcionales

### RF-401 — Estimación de precio antes de solicitar

**Como** pasajero, **quiero** ver el precio estimado con desglose antes de confirmar el viaje, **para** decidir si lo tomo.

Criterios de aceptación:
- [ ] Dado origen y destino, el sistema calcula distancia con haversine (±2% tolerancia vs Google Maps < 50km)
- [ ] Se muestran todos los factores activos aplicados con su impacto en MXN
- [ ] El precio respeta `min_fare` del trip_type
- [ ] Los factores se aplican en orden: `fixed_amount → percentage → multiplier`
- [ ] La respuesta incluye `pricing_snapshot` serializable (para guardar en el viaje)
- [ ] No se crea ningún viaje al llamar este endpoint

### RF-402 — Solicitar viaje

**Como** pasajero, **quiero** solicitar un viaje confirmando origen y destino, **para** que el sistema encuentre un conductor disponible.

Criterios de aceptación:
- [ ] El viaje se crea en estado `REQUESTED` y pasa automáticamente a `SEARCHING`
- [ ] Si el pasajero ya tiene un viaje activo, la solicitud es rechazada (R-TRIP-001)
- [ ] El sistema emite evento WebSocket `trip:requested` a conductores disponibles en radio de 5km
- [ ] Si no hay conductor en 300 segundos, el viaje pasa a `CANCELLED` automáticamente

### RF-403 — Aceptar viaje (conductor)

**Como** conductor, **quiero** aceptar una solicitud de viaje, **para** comenzar a navegar hacia el pasajero.

Criterios de aceptación:
- [ ] Solo conductores `approved` y `online` pueden aceptar
- [ ] Si el conductor ya tiene un viaje activo, la aceptación es rechazada (R-TRIP-002)
- [ ] El viaje pasa a `ACCEPTED` con `accepted_at` registrado
- [ ] El pasajero recibe `trip:status_changed` con datos del conductor vía WebSocket

### RF-404 — Ciclo de vida completo del viaje

**Como** conductor, **quiero** avanzar por los estados del viaje, **para** completarlo y que el pasajero sea cobrado correctamente.

Criterios de aceptación:
- [ ] Las transiciones válidas son: `ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`
- [ ] Cada transición registra timestamp y actor en `trip_status_history`
- [ ] Al completar, se calcula `final_fare` con `actual_distance_km` y `actual_duration_min`
- [ ] `pricing_snapshot` no se modifica después de creado (R-TRIP-003)
- [ ] Cada transición usa `SELECT FOR UPDATE` (R-TRIP-004)

### RF-405 — Cancelación con política de cargo

**Como** pasajero o conductor, **quiero** poder cancelar el viaje bajo ciertas condiciones, **para** que la política sea clara y justa.

Criterios de aceptación:
- [ ] Pasajero cancela en `ACCEPTED` o `DRIVER_EN_ROUTE` con < 120s desde aceptación → sin cargo
- [ ] Pasajero cancela con ≥ 120s desde aceptación → cargo de $50 MXN
- [ ] Conductor cancela en `ACCEPTED` o `DRIVER_EN_ROUTE` → sin cargo al pasajero
- [ ] Conductor cancela en `DRIVER_ARRIVED` (no_show > 5min) → sin cargo al pasajero
- [ ] Todas las cancelaciones registran razón en `trip_status_history`

### RF-406 — Cambio de destino en progreso

**Como** pasajero, **quiero** poder cambiar el destino durante el viaje, **para** ajustar la ruta por cualquier motivo.

Criterios de aceptación:
- [ ] Solo posible en estado `IN_PROGRESS`
- [ ] El sistema recalcula `estimated_fare` con el nuevo destino usando `pricing_snapshot` existente
- [ ] El conductor recibe `trip:destination_changed` con nuevo destino y estimado actualizado vía WebSocket
- [ ] `pricing_snapshot` permanece inmutable (R-TRIP-003)
- [ ] `final_fare` al completar usa `actual_distance_km` real (no el estimado recalculado)

### RF-407 — Notificaciones en tiempo real

**Como** pasajero o conductor, **quiero** recibir actualizaciones del estado del viaje en tiempo real, **para** no tener que hacer polling.

Criterios de aceptación:
- [ ] Pasajero recibe `trip:status_changed` en cada transición de estado
- [ ] Pasajero recibe `driver:location` cuando el conductor actualiza su posición
- [ ] Conductor recibe `trip:requested` cuando hay solicitudes en su radio
- [ ] Conductor recibe `trip:cancelled` si el pasajero cancela
- [ ] La conexión WebSocket requiere JWT válido en el handshake

---

## Requerimientos no funcionales

| Requerimiento | Valor |
|---|---|
| Latencia `POST /trips/estimate` | < 100ms (sin I/O externo) |
| Latencia transición de estado | < 200ms (incluye SELECT FOR UPDATE) |
| Timeout SEARCHING | 300 segundos |
| Radio de búsqueda inicial | 5 km (configurable por región) |
| Cobertura PricingEngine | 100% lines + branches |
| Cobertura TripStateMachine | 100% lines + branches |
| Cobertura global del módulo | ≥ 75% |

---

## Restricciones técnicas inamovibles

```
✓ SELECT FOR UPDATE en cada transición de estado (R-TRIP-004)
✓ pricing_snapshot es JSONB inmutable — solo se escribe al crear el viaje, nunca se modifica (R-TRIP-003, ADR-009)
✓ Efectos secundarios (BullMQ jobs, WebSocket emits) fuera de transacciones
✓ Soft delete (deleted_at) — nunca DELETE
✓ Audit log en trip_status_history para cada transición
✓ Haversine inline — sin librerías externas de geodesia
✓ Socket.io auth obligatorio: JWT en handshake
```

---

## Decisiones pendientes que NO bloquean este sprint

| Decisión | Sprint que la necesita |
|---|---|
| Algoritmo de matching avanzado (nearest driver con PostGIS) | Sprint 5 |
| Cargo por cancelación configurable por región (hoy: hardcoded $50 MXN) | Sprint 6 |
| Política de penalización a conductores con muchas cancelaciones | Sprint 6 |
| ETA dinámica en tiempo real | Sprint 5 |
