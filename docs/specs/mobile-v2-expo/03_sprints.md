# Mobile v2 — Plan de sprints (SDD)

Cada sprint tiene duración de 1 semana. Los sprints son acumulativos: cada uno asume que el anterior está completo y sus tests pasan.

---

## Sprint 1 — Fundación Expo

**Objetivo:** Proyecto Expo Bare inicializado, corriendo en Android e iOS (Dev Build), con login funcional.

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S1-T1 | Inicializar `apps/mobile-v2` con `npx create-expo-app` (Bare TypeScript template) | `npx expo start` corre sin errores |
| S1-T2 | Configurar pnpm workspace: agregar `mobile-v2` a `pnpm-workspace.yaml` | `pnpm install` desde raíz resuelve deps |
| S1-T3 | Instalar deps core: `@react-navigation/native`, `@react-navigation/stack`, `zustand`, `axios`, `socket.io-client`, `react-native-mmkv` | `npx tsc --noEmit` sin errores |
| S1-T4 | Instalar `@rnmapbox/maps` + configurar token en `app.config.ts` via `expo-constants` | Mapa Mapbox renderiza en pantalla |
| S1-T5 | Migrar `src/config/env.ts` con wrapper de `expo-constants` | `ENV.mapboxToken` devuelve token correcto |
| S1-T6 | Migrar `src/services/api.client.ts` + `socket.client.ts` (sin cambios de lógica) | Axios hace request a `http://10.0.2.2:3333` en emulador |
| S1-T7 | Migrar `src/stores/auth.store.ts` (Zustand + MMKV persist) | Login persiste tras restart |
| S1-T8 | Migrar `LoginScreen.tsx` con todos los `testID` requeridos | Screen renderiza, OTP flow funciona contra backend local |
| S1-T9 | EAS Build profile `development` configurado | `eas build --profile development --platform android` produce APK |
| S1-T10 | EAS Dev Build instalado en iPhone del equipo | App abre en iOS físico |

**Entregable:** Login funcional en Android (emulador) + iOS (físico). CI no requerido aún.

---

## Sprint 2 — Flujo pasajero completo

**Objetivo:** Pasajero puede solicitar, ver y cancelar un viaje de extremo a extremo.

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S2-T1 | Migrar `HomeScreen.tsx` con mapa Mapbox + `home-dest-input` + `home-request-btn` | Mapa muestra posición actual (foreground GPS) |
| S2-T2 | Instalar `expo-location`, solicitar permisos foreground en HomeScreen | `expo-location.getCurrentPositionAsync()` devuelve coords |
| S2-T3 | Migrar `EstimateScreen.tsx` con tarjetas `estimate-card-{n}` + `estimate-confirm-btn` | `POST /trips/estimate` → tarjetas visibles |
| S2-T4 | Migrar `ActiveTripScreen.tsx` (passenger) con mapa + tracking conductor | Screen visible con `active-trip-screen` testID |
| S2-T5 | Migrar `trip.store.ts` con estados del viaje | Store actualiza al recibir eventos Socket.IO |
| S2-T6 | Socket.IO: handler `trip:driver_location` → actualiza marcador en mapa | Marcador conductor se mueve en tiempo real |
| S2-T7 | Socket.IO: handler `trip:accepted` / `trip:cancelled` / `trip:completed` | Navegación correcta en cada evento |
| S2-T8 | `active-trip-cancel-btn` funcional: `DELETE /trips/:id` → regresa a Home | Cancelación regresa a HomeScreen |
| S2-T9 | Migrar `RootNavigator.tsx` + `PassengerStack` | Navegación Login → Home → Estimate → ActiveTrip |
| S2-T10 | Tests Jest para `trip.store.ts` | Cobertura 100% del store |

**Entregable:** Pasajero puede completar flujo completo. Driver stub no necesario (puede usar Postman para simular aceptación).

---

## Sprint 3 — Flujo conductor completo

**Objetivo:** Conductor puede ir online, recibir solicitudes y completar viajes.

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S3-T1 | Migrar `OnlineScreen.tsx` con mapa + `driver-online-switch` + status labels | Switch visible, `POST /drivers/me/go-online` funciona |
| S3-T2 | Migrar `driver.store.ts` con estado online/offline | Store persiste estado entre reinicios |
| S3-T3 | Migrar `TripRequestModal.tsx` con timeout de 30 s | Modal aparece al recibir `trip:request` vía Socket.IO |
| S3-T4 | Aceptar viaje: `PATCH /trips/:id/accept` → navega a ActiveTripScreen (driver) | Transición de estado correcta |
| S3-T5 | Migrar `ActiveTripScreen.tsx` (driver) con botón completar | `PATCH /trips/:id/complete` funciona |
| S3-T6 | Migrar `DriverStack` en `RootNavigator.tsx` | Ruta: Online → ActiveTrip |
| S3-T7 | Tests Jest para `driver.store.ts` | Cobertura 100% |
| S3-T8 | EAS Dev Build actualizado para iOS con permisos de location | App solicita permiso de ubicación en iPhone |

