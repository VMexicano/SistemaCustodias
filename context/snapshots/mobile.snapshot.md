# Snapshot — Mobile App (apps/mobile-v2)
> Estado: ✅ Completo · Sprint 17 · Última actualización: 2026-05-07

## Stack mobile

```
Expo SDK 54 · React Native 0.81.5 · TypeScript 5 strict
@rnmapbox/maps ^10.3.0         — mapas (reemplazó Google Maps en Sprint 8, ADR-031)
zustand ^5.0.3                 — estado global
react-native-mmkv ^3.2.0       — storage persistente
@tanstack/react-query ^5.56.0  — fetching / caché
socket.io-client ^4.8.1        — real-time
expo-location ~19.0.8          — GPS
expo-notifications ~0.32.17    — push
expo-image-picker ~17.0.11     — fotos en eventos de custodia
```

## Estructura de archivos (apps/mobile-v2/src/)

```
stores/
├── auth.store.ts        — accessToken, refreshToken, userId, role (Zustand + MMKV persist)
├── trip.store.ts        — activeTrip, driverLat/Lng, tripStatus, queuedTrip (stacking)
├── driver.store.ts      — isOnline, pendingRequest, activeTrip
└── vertical.store.ts    — features JSONB del vertical activo (fetch desde GET /config)

services/
├── api.client.ts        — Axios + interceptor Bearer + retry 401 con refresh
├── socket.client.ts     — Socket.io singleton por namespace (passenger/driver)
├── location.service.ts  — watchPosition 5s, cola MMKV max 100 pts, flush al reconectar
└── notification.service.ts — registerToken → POST /users/me/device-token

navigation/
└── RootNavigator.tsx    — PassengerStack | DriverStack según role; fetchConfig en bootstrap

screens/auth/
└── LoginScreen.tsx      — flujo OTP 2 pasos (phone → verify); roles del API response (sin JWT decode — Hermes no tiene atob)

screens/passenger/
├── HomeScreen.tsx            — Mapbox followUserLocation + solicitar viaje + "Mis programados" condicional
├── EstimateScreen.tsx        — React Query useEstimate + cards inline + "Programar para después" condicional
├── CargoDeclarationScreen.tsx — campos dinámicos desde features.cargoFields (ADR-046); si cargoDeclaration=false no se muestra
├── ScheduleConfirmScreen.tsx  — DateTimePicker nativo Android + validación ≥30 min + POST /trips/schedule
├── ScheduledTripsScreen.tsx   — lista programados + cancelar (useQuery + RefreshControl)
└── ActiveTripScreen.tsx      — mapa Mapbox con marker conductor + Socket.io + cancelar
                                + banner naranja PENDING_APPROVAL (Sprint 17)
                                + banner azul APPROVED (Sprint 17)

screens/driver/
├── OnlineScreen.tsx          — Mapbox + Switch go-online/go-offline + Socket.io
├── TripRequestModal.tsx      — modal overlay countdown 30s + aceptar/rechazar
├── ActiveTripScreen.tsx      — botones por estado + botones condicionales custody/temperatura
├── CustodyEventScreen.tsx    — event types dinámicos desde features.custodyEventTypes (ADR-046)
│                               badge ✍️ si requiresSignature=true (UI de firma pendiente — Sprint 18)
└── TemperatureLogScreen.tsx  — lectura manual + auto POST 5min + indicador rango setpoints
```

## Cobertura de tests (unit — 129 total)

```
auth.store              4 tests ✅
trip.store              4 tests ✅
driver.store            4 tests ✅
vertical.store         12 tests ✅  (fetchConfig éxito + error + estado inicial)
api.client              4 tests ✅
socket.client           3 tests ✅
location.service        8 tests ✅
notification.service    6 tests ✅
CargoDeclarationScreen  5 tests ✅  (campos dinámicos desde features.cargoFields)
TemperatureLogScreen    6 tests ✅
CustodyEventScreen      7 tests ✅  (event types dinámicos)
VerticalNavigation      4 tests ✅  (integración Sprint 14)
ScheduleConfirmScreen  14 tests ✅
ScheduledTripsScreen   10 tests ✅ (incluido en 14 arriba — ver nota)
─────────────────────────────────
Total: 129 tests · TypeScript 0 errores
```

## E2E Maestro

**Config:** Android Emulator `Medium_Phone_API_36.0`, APK con bundle Hermes embebido

```bash
# Correr todos los flows
pnpm --filter mobile-v2 test:e2e

# Flow individual
pnpm --filter mobile-v2 test:e2e:auth
pnpm --filter mobile-v2 test:e2e:passenger
pnpm --filter mobile-v2 test:e2e:driver
```

| Flow | Archivo | Tests |
|---|---|---|
| Auth | `e2e/flows/auth.yaml` | login OTP correcto + incorrecto |
| Pasajero | `e2e/flows/passenger.yaml` | login → Home → Estimate → ActiveTrip → Cancelar |
| Conductor | `e2e/flows/driver.yaml` | login → Online → Offline |
| Aprobación B2B | `e2e/flows/approval-flow.yaml` | PENDING_APPROVAL banner → APPROVED banner (requiere admin externo) |

**Usuarios de prueba (seed 07):**

| Rol | Teléfono | OTP |
|---|---|---|
| Pasajero | `+525500000001` | aparece en logs de la API |
| Conductor (approved) | `+525500000002` | aparece en logs de la API |

**Decisiones técnicas E2E:**
- `debuggableVariants = []` en `android/app/build.gradle` → bundle JS embebido en debug APK (sin Metro)
- `launchApp({ newInstance: true, delete: true })` en todos los beforeEach → limpia MMKV entre tests

## Build Android

```bash
# Dev — desde apps/mobile-v2/android/
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# Instalar en emulador
adb install android/app/build/outputs/apk/debug/app-debug.apk

# ADB tunnels (emulador)
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3333 tcp:3333
adb reverse tcp:9091 tcp:9091   # Reactotron (opcional)
```

**Prerequisitos build:** Ninja 1.12.1 · Android Studio SDK API 36 · node-linker=hoisted en `.npmrc`

## Vertical-aware UX (ADR-044, ADR-046)

El mobile lee features del vertical en bootstrap via `GET /config` y activa/desactiva:

| Feature flag | Pantalla activada |
|---|---|
| `cargoDeclaration: true` | CargoDeclarationScreen (pasajero antes de solicitar) |
| `chainOfCustody: true` | CustodyEventScreen (conductor en viaje activo) |
| `temperatureLog: true` | TemperatureLogScreen (conductor en viaje activo) |
| `scheduling: true` | "Programar para después" en EstimateScreen + "Mis programados" en HomeScreen |

`features.cargoFields` y `features.custodyEventTypes` configuran los campos/tipos dinámicamente.

## Pendientes

- Pantalla de firma digital para `requiresSignature: true` en custody events (Sprint 18 del fork custody)
- Remover `console.log` de depuración en `EstimateScreen.tsx` y `LoginScreen.tsx`
- Reemplazar `google-services.json` y `GoogleService-Info.plist` con credenciales reales de Firebase en producción
