# Sprint 7 — Tasks (TDD)
> Generado: 2026-04-11 · Sprint 7 Mobile MVP

---

## Resumen de tareas

| ID | Título | Tipo | Estado | Agentes | Irreversible |
|---|---|---|---|---|---|
| MOB-001 | Inicializar y configurar app React Native | FEATURE | 🔲 | mobile, devops | ✅ |
| TRACK-001 | Backend: Tracking GPS + device tokens + migration 030 | FEATURE | 🔲 | backend, qa | ✅ |
| E2E-001 | Playwright smoke tests (admin + API auth) | QA_ONLY | 🔲 | qa | — |
| MOB-002 | Pantallas App Pasajero (Home, Estimate, ActiveTrip) | FEATURE | 🔲 | mobile | — |
| MOB-003 | Pantallas App Conductor (Online, TripRequest, ActiveTrip) | FEATURE | 🔲 | mobile | — |
| MOB-004 | GPS Tracking offline-tolerant (LocationService) | FEATURE | 🔲 | mobile | — |
| MOB-005 | Push Notifications FCM (mobile) | FEATURE | 🔲 | mobile | — |

---

## Grafo de dependencias

```
Grupo 1 (sin dependencias — lanzar en paralelo):
  MOB-001 ──────────────────────────────────────────────┐
  TRACK-001 ────────────────────────────────────────────┤
  E2E-001 (independiente, corre en paralelo con todo) ──┘
                                                         │
                                 ┌───────────────────────┘
                                 ↓
Grupo 2 (esperan MOB-001 ∅ TRACK-001):
  MOB-002 ∥ MOB-003 ∥ MOB-004 ∥ MOB-005
  (todos en paralelo — escriben a directorios distintos)
```

---

## Grupos de ejecución paralela

### Grupo 1 — Sin dependencias (lanzar simultáneamente)
**Condición de inicio:** inmediato
- `MOB-001` — mobile + devops
- `TRACK-001` — backend + qa
- `E2E-001` — qa

### Grupo 2 — Esperan Grupo 1 completo
**Condición de inicio:** MOB-001 ✅ Y TRACK-001 ✅
- `MOB-002` — mobile (escribe en `screens/passenger/`)
- `MOB-003` — mobile (escribe en `screens/driver/`)
- `MOB-004` — mobile (escribe en `services/location.service.ts`)
- `MOB-005` — mobile (escribe en `services/notification.service.ts`)

> Regla Sprint 6: MOB-001 CREA todos los archivos compartidos (stores, navigation, api.client, socket.client).
> MOB-002/003/004/005 IMPORTAN esos archivos — no los modifican.

---

## Tareas detalladas

---

### MOB-001 — Inicializar y configurar app React Native

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** mobile, devops
**Depende de:** ninguna · **Irreversible:** sí (scaffolding nativo, package.json)

**Scope incluye:**
- Scaffolding bare RN: `android/`, `ios/` con `react-native init` adaptado a monorepo
- Instalar packages: `react-navigation/native`, `react-navigation/stack`, `react-query`, `zustand`, `react-native-mmkv`, `socket.io-client`, `react-native-maps`, `@react-native-firebase/app`, `@react-native-firebase/messaging`, `react-native-reanimated`, `axios`, `@react-native-community/geolocation`
- Configurar `AndroidManifest.xml`: INTERNET, ACCESS_FINE_LOCATION, FCM
- Configurar `Info.plist`: NSLocationWhenInUseUsageDescription, Firebase
- `build.gradle`: google-services plugin, Maps API key placeholder
- Crear todos los archivos base: `stores/auth.store.ts`, `stores/trip.store.ts`, `stores/driver.store.ts`, `services/api.client.ts`, `services/socket.client.ts`, `navigation/RootNavigator.tsx`
- `LoginScreen.tsx` funcional (auth flow básico)

**Scope excluye:** pantallas de negocio (esas van en MOB-002/003/004/005)

**Checklist técnico:**
- [ ] `dependencies_verified`: todos los packages en `package.json` antes de codificar
- [ ] `schema_verified`: N/A (no accede a BD directamente)
- [ ] `actor_resolution`: JWT.roles = ['passenger' | 'driver'] → RootNavigator elige stack