**Entregable:** Ambos roles funcionales. Se puede hacer un viaje completo end-to-end manualmente.

---

## Sprint 4 — Background GPS (conductor)

**Objetivo:** El conductor envía su posición en background correctamente (sin el bug actual de watchPosition).

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S4-T1 | Instalar `expo-task-manager` | Package disponible en proyecto |
| S4-T2 | Implementar `TaskManager.defineTask(LOCATION_TASK)` en `location.service.ts` | Task definida en root del módulo (fuera de cualquier clase) |
| S4-T3 | `LocationService.startTracking(tripId)`: solicita permiso background + inicia tarea | `Location.startLocationUpdatesAsync` retorna sin error |
| S4-T4 | ForegroundService Android: `notificationTitle` + `notificationBody` configurados en `app.json` | Notificación persistente aparece en status bar Android al iniciar tracking |
| S4-T5 | Integrar `locationQueue` (MMKV): si Socket desconectado, encola coords y replay al reconectar | Coords no se pierden con 5 s de desconexión simulada |
| S4-T6 | `LocationService.stopTracking()`: se llama al completar/cancelar viaje | `Location.stopLocationUpdatesAsync` sin error |
| S4-T7 | Tests Jest para `location.service.ts` (mockeando expo-location) | Cobertura 100% del service |
| S4-T8 | Validación manual: pantalla apagada 2 min → coords siguen llegando al backend | adb logcat muestra updates cada ~5 s |
| S4-T9 | Permisos iOS: `NSLocationAlwaysUsageDescription` en `app.json` | iOS solicita permiso "always" al conductor al aceptar primer viaje |

**Entregable:** Background GPS funcional en Android y iOS. Sin pérdida de coords en background.

---

## Sprint 5 — Notificaciones push

**Objetivo:** FCM/APNs integrado vía `expo-notifications`. Pasajero y conductor reciben push en background.

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S5-T1 | Instalar `expo-notifications` + configurar en `app.json` | Package resuelto sin errores |
| S5-T2 | `notification.service.ts`: obtener token Expo Push + enviarlo a `POST /users/me/push-token` | Token guardado en backend post-login |
| S5-T3 | Handler foreground: mostrar alerta cuando app está en primer plano | Notificación visible en pantalla |
| S5-T4 | Handler background: navegar a pantalla correcta al tocar notificación | Deep link funciona desde push |
| S5-T5 | Configurar credenciales FCM en EAS (`eas credentials`) | Build de producción incluye `google-services.json` |
| S5-T6 | Configurar APNs en EAS (certificado iOS) | Build iOS incluye entitlements de push |
| S5-T7 | Test manual: backend envía push → pasajero y conductor reciben en iPhone + emulador | Notificación visible con texto correcto |

**Entregable:** Push notifications funcionales en ambas plataformas.

---

## Sprint 6 — E2E con Maestro + CI

**Objetivo:** Suite E2E completa en Maestro corriendo en CI (GitHub Actions).

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S6-T1 | Instalar Maestro CLI (`curl -Ls "https://get.maestro.mobile.dev" \| bash`) en CI y local | `maestro --version` imprime versión |
| S6-T2 | Escribir `e2e/flows/auth.yaml`: login OK, OTP incorrecto muestra error | `maestro test e2e/flows/auth.yaml` PASS |
| S6-T3 | Escribir `e2e/flows/passenger.yaml`: login → home → estimate → activeTrip → cancelar | `maestro test e2e/flows/passenger.yaml` PASS |
| S6-T4 | Escribir `e2e/flows/driver.yaml`: login → online → offline | `maestro test e2e/flows/driver.yaml` PASS |
| S6-T5 | GitHub Actions: job `e2e-android` con emulador API 33 + Maestro | Job verde en main |
| S6-T6 | Script npm: `"test:e2e": "maestro test e2e/flows/"` | `pnpm test:e2e` corre todos los flows |
| S6-T7 | Documentar en `docs/12_environment_setup.md` cómo correr E2E localmente | Setup reproducible en máquina nueva |

**Entregable:** E2E verde en CI. Sin workarounds de Espresso, sin warmup cycles.

---

## Sprint 7 — Polish y production build

**Objetivo:** App lista para distribución interna (TestFlight + Firebase App Distribution).

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S7-T1 | Pantalla de splash + ícono de app en `app.json` | Splash visible en cold start |
| S7-T2 | Manejo de errores de red en todas las screens: retry button, mensaje amigable | Sin crashes en modo offline |
| S7-T3 | `eas build --profile preview --platform all` exitoso | APK + IPA generados en EAS dashboard |
| S7-T4 | Distribución iOS vía TestFlight: link compartible al equipo | iPhone del equipo instala desde TestFlight |
| S7-T5 | Distribución Android vía Firebase App Distribution o EAS | APK instalable sin adb |
| S7-T6 | Cobertura Jest final: `pnpm test --coverage` ≥ 75% global | Report muestra ≥75% |
| S7-T7 | Eliminar `apps/mobile/` del monorepo | Solo existe `apps/mobile-v2/` |
| S7-T8 | Actualizar `pnpm-workspace.yaml` y `turbo.json` si aplica | `pnpm build` desde raíz incluye mobile-v2 |

