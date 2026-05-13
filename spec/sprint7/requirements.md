# Sprint 7 — Requirements
> Generado: 2026-04-11 · Aprobado por: Victor Manuel Mexicano Mondragón

---

## Objetivo del sprint

Implementar el MVP de la aplicación móvil React Native para pasajeros y conductores, incluyendo el módulo de tracking GPS con tolerancia offline, notificaciones push vía FCM, y los smoke tests E2E con Playwright que quedaron pendientes del Sprint 6. Al finalizar este sprint, la plataforma completa el ciclo de vida del viaje de extremo a extremo: desde que el pasajero solicita un viaje en el móvil hasta que el conductor lo completa y el pago se procesa automáticamente.

---

## Scope

| Incluye | Excluye |
|---|---|
| App pasajero: Home, Estimate, ActiveTrip | Historial de viajes en mobile |
| App conductor: Online, TripRequest, ActiveTrip | Ratings en mobile |
| GPS tracking offline-tolerant (cola MMKV) | Background geolocation en estado killed (Fase 2) |
| Push notifications FCM (foreground + background) | Chat conductor-pasajero |
| Backend: módulo tracking + device tokens + migration 030 | Geofencing |
| Playwright smoke tests admin + API auth | E2E de flujo completo de viaje en mobile |
| React Navigation 6, React Query 5, Zustand 4, MMKV 3 | Ganancias / historial conductor in-app |
| Scaffolding nativo (android/ + ios/) | Publicación en App Store / Play Store |
| ADR-031, ADR-032, ADR-033 | Modo multijugador / carpooling |

---

## Actores

| Actor | Interés en el sprint |
|---|---|
| Pasajero | Solicitar viaje, ver estimación de tarifa, seguir al conductor en mapa, cancelar |
| Conductor | Ponerse online, recibir solicitudes de viaje, navegar al pasajero, completar viaje |
| Administrador | No involucrado en este sprint (panel ya completo en Sprint 6) |
| Sistema | Enviar push notifications, almacenar ubicaciones en TimescaleDB, registrar device tokens |

---

## Requerimientos funcionales

### RF-701 — Solicitud de viaje (pasajero)
**Como** pasajero, **quiero** solicitar un viaje desde la app móvil, **para** que un conductor me recoja en mi ubicación actual y me lleve a mi destino.

**Criterios de aceptación:**
- [ ] La HomeScreen muestra un mapa centrado en la ubicación actual del pasajero
- [ ] El pasajero puede seleccionar un destino en el mapa
- [ ] La EstimateScreen muestra el desglose de tarifa (subtotal, IVA, total) por tipo de viaje
- [ ] Al confirmar, se crea el viaje con estado REQUESTED vía `POST /trips`
- [ ] El pasajero es redirigido a ActiveTripScreen automáticamente

### RF-702 — Seguimiento en tiempo real (pasajero)
**Como** pasajero, **quiero** ver la posición del conductor en el mapa en tiempo real, **para** saber cuándo llegará y seguir el progreso del viaje.

**Criterios de aceptación:**
- [ ] El marker del conductor en el mapa se actualiza al recibir evento `driver:location` vía Socket.io
- [ ] El estado del viaje (SEARCHING / ACCEPTED / DRIVER_EN_ROUTE / etc.) se muestra en un chip visible
- [ ] El pasajero puede cancelar el viaje desde ActiveTripScreen mientras está en SEARCHING o ACCEPTED
- [ ] Al completar el viaje, la pantalla muestra el monto cobrado

### RF-703 — Conductor online y disponible
**Como** conductor, **quiero** activar y desactivar mi disponibilidad desde la app, **para** recibir solicitudes de viaje solo cuando estoy listo.

**Criterios de aceptación:**
- [ ] La OnlineScreen muestra el mapa con la posición actual del conductor
- [ ] El toggle go-online llama a `POST /drivers/me/go-online` y cambia el estado visual
- [ ] El toggle go-offline llama a `POST /drivers/me/go-offline` y detiene el envío de ubicación
- [ ] Si el conductor no cumple R-DRV-001 (aprobado + docs vigentes + vehículo activo), el toggle muestra error descriptivo

### RF-704 — Aceptación de solicitudes de viaje (conductor)
**Como** conductor, **quiero** recibir solicitudes de viaje con un countdown de aceptación, **para** decidir si acepto o rechazo el viaje en tiempo limitado.

**Criterios de aceptación:**
- [ ] Al recibir `trip:new_request` vía Socket.io, aparece TripRequestScreen con modal
- [ ] El modal muestra: origen, destino, distancia estimada, tarifa estimada
- [ ] Hay un countdown visible de 30 segundos
- [ ] Al aceptar, se llama `POST /trips/:id/accept`; al rechazar o expirar, el modal se cierra
- [ ] Si la app está en background, llega push notification con los mismos datos

