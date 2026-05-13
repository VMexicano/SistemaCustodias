# Mobile v2 — Diseño de arquitectura

## 1. Diagrama de capas

```
┌─────────────────────────────────────────────────────┐
│                   Presentación                       │
│  screens/  ←→  navigation/  ←→  components/         │
└──────────────────────┬──────────────────────────────┘
                       │ hooks / selectors
┌──────────────────────▼──────────────────────────────┐
│                   Estado global                      │
│  stores/ (Zustand)                                   │
│  auth.store · driver.store · trip.store              │
└──────────────────────┬──────────────────────────────┘
                       │ llamadas directas
┌──────────────────────▼──────────────────────────────┐
│                   Servicios                          │
│  api.client · socket.client                          │
│  location.service · notification.service             │
└──────────────────────┬──────────────────────────────┘
                       │ plataforma
┌──────────────────────▼──────────────────────────────┐
│              Expo / Módulos nativos                  │
│  expo-location · expo-notifications                  │
│  expo-task-manager · expo-constants                  │
│  @rnmapbox/maps · react-native-mmkv                  │
└─────────────────────────────────────────────────────┘
```

---

## 2. Decisiones de diseño (ADRs)

### ADR-M-01 — Expo Bare Workflow (no Managed)
**Decisión:** Bare Workflow en lugar de Managed.  
**Razón:** Necesitamos `@rnmapbox/maps` que requiere código nativo no soportado en Managed. Bare da control total sobre `android/` e `ios/` igual que CLI, pero con todas las herramientas Expo disponibles.  
**Consecuencia:** EAS Build sigue siendo necesario para iOS.

### ADR-M-02 — Maestro en lugar de Detox
**Decisión:** E2E con Maestro 1.x.  
**Razón:** Detox usa Espresso que en Android API 35+ tiene bug de `has-window-focus=false`. Requirió workaround de 3 install cycles. Maestro usa UIAutomator 2 que no tiene este problema. Además, la sintaxis YAML es más mantenible.  
**Consecuencia:** Los archivos `.e2e.ts` actuales se reescriben como `.yaml`. El runner no es Jest sino `maestro test`.

### ADR-M-03 — expo-location con background task
**Decisión:** Reemplazar `@react-native-community/geolocation` por `expo-location` + `expo-task-manager`.  
**Razón:** La implementación actual con `watchPosition` no funciona en background en Android 8+. `expo-task-manager.defineTask` + `expo-location.startLocationUpdatesAsync` implementa correctamente un `ForegroundService` Android.  
**Consecuencia:** Requiere el permiso `ACCESS_BACKGROUND_LOCATION` (Android) y `NSLocationAlwaysUsageDescription` (iOS). El usuario verá el dialog de "siempre" en iOS.

### ADR-M-04 — expo-constants en lugar de react-native-config
**Decisión:** `expo-constants` + `.env` procesado por `babel-plugin-inline-dotenv` o `expo-env`.  
**Razón:** `react-native-config` no autolinks en pnpm/Windows por seguimiento de symlinks en Gradle. `expo-constants` es first-party y funciona sin configuración manual.  
**Consecuencia:** Variables de entorno disponibles en JS via `Constants.expoConfig.extra`. Requiere definirlas en `app.config.ts` bajo `extra:`.

### ADR-M-05 — EAS Build para iOS
**Decisión:** Builds iOS solo via EAS (cloud), nunca local.  
**Razón:** El equipo no tiene Mac. EAS Build provee Mac runners en la nube. El plan gratuito incluye 15 builds/mes.  
**Consecuencia:** Cada build iOS toma ~10-15 min en EAS. Para desarrollo day-to-day, usar Expo Go o EAS Dev Build instalado en iPhone.

### ADR-M-06 — Directorio `apps/mobile-v2` (paralelo al actual)
**Decisión:** Crear `apps/mobile-v2/` nuevo en lugar de reescribir `apps/mobile/`.  
**Razón:** Permite tener referencia del código original durante migración. Una vez que mobile-v2 alcanza paridad de features, se elimina mobile/.  
**Consecuencia:** Monorepo temporalmente tiene dos apps móviles. El pnpm workspace lo soporta.

---

## 3. Diseño de location.service (refactored)

### Problema actual
```typescript
// location.service.ts (v1) — NO funciona en background
Geolocation.watchPosition(
  (pos) => socketClient.emit('driver:location', pos),
  (err) => console.error(err),
  { distanceFilter: 10, interval: 5000 }
);
```

### Diseño v2
```typescript
// location.service.ts (v2)
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK = 'background-location-task';

// Define task OUTSIDE of any component/service (file root level)
TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const [loc] = locations;
  // Emit via socket or enqueue in MMKV if socket disconnected
  locationQueue.enqueue({ lat: loc.coords.latitude, lng: loc.coords.longitude });
});

export class LocationService {
  async startTracking(tripId: string) {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Background location denied');

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,          // metros
      timeInterval: 5000,            // ms
      foregroundService: {           // Android: muestra notificación persistente
        notificationTitle: 'UberBase',
        notificationBody: 'Compartiendo ubicación',
      },
    });
  }

  async stopTracking() {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
```

---

## 4. Diseño de navegación

```
RootNavigator
├── [sin token]   → AuthStack
│   └── LoginScreen
├── [role=passenger] → PassengerStack
│   ├── HomeScreen
│   ├── EstimateScreen
│   └── ActiveTripScreen
└── [role=driver] → DriverStack
    ├── OnlineScreen
    │   └── TripRequestModal (overlay)
    └── ActiveTripScreen
```

En v2 se agrega `DriverStack` explícito con `ActiveTripScreen` propio para conductores, en lugar de usar `OnlineScreen` como root.

---

## 5. Diseño de variables de entorno

**`app.config.ts`** (Expo config dinámica):
```typescript
export default {
  expo: {
    name: 'UberBase',
    slug: 'uberbase',
    extra: {
      mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN,
      apiUrl: process.env.API_URL ?? 'http://localhost:3333',
      socketUrl: process.env.SOCKET_URL ?? 'http://localhost:3333',
    },
  },
};
```

**`src/config/env.ts`**:
```typescript
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const ENV = {
  mapboxToken: extra.mapboxPublicToken as string,
  apiUrl: extra.apiUrl as string,
  socketUrl: extra.socketUrl as string,
};
```

---

## 6. Diseño de E2E con Maestro

Estructura de tests:
```yaml
# e2e/flows/auth.yaml
appId: com.uberbase
---
- launchApp
- assertVisible:
    id: "login-phone-input"
- tapOn:
    id: "login-phone-input"
- inputText: "+525500000001"
- tapOn:
    id: "login-send-otp-btn"
- assertVisible:
    id: "login-otp-input"
    timeout: 8000
```

Ventajas sobre Detox:
- Sin `beforeAll` warmup cycles
- Sin `adb reverse` manual (Maestro lo gestiona)
- Tests corren en iOS y Android con el mismo YAML
- CI en GitHub Actions con `maestro cloud` o runner local

---

## 7. Estructura de EAS

**`eas.json`**:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```
