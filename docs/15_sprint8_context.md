# Contexto Sprint 8 — Mobile UX Completa

> Documento de briefing para el agente `planner` y `architect` al ejecutar `/team` para Sprint 8.
> Leer este archivo antes de descomponer tareas.
> **Creado:** 2026-04-21

---

## Estado de partida

Sprint 7 entregó la app mobile funcional con E2E 10/10 pasando. Sin embargo, el flujo visible al usuario tiene varios placeholders que impiden lanzar a producción:

| Pantalla | Estado real |
|---|---|
| HomeScreen | Mapa sin API key (se ve gris) · Destino hardcodeado (`lat + 0.02`) |
| EstimateScreen | Funciona pero sin imagen/icono de tipo de servicio |
| ActiveTripScreen | Marker del conductor no se actualiza en tiempo real via Socket |
| Historial | No existe pantalla |
| Perfil de usuario | No existe pantalla |
| Métodos de pago | No existe pantalla |
| Viajes programados | Backend ✅ — Mobile ❌ |
| Calificaciones | Backend: tabla existe — Endpoints: no — Mobile: no |

---

## Decisiones de arquitectura fijas para Sprint 8

### Maps: Mapbox (no Google Maps)

**Razón:** Google Maps cuesta ~14× más a escala. Ver `docs/14_service_costs.md`.

- SDK: `@rnmapbox/maps`
- Geocoding/Places: Mapbox Geocoding API (incluido en el mismo SDK/token)
- Directions: Mapbox Navigation SDK o Directions API
- Token: variable de entorno `MAPBOX_ACCESS_TOKEN` en `.env` del mobile
- Afecta: `HomeScreen`, `EstimateScreen`, `ActiveTripScreen`, `OnlineScreen` (driver)

### Geocoding de direcciones

Para buscar "¿A dónde vas?", usar `@mapbox/search-js-react` o llamadas directas a la API de Mapbox Geocoding. No usar Google Places API.

El campo de búsqueda de destino en `HomeScreen` debe integrarse con Mapbox Geocoding para devolver `lat/lng` reales. El origen se obtiene del GPS del dispositivo.

### Viajes programados — ya existe en backend

`POST /trips/schedule` ya existe (Sprint 6). El body es:
```json
{
  "origin": { "lat": 0, "lng": 0, "address": "string" },
  "destination": { "lat": 0, "lng": 0, "address": "string" },
  "trip_type_id": "uuid",
  "scheduled_for": "2026-05-01T10:00:00Z"
}
```
Solo se necesita UI mobile: DateTimePicker + llamada al endpoint.

### Tipos de tarifa — ya son configurables desde admin

Los nombres "Basic/Plus/Premium" son configurables desde el panel admin. La `EstimateScreen` ya los carga dinámicamente desde `GET /trip-types`. Lo que falta:
- Mostrar icono/imagen representativa de cada tipo (campo `icon_url` o similar — puede requerir migración)
- Mostrar capacidad de pasajeros
- Mostrar tiempo estimado de llegada (requiere Mapbox Directions o estimación simple)

### Tracking en tiempo real del conductor

`ActiveTripScreen` (pasajero) recibe eventos Socket.io `trip:driver_location` pero actualmente no actualiza el marker en el mapa. Necesita conectar el store al marker de Mapbox.

---

## Scope del Sprint 8 — propuesta inicial

### Grupo A — Crítico para lanzamiento (sin esto no se puede salir a producción)

| ID | Feature | Backend | Mobile |
|---|---|---|---|
| MOB-006 | Migrar de Google Maps a Mapbox en todas las pantallas | Sin cambios | `@rnmapbox/maps` reemplaza `react-native-maps` |
| MOB-007 | Búsqueda de destino con geocoding real (Mapbox) | Sin cambios | Autocomplete en `HomeScreen` |
| MOB-008 | Selección de origen: GPS + ajuste manual con pin | Sin cambios | Pin draggable en mapa |
| MOB-009 | Tracking live del conductor en `ActiveTripScreen` | Sin cambios | Conectar Socket event al marker |

### Grupo B — Funcionalidades MVP planificadas en producto

| ID | Feature | Backend | Mobile |
|---|---|---|---|
| MOB-010 | Pantalla de viajes programados (agendar + listar + cancelar) | ✅ ya existe | Nueva pantalla + DateTimePicker |
| MOB-011 | Historial de viajes (pasajero) | `GET /trips?status=completed` existe | Nueva pantalla |
| MOB-012 | Perfil de usuario (`GET/PATCH /users/me`) | ✅ ya existe | Nueva pantalla |
| MOB-013 | Métodos de pago (`GET /users/me/payment-methods`) | ✅ ya existe | Nueva pantalla (solo lectura en MVP) |