**Specs TDD — tests a escribir:**

```typescript
// __tests__/stores/auth.store.test.ts
describe('AuthStore', () => {
  test('setTokens almacena access y refresh token')
  test('setUser almacena userId y role')
  test('logout limpia todos los campos')
  test('persiste en MMKV entre reinicios (mock MMKV)')
})

// __tests__/services/api.client.test.ts
describe('API Client interceptors', () => {
  test('agrega Authorization header si hay token en AuthStore')
  test('NO agrega Authorization si no hay token')
  test('interceptor 401: hace refresh y reintenta la request original')
  test('interceptor 401: llama logout si el refresh falla')
})

// __tests__/services/socket.client.test.ts
describe('SocketClient', () => {
  test('getSocket retorna instancia conectada con token en auth')
  test('getSocket reutiliza instancia si ya está conectada')
  test('disconnectSocket desconecta y limpia la referencia')
})
```

**Notas para el agente:**
- Scaffolding en monorepo: usar `react-native init` con `--skip-install` y mover a `apps/mobile/`
- Google Maps API Key: usar placeholder `GOOGLE_MAPS_API_KEY_PLACEHOLDER` (reemplazar antes de prod)
- Firebase: generar `google-services.json` y `GoogleService-Info.plist` de prueba vacíos como placeholders

---

### TRACK-001 — Backend: Tracking GPS + device tokens + migration 030

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** backend, qa
**Depende de:** ninguna · **Irreversible:** sí — Migration 030 (`device_tokens`)

**Scope incluye:**
- Migration 030: tabla `device_tokens` (ver spec/sprint7/design.md)
- `TrackingService.recordLocation(driverId, lat, lng)`: escribe en `trip_locations` si driver tiene viaje activo
- `TrackingService.getTripLocations(tripId, limit=100)`: query TimescaleDB ordenado DESC
- `GET /trips/:id/track` — roles: passenger (propio), driver (propio), admin
- `POST /users/me/device-token` — registra/actualiza FCM token
- Actualizar `drivers.service.ts PATCH /me/location` para llamar a `trackingService.recordLocation()`
- Actualizar `NotificationService.FCMChannel` para leer token desde `device_tokens`
- Actualizar `collectCoverageFrom` en `jest.config.ts` si aplica

**Scope excluye:** historial de recorridos visual, geofencing, WebSocket push de ubicaciones (ya maneja Socket.io)

**Checklist técnico:**
- [ ] `dependencies_verified`: knex, fastify ya instalados; `trip_locations` acepta INSERT vía Knex raw para TimescaleDB
- [ ] `schema_verified`: `trip_locations(trip_id, driver_id, lat, lng, recorded_at)` ✓; `device_tokens` nueva ✓
- [ ] `actor_resolution`: JWT.sub = user_id. Para `GET /trips/:id/track` como driver: lookup `drivers WHERE user_id = sub` → `trips.driver_id = drivers.id`

**Columnas PG especiales (lección Sprint 4):**
```typescript
// INSERT en TimescaleDB hypertable — usar knex.raw para asegurar compatibilidad
await knex.raw(
  `INSERT INTO trip_locations (trip_id, driver_id, lat, lng, recorded_at)
   VALUES (?, ?, ?, ?, NOW())`,
  [tripId, driverId, lat, lng]
);

// Query con limit:
const locations = await knex('trip_locations')
  .where({ trip_id: tripId })
  .orderBy('recorded_at', 'desc')
  .limit(limit)
  .select('lat', 'lng', 'recorded_at');
```

**Specs TDD — tests a escribir:**

