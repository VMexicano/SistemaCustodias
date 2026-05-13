# UberBase Mobile — v2 (Expo Bare Workflow)

App móvil para pasajeros y conductores. React Native 0.81 · Expo SDK 54 · TypeScript 5.

---

## Prerequisitos

| Herramienta | Versión mínima | Verificar |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| pnpm | 9.x | `pnpm --version` |
| JDK | 17 (Temurin) | `java -version` |
| Android Studio | Flamingo+ | — |
| Android SDK | API 33+ | Android Studio SDK Manager |
| Expo CLI | — | `npx expo --version` |

> **macOS/iOS:** Xcode 15+ requerido. `sudo xcode-select --install`

---

## Setup inicial

### 1. Instalar dependencias (desde la raíz del monorepo)

```bash
pnpm install
```

### 2. Token secreto de Mapbox (solo para builds nativas Android)

`@rnmapbox/maps` descarga el SDK de Android desde el repositorio privado de Mapbox.
Agrega tu **secret token** (prefijo `sk.`) en `~/.gradle/gradle.properties`:

```properties
MAPBOX_SECRET_ACCESS_TOKEN=sk.eyJ1IjoiTU9SUkEiLCJhIjoiY...
```

> El **public token** (`pk.`) ya está en `app.json` → `extra.mapboxPublicToken`.
> El secret token lo encuentras en [account.mapbox.com](https://account.mapbox.com) bajo "Access tokens".

### 3. Verificar que el backend corre

El emulador Android accede al host con `10.0.2.2`. Desde la raíz del monorepo:

```bash
pnpm --filter api dev
```

Confirma en: `http://localhost:3333/health`

---

## Correr la app

### Android (emulador o dispositivo físico)

```bash
# Desde apps/mobile-v2/
cd apps/mobile-v2

# Compilar el APK debug e instalarlo (primera vez o al cambiar código nativo)
pnpm android

# Solo levantar Metro (si el APK ya está instalado)
pnpm start
```

> La primera compilación tarda 5–10 minutos (Gradle descarga dependencias).

**Requisitos del emulador:**
- AVD con API 33+ (Pixel 6 recomendado)
- Habilitado con HAXM o KVM (hardware acceleration)

### iOS (solo macOS)

```bash
cd apps/mobile-v2
pnpm ios
```

> Requiere Xcode + `pod install` ejecutado previamente en `ios/`.

### Expo Dev Client (recomendado para iteración rápida)

```bash
cd apps/mobile-v2
pnpm start          # levanta Metro
# En otra terminal, abrir el emulador/dispositivo con el Dev Build instalado
```

---

## Usuarios de prueba

El backend debe tener los seeds aplicados:

```bash
pnpm --filter api exec tsx seeds/run.ts
```

| Rol | Teléfono | OTP |
|---|---|---|
| Pasajero | `+525500000001` | `123456` |
| Conductor | `+525500000002` | `123456` |

> El bypass de OTP requiere `TEST_OTP_BYPASS=true` y `TEST_OTP_CODE=123456` en `apps/api/.env`.

---

## Tests

### Unit tests (Jest)

```bash
# Desde la raíz
pnpm --filter mobile-v2 test

# Con cobertura (objetivo: ≥75% global — actualmente 93.7%)
pnpm --filter mobile-v2 test:coverage
```

### E2E con Maestro

**Prerequisitos:**
```bash
# Instalar Maestro CLI (una sola vez)
curl -Ls "https://get.maestro.mobile.dev" | bash
```

**Pasos:**
1. Instalar el APK debug en el emulador:
   ```bash
   cd apps/mobile-v2/android
   ./gradlew assembleDebug
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

2. Conectar el emulador al backend local:
   ```bash
   adb reverse tcp:3333 tcp:3333
   ```

3. Correr los flows:
   ```bash
   # Todos los flows
   pnpm --filter mobile-v2 test:e2e

   # Flow individual
   pnpm --filter mobile-v2 test:e2e:auth
   pnpm --filter mobile-v2 test:e2e:passenger
   pnpm --filter mobile-v2 test:e2e:driver
   ```

| Flow | Archivo | Escenarios |
|---|---|---|
| Auth | `e2e/flows/auth.yaml` | OTP incorrecto → error; OTP correcto → Home |
| Pasajero | `e2e/flows/passenger.yaml` | Login → Home → Estimate → ActiveTrip → Cancelar |
| Conductor | `e2e/flows/driver.yaml` | Login → Online → toggle Offline |

---

## Estructura del proyecto

```
apps/mobile-v2/
├── android/                    # Código nativo Android (Bare Workflow)
│   └── app/src/main/java/com/uberbase/
├── ios/                        # Código nativo iOS
├── e2e/flows/                  # Flows Maestro (YAML)
├── src/
│   ├── config/env.ts           # Variables de entorno via expo-constants
│   ├── navigation/             # RootNavigator, PassengerStack, DriverStack
│   ├── screens/
│   │   ├── auth/LoginScreen.tsx
│   │   ├── passenger/          # HomeScreen, EstimateScreen, ActiveTripScreen
│   │   └── driver/             # OnlineScreen, TripRequestModal, ActiveTripScreen
│   ├── services/
│   │   ├── api.client.ts       # Axios + interceptor 401 refresh
│   │   ├── socket.client.ts    # Socket.IO por namespace (passenger/driver)
│   │   ├── location.service.ts # Background GPS con expo-task-manager
│   │   └── notification.service.ts  # expo-notifications
│   └── stores/                 # Zustand (auth, trip, driver)
├── app.json                    # Config Expo (bundle ID, permisos, tokens)
├── eas.json                    # Profiles EAS Build
└── package.json
```

---

## Variables de entorno en app.json

```json
"extra": {
  "mapboxPublicToken": "pk.eyJ...",   // Token público Mapbox (ya incluido)
  "apiUrl":    "http://10.0.2.2:3333", // Android emulador → host
  "socketUrl": "http://10.0.2.2:3333"
}
```

Para apuntar a un entorno diferente (staging, producción), edita `app.json` o usa EAS Build con `env` por profile.

---

## Build para distribución (EAS)

```bash
# Instalar EAS CLI
npm install -g eas-cli
eas login

# Preview — APK para QA interno
eas build --profile preview --platform android --non-interactive

# Producción Android (AAB → Google Play)
eas build --profile production --platform android --non-interactive

# Producción iOS (IPA → TestFlight)
eas build --profile production --platform ios --non-interactive
```

Ver `eas.json` para configuración completa de profiles.

---

## Troubleshooting

| Problema | Solución |
|---|---|
| `MAPBOX_SECRET_ACCESS_TOKEN` no encontrado | Agregar a `~/.gradle/gradle.properties` (ver Setup §2) |
| `Metro bundler` no conecta con el emulador | `adb reverse tcp:8081 tcp:8081` |
| App no conecta con la API | `adb reverse tcp:3333 tcp:3333` |
| `Connection refused 10.0.2.2:3333` | Verificar que `pnpm --filter api dev` está corriendo |
| Build falla por `com.mobilev2` | Directorio nativo correcto: `java/com/uberbase/` — ya corregido |
| `expo-location` permission denied | El emulador debe tener GPS habilitado (Extended Controls → Location) |
| Maestro: `home-map` no visible | El mapa tarda ~2-3s; Maestro hace retry automático |
| Maestro: `estimate-card-0` no visible | `pnpm --filter api exec knex seed:run` para aplicar seeds de trip_types |