**Entregable:** App distribuida en TestFlight + App Distribution. `apps/mobile/` eliminado.

---

## Sprint 16 — Offline Tile Management

**Objetivo:** Conductor puede completar viajes sin pantalla de mapa en blanco, incluso en zonas con señal débil o nula.

Spec completo: [`05_offline_tile_management.md`](./05_offline_tile_management.md)

### Dependencias previas
- Self-hosted tile server operativo (`tileserver-gl` + MBTiles CDMX)
- Sprint de custodia completado (flujo conductor estable)

### Tasks

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| S16-T1 | Levantar `tileserver-gl` en infra + descargar MBTiles CDMX desde Geofabrik | `GET https://tiles.ridebase.app/14/3456/7890.pbf` devuelve tile válido |
| S16-T2 | Configurar Nginx como reverse proxy + cache de tiles (TTL 30 días) | Segunda petición del mismo tile no llega al tileserver |
| S16-T3 | Apuntar `@rnmapbox/maps` al tile server propio vía `MapboxGL.setCustomStyleURL` | Mapa renderiza desde servidor propio, no Mapbox CDN |
| S16-T4 | Implementar `TilePackManager.ensureBasePack()` — Capa 1 | Pack base CDMX zoom 10-14 descargado en WiFi al primer login de conductor |
| S16-T5 | Implementar `TilePackManager.refreshDynamicPack()` — Capa 2 | Al ponerse online, pack zoom 15-17 radio 25 km descargado en background |
| S16-T6 | Implementar `tilesForRoute()` — cálculo de tiles XYZ desde polilínea con buffer adaptativo | Unit test: ruta CDMX centro → aeropuerto produce lista de tiles esperada |
| S16-T7 | Implementar `TilePackManager.preloadRoute()` — Capa 3 | Al aceptar viaje, tiles del corredor de ruta + alternativas descargados antes de llegar al origen |
| S16-T8 | Llamar `preloadRoute()` en `TripRequestModal.handleAccept()` con rutas del store | Reactotron muestra `tilePreload:start` y `tilePreload:complete` |
| S16-T9 | Implementar `TileDeviationDetector` — Capa 4 | Desvío >400 m durante >20 s dispara mini-fetch + re-route |
| S16-T10 | Implementar `TilePackManager.cleanup()` — política de limpieza | Tiles de rutas >24 h y packs >50 km se eliminan al completar viaje |
| S16-T11 | Integrar Redis metadata: `tile_pack:{driver_id}` con estado y timestamp | Backend sabe qué zona tiene cacheada cada conductor |
| S16-T12 | Tests Jest para `TilePackManager` y `tilesForRoute` | Cobertura ≥ 90% |
| S16-T13 | Validación manual: modo avión durante viaje activo → mapa sigue funcionando | Ruta visible en modo avión si pack fue descargado |

**Entregable:** Conductor completa viaje en CDMX con mapa funcional en modo avión (tiles pre-cargados). Requests a tileserver = 0 durante viaje activo.

---

## Resumen de sprints

| Sprint | Semana | Foco | Entregable |
|---|---|---|---|
| 1 | 1 | Fundación + Login | Login en Android e iOS |
| 2 | 2 | Flujo pasajero | Pasajero puede solicitar y cancelar viajes |
| 3 | 3 | Flujo conductor | Viaje completo end-to-end |
| 4 | 4 | Background GPS | Tracking real en background |
| 5 | 5 | Push notifications | FCM + APNs funcionales |
| 6 | 6 | E2E + CI | Maestro verde en GitHub Actions |
| 7 | 7 | Polish + Production | TestFlight + App Distribution |
| 16 | Post-custodia | Offline Tile Management | Mapa funcional sin señal |

**Duración total estimada (sprints originales):** 7 semanas

---

## Dependencias entre sprints

```
S1 (fundación)
 └── S2 (pasajero) ──────────┐
      └── S3 (conductor)      │
           └── S4 (GPS)       │
                └── S5 (push) │
                     └── S6 (E2E) ← requiere S2, S3, S4
                          └── S7 (polish)
```

S5 (push) puede iniciarse en paralelo con S4 si hay dos personas disponibles.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| EAS Build lento en plan gratuito (cola) | Media | Usar builds locales Android para dev; EAS solo para iOS y release |
| `@rnmapbox/maps` incompatible con Expo SDK 52 | Baja | Verificar versión compatible antes de S1-T4 |
| Permisos background iOS rechazados por App Store | Media | Usar solo para conductores; justificación clara en descripción del permiso |
| Maestro no soporta un testID específico | Baja | Maestro soporta `id`, `text`, `accessibilityLabel` — usar el que aplique |
