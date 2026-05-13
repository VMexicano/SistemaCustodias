# Mobile v2 — Especificaciones funcionales y técnicas

## 1. Actores del sistema

| Actor | Descripción | Flujo principal |
|---|---|---|
| **Pasajero** | Usuario que solicita viajes | Login → Home → Estimate → ActiveTrip |
| **Conductor** | Usuario que acepta viajes | Login → Online → TripRequest → ActiveTrip |
| **Sistema** | Backend API + WebSocket | Orquesta estados, notificaciones, pagos |

---

## 2. Especificaciones funcionales

### 2.1 Autenticación (AUTH)

**F-AUTH-01** — Login por OTP  
El usuario ingresa número de teléfono (formato E.164). La app llama `POST /auth/login`. Si la respuesta es 202, muestra campo OTP.

**F-AUTH-02** — Verificación OTP  
El usuario ingresa 6 dígitos. La app llama `POST /auth/verify`. Si 200, persiste `accessToken` + `refreshToken` + `role` en MMKV. Redirige según rol.

**F-AUTH-03** — Refresh automático  
Si cualquier request recibe 401, el cliente intenta `POST /auth/refresh`. Si falla, limpia sesión y redirige a Login.

**F-AUTH-04** — Logout  
Limpia MMKV, desconecta Socket.IO, cancela background tasks.

**Pantallas:** `LoginScreen`  
**testIDs requeridos:** `login-phone-input`, `login-send-otp-btn`, `login-otp-input`, `login-verify-btn`, `login-error-msg`

---

### 2.2 Flujo pasajero (PASSENGER)

**F-PASS-01** — Mapa home  
HomeScreen muestra mapa Mapbox centrado en ubicación actual. Marcador de posición en tiempo real.

**F-PASS-02** — Selección de destino  
Campo de texto `home-dest-input`. Al confirmar, activa botón `home-request-btn`.

**F-PASS-03** — Solicitar estimación  
`POST /trips/estimate` con origen + destino. Muestra tarjetas por tipo de servicio (EstimateScreen).

**F-PASS-04** — Confirmar viaje  
Selecciona tarjeta → muestra total → `POST /trips`. Navega a ActiveTripScreen.

**F-PASS-05** — Seguimiento en tiempo real  
ActiveTripScreen recibe eventos Socket.IO `trip:driver_location` y actualiza marcador del conductor en mapa.

**F-PASS-06** — Cancelar viaje  
`DELETE /trips/:id`. Regresa a HomeScreen. Solo permitido en estados `pending` / `accepted`.

**Pantallas:** `HomeScreen`, `EstimateScreen`, `ActiveTripScreen` (passenger)  
**testIDs requeridos:** `home-map`, `home-dest-input`, `home-request-btn`, `estimate-card-{n}`, `estimate-total`, `estimate-confirm-btn`, `active-trip-screen`, `active-trip-cancel-btn`

---

### 2.3 Flujo conductor (DRIVER)

**F-DRV-01** — Mapa online  
OnlineScreen muestra mapa con posición actual. Switch `driver-online-switch` para ir online/offline.

**F-DRV-02** — Ir online  
`POST /drivers/me/go-online`. Empieza a escuchar evento Socket.IO `trip:request`. Muestra `driver-status-online`.

**F-DRV-03** — Ir offline  
`POST /drivers/me/go-offline`. Deja de recibir solicitudes. Muestra `driver-status-offline`.

**F-DRV-04** — Recibir solicitud de viaje  
Modal `TripRequestModal` aparece con origen, destino, precio estimado. Botones: Aceptar / Rechazar. Timeout 30 s.

**F-DRV-05** — Aceptar viaje  
`PATCH /trips/:id/accept`. Navega a ActiveTripScreen (driver). Inicia tracking GPS en background.

**F-DRV-06** — GPS background  
Mientras hay viaje activo, la app envía coordenadas vía Socket.IO `driver:location` cada 5 s, incluso con pantalla apagada.

**F-DRV-07** — Completar viaje  
`PATCH /trips/:id/complete`. Regresa a OnlineScreen.

**Pantallas:** `OnlineScreen`, `TripRequestModal`, `ActiveTripScreen` (driver)  
**testIDs requeridos:** `driver-online-screen`, `driver-map`, `driver-online-switch`, `driver-status-online`, `driver-status-offline`

---

### 2.4 Notificaciones push (NOTIFICATIONS)

**F-NOTIF-01** — Token FCM  
Al login, la app registra token `expo-notifications` en `POST /users/me/push-token`.

**F-NOTIF-02** — Notificación de solicitud  
Conductor recibe push cuando hay viaje disponible (aunque app esté en background).

**F-NOTIF-03** — Notificación de aceptación  
Pasajero recibe push cuando conductor acepta el viaje.

---

## 3. Especificaciones técnicas

### 3.1 Compatibilidad de plataformas

| Plataforma | Versión mínima | Build method |
|---|---|---|
| Android | API 26 (Android 8.0) | EAS Build / local Gradle |
| iOS | iOS 16 | EAS Build (cloud, sin Mac) |

### 3.2 Permisos requeridos

| Permiso | Plataforma | Uso |
|---|---|---|
| `ACCESS_FINE_LOCATION` | Android | GPS foreground |
| `ACCESS_BACKGROUND_LOCATION` | Android | GPS background (conductor) |
| `FOREGROUND_SERVICE` | Android | Background task GPS |
| `NSLocationWhenInUseUsageDescription` | iOS | GPS foreground |
| `NSLocationAlwaysUsageDescription` | iOS | GPS background |
| `POST_NOTIFICATIONS` | Android 13+ | Push notifications |

### 3.3 Contratos de API consumidos

Todos los endpoints están documentados en `docs/09_api_contracts.md`. El cliente usa:
- `Authorization: Bearer {accessToken}` en todos los requests autenticados
- Base URL: `process.env.API_URL` (default `http://localhost:3333`)

### 3.4 Eventos WebSocket

| Evento (recibido) | Handler | Pantalla |
|---|---|---|
| `trip:request` | Muestra TripRequestModal | OnlineScreen (driver) |
| `trip:accepted` | Actualiza estado de viaje | ActiveTripScreen (passenger) |
| `trip:driver_location` | Actualiza marcador en mapa | ActiveTripScreen (passenger) |
| `trip:completed` | Navega a Home/Online | ActiveTripScreen (ambos) |
| `trip:cancelled` | Navega a Home/Online | ActiveTripScreen (ambos) |

| Evento (emitido) | Payload | Cuándo |
|---|---|---|
| `driver:location` | `{ tripId, lat, lng, bearing }` | Cada 5 s con viaje activo |

### 3.5 Requisitos de performance

| Métrica | Target |
|---|---|
| Cold start (app launch) | < 3 s en dispositivo físico |
| Time to interactive (HomeScreen) | < 2 s post-login |
| GPS update al servidor | Cada 5 s ± 500 ms |
| Socket reconnect on foreground | < 1 s |

### 3.6 Requisitos de testing

| Nivel | Herramienta | Target |
|---|---|---|
| Unit | Jest + `@testing-library/react-native` | ≥75% global |
| Stores | Jest | 100% (auth, driver, trip) |
| location.service | Jest | 100% |
| E2E | Maestro | 3 flows: auth, passenger, driver |