```typescript
// __tests__/tracking/tracking.service.test.ts
describe('TrackingService.recordLocation', () => {
  test('inserta en trip_locations si driver tiene viaje activo en Redis')
  test('NO inserta si driver no tiene viaje activo')
  test('actualiza Redis driver:{id}:location con TTL 5 min')
})

describe('TrackingService.getTripLocations', () => {
  test('retorna las últimas 100 ubicaciones ordenadas DESC')
  test('respeta el parámetro limit')
  test('retorna array vacío si no hay ubicaciones')
})

// __tests__/tracking/tracking.integration.test.ts
describe('GET /trips/:id/track (integration)', () => {
  test('200: pasajero puede ver ubicaciones de su propio viaje')
  test('200: conductor puede ver ubicaciones de su propio viaje')
  test('403: pasajero no puede ver viaje de otro usuario')
  test('404: viaje no existe')
  test('200: admin puede ver cualquier viaje')
})

// __tests__/users/device-token.integration.test.ts
describe('POST /users/me/device-token', () => {
  test('200: registra token nuevo para usuario existente')
  test('200: actualiza token existente (upsert por token unique)')
  test('400: falla si token está vacío')
  test('401: falla sin Authorization header')
})

// __tests__/notifications/fcm.channel.test.ts
describe('FCMChannel (updated)', () => {
  test('lee FCM token desde device_tokens para el userId dado')
  test('no envía si no hay token registrado para el usuario')
  test('mock FCM API — no llama servicio real en tests')
})
```

**Notas para el agente:**
- Al modificar `drivers.service.ts`, inyectar `TrackingService` vía DI — no instanciar directamente
- La tabla `trip_locations` ya existe como hypertable — NO crear migración para ella
- Migration 030 SOLO crea `device_tokens` — verificar que no existe antes de createTable
- `PATCH /drivers/me/location` ya tiene rate limit 1000 req/hora (steering/architecture.md) — no modificar el rate limit

---

### E2E-001 — Playwright smoke tests (admin + API auth)

**Tipo:** QA_ONLY · **Sprint:** 7 · **Agentes:** qa
**Depende de:** ninguna · **Irreversible:** no

**Scope incluye:**
- Smoke test admin web (`apps/web/`): login → dashboard → ver stats → ver lista trips → ver lista conductores
- Smoke test API auth: register → verify-phone (mock OTP) → login → obtener access token → refresh
- Smoke test API trip estimate: POST /trips/estimate con payload válido → verificar desglose
- Screenshots en cada paso para debugging

**Scope excluye:** flujo completo de viaje E2E, mobile UI testing, tests de pago Stripe

**Checklist técnico:**
- [ ] Playwright ya configurado desde Sprint 1 (`playwright.config.ts` existe)
- [ ] Admin web corre en `localhost:5173` (Vite dev server)
- [ ] API corre en `localhost:3000`

**Specs TDD — tests a escribir:**

```typescript
// e2e/smoke/admin.spec.ts
test('admin login y dashboard', async ({ page }) => {
  // Navegar a /login
  // Ingresar credenciales del admin seed (04_admin_user)
  // Verificar que el dashboard carga con stats visibles
  // Verificar que la lista de trips es visible (aunque vacía)
  // Verificar que la lista de conductores es visible (aunque vacía)
  // Sin errores 4xx / 5xx en la red
})

// e2e/smoke/auth.spec.ts
test('flujo completo de auth API', async ({ request }) => {
  // POST /auth/register → 201
  // POST /auth/verify-phone (OTP del log/seed) → 200 + tokens
  // GET /users/me con access token → 200
  // POST /auth/refresh → 200 + nuevos tokens
})

// e2e/smoke/estimate.spec.ts
test('trip estimate retorna desglose correcto', async ({ request }) => {
  // Login como pasajero
  // POST /trips/estimate con origin/destination coords en CDMX
  // Verificar: subtotal > 0, tax > 0, total = subtotal + tax
  // Verificar: estimatedDistanceKm > 0
})
```

**Notas para el agente:**
- OTP en entorno dev: leer de logs (LogOTPChannel — Sprint 2 ADR-018). Capturar con `console output` o endpoint de test
- Usar `--passWithNoTests` no aplica aquí — los tests deben existir y pasar
- Capturas de pantalla en `test-results/` automáticas con `screenshot: 'only-on-failure'`

---

### MOB-002 — Pantallas App Pasajero

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** mobile
**Depende de:** MOB-001 ✅, TRACK-001 ✅ · **Irreversible:** no