### Grupo C — Deseable pero descope-able

| ID | Feature | Backend | Mobile |
|---|---|---|---|
| MOB-014 | Calificación post-viaje (conductor y pasajero) | Schema existe, endpoints NO | Nueva pantalla + nuevos endpoints |
| MOB-015 | Historial de ganancias del conductor | Query custom | Nueva pantalla |
| MOB-016 | Iconos/imágenes en tipos de tarifa | Migración `icon_url` en trip_types | Actualizar EstimateScreen |

---

## Constraints técnicos que el arquitecto debe considerar

### pnpm + React Native
- Deps nativas SIEMPRE como deps directas en `apps/mobile/package.json` — no asumir hoisting
- Tras agregar `@rnmapbox/maps`: verificar que `react-native-maps` puede coexistir o debe removerse
- Rebuild APK obligatorio tras cualquier cambio en deps nativas

### Detox E2E
- Cualquier pantalla nueva debe tener `testID` en sus elementos clave
- `testID` NUNCA en MapView/MapboxGL.MapView — siempre en el container React View padre
- El APK de los tests E2E debe reconstruirse si cambian pantallas

### Variables de entorno mobile
- El token de Mapbox va en `apps/mobile/.env` como `MAPBOX_ACCESS_TOKEN`
- En Android se inyecta via `android/app/build.gradle` (similar a como se hace con google-services)
- Documentar en `docs/12_environment_setup.md`

### Hermes JS engine
- No usar `atob`, `Buffer`, ni ningún decode de JWT en mobile
- Para cualquier dato del usuario necesario en mobile: asegurarse de que el endpoint lo devuelve en el body

### Costos
- Ver `docs/14_service_costs.md` antes de elegir cualquier servicio externo
- Priorizar proveedores con free tier generoso y precio por uso (no suscripciones fijas)
- Mapbox ya está decidido — no reconsiderar Google Maps

---

## Archivos clave a leer antes de planear Sprint 8

```
context/snapshots/mobile.snapshot.md   — estado actual de cada pantalla y decisiones E2E
docs/14_service_costs.md               — costos de servicios (Mapbox, Firebase, Stripe, infra)
docs/09_api_contracts.md               — contratos de los endpoints que mobile va a consumir
apps/mobile/src/screens/passenger/     — código actual de las 3 pantallas pasajero
apps/mobile/src/navigation/RootNavigator.tsx — estructura de navegación actual
agents/planner.md → "Reglas aprendidas [Sprint 7]" — lecciones de Detox/Hermes/pnpm
```

---

## Decisiones de scope — resueltas (2026-04-21)

1. **E2E solo Android** — desarrollo desde Windows; iOS queda fuera del scope hasta cambio de plataforma de desarrollo.
2. **Tipos de tarifa sin iconos** — mostrar nombre y descripción como texto; sin imágenes ni campo `icon_url` en Sprint 8.
3. **Calificaciones (MOB-014) → Sprint 9** — descoped de Sprint 8.
4. **Historial de ganancias del conductor (MOB-015) → Sprint 9** — descoped de Sprint 8.
5. **Viajes programados usa DateTimePicker nativo** — usar `@react-native-community/datetimepicker` (ya soportado en Android 36 API).

## Scope final Sprint 8

### Grupo A — Crítico (bloquea lanzamiento)
- MOB-006: Migrar Google Maps → Mapbox (`@rnmapbox/maps`) en HomeScreen, EstimateScreen, ActiveTripScreen (pasajero), OnlineScreen (conductor)
- MOB-007: Búsqueda de destino con Mapbox Geocoding Autocomplete en HomeScreen
- MOB-008: Origen por GPS con opción de mover pin en mapa
- MOB-009: Tracking live del conductor (conectar evento Socket `trip:driver_location` al marker en ActiveTripScreen)

### Grupo B — MVP planificado en producto
- MOB-010: Pantalla viajes programados — DateTimePicker nativo + `POST /trips/schedule` + listado + cancelar
- MOB-011: Historial de viajes del pasajero — `GET /trips?status=completed`
- MOB-012: Pantalla perfil usuario — `GET/PATCH /users/me`
- MOB-013: Métodos de pago — `GET /users/me/payment-methods` (solo lectura en Sprint 8)

### Descoped a Sprint 9
- MOB-014: Calificaciones (pasajero y conductor)
- MOB-015: Historial de ganancias del conductor
- MOB-016: Iconos en tipos de tarifa