### RF-705 — Ciclo activo del viaje (conductor)
**Como** conductor, **quiero** gestionar el ciclo completo del viaje desde la app, **para** ejecutar cada etapa correctamente.

**Criterios de aceptación:**
- [ ] ActiveTripScreen (conductor) muestra el mapa con ruta hacia el pasajero en DRIVER_EN_ROUTE
- [ ] Botón "Llegué" disponible en DRIVER_EN_ROUTE → transiciona a DRIVER_ARRIVED
- [ ] Botón "Iniciar viaje" disponible en DRIVER_ARRIVED → transiciona a IN_PROGRESS
- [ ] Botón "Completar" disponible en IN_PROGRESS → transiciona a COMPLETED
- [ ] Tras COMPLETED, el BullMQ payment worker procesa el cobro automáticamente (backend ya implementado)

### RF-706 — GPS Tracking offline-tolerant
**Como** sistema, **quiero** registrar la ubicación del conductor durante el viaje con tolerancia a pérdida de red, **para** mantener la trazabilidad del recorrido.

**Criterios de aceptación:**
- [ ] La ubicación del conductor se envía a `PATCH /drivers/me/location` cada 5 segundos durante el viaje
- [ ] Si no hay red, las ubicaciones se almacenan en cola MMKV (máximo 100 puntos)
- [ ] Al recuperar la red, la cola hace flush automático en menos de 2 segundos
- [ ] El backend inserta cada ubicación en `trip_locations` (TimescaleDB) si el conductor tiene viaje activo
- [ ] `GET /trips/:id/track` retorna las últimas 100 ubicaciones del viaje

### RF-707 — Push Notifications
**Como** usuario, **quiero** recibir notificaciones push relevantes aunque la app esté en background, **para** no perder eventos importantes del viaje.

**Criterios de aceptación:**
- [ ] Al hacer login, la app registra el FCM token via `POST /users/me/device-token`
- [ ] El conductor recibe push de `trip_request` cuando llega una solicitud nueva
- [ ] El pasajero recibe push de `trip_accepted` cuando el conductor acepta
- [ ] El pasajero recibe push de `trip_cancelled` si el conductor cancela
- [ ] Los recordatorios de viajes programados llegan al pasajero correctamente

### RF-708 — Smoke tests Playwright (admin + API)
**Como** QA, **quiero** tener smoke tests automatizados para el admin dashboard y el flujo de auth, **para** detectar regresiones en los sprints anteriores.

**Criterios de aceptación:**
- [ ] Test admin: login → dashboard stats visibles → lista de trips → lista de conductores → sin errores 500
- [ ] Test API auth: register → verify-phone → login → refresh → tokens válidos
- [ ] Test API trip estimate: POST /trips/estimate retorna desglose correcto
- [ ] `npx playwright test` pasa con 0 fallos en CI

---

## Requerimientos no funcionales

| RNF | Descripción |
|---|---|
| RNF-701 | Latencia de actualización de mapa ≤ 10 segundos en condiciones normales |
| RNF-702 | La app no debe crashear si Socket.io pierde conexión — reconexión automática |
| RNF-703 | Cola MMKV para ubicaciones: máximo 100 puntos antes de descartar los más antiguos |
| RNF-704 | TypeScript strict en toda la app mobile — `noImplicitAny: true` |
| RNF-705 | `GET /trips/:id/track` debe responder en < 200ms con índice en `trip_id, recorded_at` |

---

## Restricciones técnicas inamovibles

```
✓ React Native bare (no Expo managed) — architecture.md
✓ Google Maps SDK nativo — no wrapper JS (react-native-maps con provider=Google) — architecture.md
✓ FCM para push notifications (iOS: APNs, Android: FCM) — architecture.md
✓ Socket.io 4.x para tiempo real — architecture.md
✓ Zustand + MMKV para state + persistence (sin Redux, sin AsyncStorage) — skill mobile-react-native-offline
✓ React Query 5 para server state — skill mobile-react-native-offline
✓ JWT: access token 15 min, refresh token 30 días — steering/architecture.md
✓ Soft delete siempre (deleted_at) — NUNCA DELETE — business-rules.md
```

---

## Decisiones pendientes (no bloquean este sprint)

| Decisión | Para cuándo |
|---|---|
| ¿Mostrar historial de viajes en mobile? | Sprint 8 (Fase 2) |
| ¿Rating in-app al finalizar el viaje? | Sprint 8 (Fase 2) |
| ¿Background geolocation en estado killed? | Sprint 8 (Fase 2 — requiere react-native-background-geolocation) |
| ¿Google Maps API Key de producción? | Antes de deploy a stores |
| ¿Push notifications de ganancias para conductor? | Fase 2 |