**Scope incluye:**
- `HomeScreen.tsx`: mapa centrado en ubicación actual, search bar destino, botón "Solicitar viaje"
- `EstimateScreen.tsx`: React Query `useEstimate()` → `POST /trips/estimate`, cards por tipo (basic/plus/premium), botón "Confirmar" → `POST /trips`
- `ActiveTripScreen.tsx` (pasajero): mapa con marker conductor, chip de estado del viaje, cancelar en SEARCHING/ACCEPTED
- `TripStore` consumido para estado en tiempo real
- Suscripción Socket.io `driver:location` → `updateDriverLocation(lat, lng)`
- Suscripción Socket.io `trip:status_changed` → `updateStatus()`

**Scope excluye:** historial, ratings, métodos de pago in-app (ya manejado desde backend Sprint 2)

**Checklist técnico:**
- [ ] `dependencies_verified`: `react-native-maps`, `react-query` instalados en MOB-001 ✓
- [ ] `schema_verified`: `POST /trips/estimate` → `{ originLat, originLng, destinationLat, destinationLng, tripTypeId }` ✓
- [ ] `actor_resolution`: JWT.sub = user_id = passenger_id (directo en trips table) ✓

**Specs TDD — tests a escribir:**

```typescript
// __tests__/screens/passenger/EstimateScreen.test.tsx
describe('EstimateScreen', () => {
  test('muestra cards de tipos de viaje con tarifas estimadas')
  test('llama POST /trips al confirmar el tipo seleccionado')
  test('muestra loading state mientras carga estimate')
  test('muestra error si POST /trips falla')
})

// __tests__/hooks/useEstimate.test.ts
describe('useEstimate', () => {
  test('llama a POST /trips/estimate con coords correctas')
  test('retorna PriceEstimate tipado')
  test('isLoading es true mientras fetch está en curso')
  test('error es propagado si el request falla')
})

// __tests__/stores/trip.store.test.ts
describe('TripStore (pasajero)', () => {
  test('setActiveTrip actualiza el estado')
  test('updateDriverLocation actualiza lat/lng del conductor')
  test('updateStatus actualiza tripStatus')
  test('clearTrip limpia todos los campos')
})
```

**Notas para el agente:**
- `react-native-maps` usa `<MapView provider={PROVIDER_GOOGLE}>` para Mexico
- Para obtener ubicación: usar `@react-native-community/geolocation` instalado en MOB-001
- MOB-002 IMPORTA `stores/trip.store.ts` y `services/socket.client.ts` creados en MOB-001 — NO los modifica
- Socket.io namespace para pasajero: `passenger` (ADR-024)

---

### MOB-003 — Pantallas App Conductor

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** mobile
**Depende de:** MOB-001 ✅, TRACK-001 ✅ · **Irreversible:** no

**Scope incluye:**
- `OnlineScreen.tsx`: mapa con posición propia, switch go-online/go-offline
- `TripRequestScreen.tsx`: modal overlay al recibir `trip:new_request`, countdown 30s, aceptar/rechazar
- `ActiveTripScreen.tsx` (conductor): mapa, botones "Llegué" / "Iniciar viaje" / "Completar" según estado
- `DriverStore` consumido para estado en tiempo real
- Suscripción Socket.io `trip:new_request` → `setPendingRequest()`
- Suscripción Socket.io `trip:status_changed` → `setActiveTrip()`

**Scope excluye:** historial de viajes conductor, pantalla de ganancias, documentos

**Checklist técnico:**
- [ ] `dependencies_verified`: todos instalados en MOB-001 ✓
- [ ] `schema_verified`: `POST /trips/:id/accept`, `PATCH /trips/:id/status` con payload `{ status: 'DRIVER_ARRIVED' }` ✓
- [ ] `actor_resolution`: JWT.sub = user_id → backend hace lookup `drivers WHERE user_id = sub` → drivers.id → trips.driver_id

**Specs TDD — tests a escribir:**

```typescript
// __tests__/screens/driver/TripRequestScreen.test.tsx
describe('TripRequestScreen', () => {
  test('muestra datos del viaje: origen, destino, distancia, tarifa')
  test('countdown empieza en 30 y decrementa')
  test('llama POST /trips/:id/accept al presionar Aceptar')
  test('cierra el modal al presionar Rechazar')
  test('cierra el modal automáticamente al llegar a 0')
})

// __tests__/stores/driver.store.test.ts
describe('DriverStore', () => {
  test('setOnline(true) actualiza estado online')
  test('setPendingRequest almacena la solicitud entrante')
  test('setPendingRequest(null) limpia la solicitud')
  test('setActiveTrip actualiza el viaje activo del conductor')
})

// __tests__/hooks/useDriverStatus.test.ts
describe('useDriverStatus', () => {
  test('llama POST /drivers/me/go-online y actualiza DriverStore')
  test('llama POST /drivers/me/go-offline y actualiza DriverStore')
  test('expone error descriptivo si go-online falla (R-DRV-001)')
})
```

**Notas para el agente:**
- Countdown de 30s: usar `useEffect` con `setInterval` + cleanup en `useEffect` return
- Socket.io namespace para conductor: `driver` (ADR-024)
- MOB-003 IMPORTA `stores/driver.store.ts` y `services/socket.client.ts` creados en MOB-001 — NO los modifica

---

### MOB-004 — GPS Tracking offline-tolerant

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** mobile
**Depende de:** MOB-001 ✅, TRACK-001 ✅ · **Irreversible:** no

**Scope incluye:**
- `LocationService` completo (ver spec/sprint7/design.md)
- Polling cada 5 segundos con `@react-native-community/geolocation`
- Cola MMKV: max 100 puntos, discard oldest si overflow
- Flush automático al reconectar (NetInfo listener)
- Integración con `OnlineScreen`: `start()` al go-online, `stop()` al go-offline

**Scope excluye:** background geolocation en estado killed, geofencing, historial de recorrido visual

**Checklist técnico:**
- [ ] `dependencies_verified`: `@react-native-community/geolocation`, `react-native-mmkv` instalados en MOB-001 ✓; `@react-native-community/netinfo` — verificar si está instalado en MOB-001, si no agregarlo
- [ ] `schema_verified`: `PATCH /drivers/me/location` acepta `{ lat: number, lng: number }` ✓
- [ ] `actor_resolution`: API client usa token del conductor automáticamente vía interceptor ✓

**Specs TDD — tests a escribir:**

```typescript
// __tests__/services/location.service.test.ts
describe('LocationService', () => {
  beforeEach(() => {
    // Mock @react-native-community/geolocation
    // Mock react-native-mmkv
    // Mock apiClient.patch
  })

  test('start() inicia polling cada 5 segundos')
  test('stop() cancela el intervalo')
  test('send() encola el punto en MMKV si hay error de red')
  test('send() hace flush exitoso si hay conectividad')
  test('cola descarta el punto más antiguo si supera 100 elementos')
  test('flush() envía el punto más reciente y limpia la cola al éxito')
  test('flush() mantiene la cola si la request falla')
  test('flush() no hace nada si la cola está vacía')
})
```

**Notas para el agente:**
- Lección Sprint 6: si LocationService usa setInterval internamente, el test debe limpiar con `afterEach(() => service.stop())` para evitar "Jest force exited"
- No usar `jest.useFakeTimers()` para este módulo — interfiere con Promises; usar `jest.runAllTimers()` solo si es explícitamente necesario

---

### MOB-005 — Push Notifications FCM (mobile)

**Tipo:** FEATURE · **Sprint:** 7 · **Agentes:** mobile
**Depende de:** MOB-001 ✅, TRACK-001 ✅ · **Irreversible:** no

**Scope incluye:**
- `NotificationService` (mobile): `registerToken()` → `POST /users/me/device-token` al login
- Handlers tipados para notificaciones:
  - `trip_request`: conductor — mostrar TripRequestScreen con datos del payload
  - `trip_accepted`: pasajero — navegar a ActiveTripScreen
  - `trip_cancelled`: pasajero — navegar a HomeScreen con toast de aviso
  - `trip_reminder`: pasajero — in-app alert con countdown al viaje programado
- Foreground: `messaging().onMessage()` → in-app banner/alert
- Background: `messaging().setBackgroundMessageHandler()` → no-op (OS lo maneja)
- Registro automático al completar login

**Scope excluye:** notificaciones de ganancias, notificaciones de pagos, grupos de notificaciones

**Checklist técnico:**
- [ ] `dependencies_verified`: `@react-native-firebase/app`, `@react-native-firebase/messaging` instalados en MOB-001 ✓
- [ ] `schema_verified`: `POST /users/me/device-token` acepta `{ token: string, platform: 'ios' | 'android' }` ✓ (TRACK-001)
- [ ] `actor_resolution`: API client incluye JWT del usuario logueado automáticamente ✓

**Specs TDD — tests a escribir:**

```typescript
// __tests__/services/notification.service.test.ts
describe('NotificationService', () => {
  beforeEach(() => {
    // Mock @react-native-firebase/messaging
    // Mock apiClient.post
  })

  test('registerToken() llama POST /users/me/device-token con token y platform')
  test('registerToken() no falla si la API retorna error (silently catches)')
  test('handleForegroundMessage() muestra alert para trip_request')
  test('handleForegroundMessage() navega a ActiveTripScreen para trip_accepted')
  test('handleForegroundMessage() navega a HomeScreen para trip_cancelled')
  test('no-op para tipos de notificación desconocidos')
})
```

**Notas para el agente:**
- `messaging().getToken()` retorna Promise — await antes de llamar a `registerToken()`
- Placeholders de Firebase (`google-services.json`, `GoogleService-Info.plist`) deben existir desde MOB-001
- En tests: mockear `@react-native-firebase/messaging` con `jest.mock()` — no llamar al servicio real

---

## Definition of Done — Sprint 7

```
□ MOB-001: android/ + ios/ existen; app compila; AuthStore persiste en MMKV
□ TRACK-001: Migration 030 ejecuta sin errores; GET /trips/:id/track retorna datos;
              POST /users/me/device-token registra token; FCMChannel usa token real
□ E2E-001: playwright test pasa con 0 fallos; capturas en test-results/
□ MOB-002: Pasajero puede solicitar viaje y ver conductor en mapa en tiempo real
□ MOB-003: Conductor puede go-online, aceptar viaje y completarlo paso a paso
□ MOB-004: GPS encola cuando offline y hace flush al reconectar
□ MOB-005: FCM token registrado al login; handler muestra notificación en foreground
□ tsc --noEmit sin errores en apps/mobile/
□ npm run agent:verify:quick pasa (lint + typecheck + tests backend)
□ Snapshot actualizado: context/snapshots/mobile.snapshot.md
□ context/session.md actualizado
□ docs/06_memory.md actualizado con Sprint 7 completo
□ Commit: feat(mobile): Sprint 7 — Mobile MVP
```

---

## Notas por agente

### mobile
- Scaffolding en monorepo: `react-native` CLI puede tener conflictos con workspaces de pnpm. Verificar `metro.config.js` para que resuelva módulos desde `apps/mobile/` correctamente.
- MMKV en test: usar `jest.mock('react-native-mmkv')` — la librería nativa no está disponible en entorno Jest
- Google Maps: usar `PROVIDER_GOOGLE` en `<MapView>` explícitamente para Android y iOS en México
- Para iOS: `pod install` es necesario después de agregar librerías nativas (devops lo maneja en MOB-001)

### devops
- `apps/mobile/android/local.properties` con `sdk.dir` — no commitear con path absoluto; usar variable de entorno
- `google-services.json` y `GoogleService-Info.plist` — no commitear credenciales reales; usar placeholders en el repo
- Variables de entorno mobile: usar `.env` con `react-native-dotenv` o manejo nativo via `BuildConfig` en Android

### backend (TRACK-001)
- Al modificar `drivers.service.ts`: seguir el patrón de inyección de dependencias existente (ver drivers.service.ts como referencia)
- TimescaleDB INSERT: usar `knex.raw()` para garantizar compatibilidad con hypertables
- Agregar `tracking/` al array `collectCoverageFrom` en `jest.config.ts`

### qa
- E2E-001: asegurarse de que `apps/web` (Vite dev server) y `apps/api` están levantados antes de correr Playwright
- OTP en test: el `LogOTPChannel` imprime el OTP en stdout — capturarlo con `execSync` o configurar un endpoint de test `/test/otp/:phone`
- Para TRACK-001: los integration tests necesitan Docker (TimescaleDB) — agregar `--passWithNoTests` en CI si Docker no está disponible, pero los tests DEBEN existir
