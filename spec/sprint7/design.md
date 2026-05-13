# Sprint 7 — Design (SDD)
> Generado: 2026-04-11 · Sprint 7 Mobile MVP

---

## Arquitectura del sistema al finalizar Sprint 7

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UBER_BASE — MVP Completo                     │
├──────────────────────────┬──────────────────────────────────────────┤
│  apps/mobile             │  apps/api                                │
│  ─────────────────────── │  ──────────────────────────────────────  │
│  React Native 0.73 bare  │  Fastify 4 + TypeScript 5 strict        │
│  React Navigation 6      │  Módulos: auth, users, drivers, trips,  │
│  React Query 5           │  pricing, payments, notifications,       │
│  Zustand 4 + MMKV        │  scheduler, admin, tracking (NEW)       │
│  Socket.io 4 client      │                                          │
│  react-native-maps       │  BullMQ workers: payment, notification  │
│  @rn-firebase/messaging  │  Scheduler: node-cron cada 1 min        │
│  Axios + JWT interceptor │                                          │
├──────────────────────────┤  Socket.io 4: /passenger, /driver       │
│  apps/web                │                                          │
│  ─────────────────────── ├──────────────────────────────────────────┤
│  Vite 5 + React 19       │  PostgreSQL 15 + TimescaleDB             │
│  TanStack Router/Query   │  Redis 7 + BullMQ                       │
│  Tailwind                │  TimescaleDB hypertable: trip_locations  │
└──────────────────────────┴──────────────────────────────────────────┘
```

---

## Estructura de directorios — módulos nuevos

### `apps/mobile/` (reestructuración completa)

```
apps/mobile/
├── android/                          ← Scaffolding nativo (MOB-001)
├── ios/                              ← Scaffolding nativo (MOB-001)
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx         ← Stack pasajero vs conductor según role
│   │   ├── PassengerNavigator.tsx
│   │   └── DriverNavigator.tsx
│   ├── screens/
│   │   ├── passenger/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── EstimateScreen.tsx
│   │   │   └── ActiveTripScreen.tsx
│   │   ├── driver/
│   │   │   ├── OnlineScreen.tsx
│   │   │   ├── TripRequestScreen.tsx
│   │   │   └── ActiveTripScreen.tsx
│   │   └── shared/
│   │       └── LoginScreen.tsx
│   ├── services/
│   │   ├── api.client.ts             ← Axios + interceptor JWT refresh
│   │   ├── socket.client.ts          ← Socket.io wrapper + reconexión
│   │   ├── location.service.ts       ← GPS polling + cola MMKV (MOB-004)
│   │   └── notification.service.ts   ← FCM token register + handlers (MOB-005)
│   ├── stores/
│   │   ├── auth.store.ts             ← Zustand + MMKV persist (tokens, userId, role)
│   │   ├── trip.store.ts             ← activeTrip, driverLocation, tripStatus
│   │   └── driver.store.ts           ← online, activeTrip, pendingRequest
│   ├── hooks/
│   │   ├── useTrip.ts                ← React Query wrappers
│   │   ├── useEstimate.ts
│   │   └── useDriverStatus.ts
│   └── index.ts                      ← Entry point
├── package.json
└── tsconfig.json
```

### `apps/api/src/modules/tracking/` (TRACK-001)

```
apps/api/src/modules/tracking/
├── tracking.routes.ts
├── tracking.controller.ts
├── tracking.service.ts
└── tracking.repository.ts
```

---

## Diseño de componentes clave

### AuthStore (Zustand + MMKV)

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'auth' });

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: 'passenger' | 'driver' | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (userId: string, role: 'passenger' | 'driver') => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (userId, role) => set({ userId, role }),
      logout: () => set({ accessToken: null, refreshToken: null, userId: null, role: null }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => ({
        getItem: (key) => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      })),
    }
  )
);
```

### TripStore (Zustand — sin persist)

```typescript
interface TripState {
  activeTrip: ActiveTrip | null;
  driverLocation: { lat: number; lng: number } | null;
  tripStatus: TripStatus | null;
  setActiveTrip: (trip: ActiveTrip) => void;
  updateDriverLocation: (lat: number, lng: number) => void;
  updateStatus: (status: TripStatus) => void;
  clearTrip: () => void;
}

type TripStatus = 'REQUESTED' | 'SEARCHING' | 'ACCEPTED' | 'DRIVER_EN_ROUTE'
                | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED'
                | 'CANCELLED_BY_PASSENGER' | 'CANCELLED_BY_DRIVER';
```

### DriverStore (Zustand — sin persist)

```typescript
interface DriverState {
  online: boolean;
  activeTrip: ActiveTrip | null;
  pendingRequest: TripRequest | null;
  setOnline: (online: boolean) => void;
  setActiveTrip: (trip: ActiveTrip) => void;
  setPendingRequest: (request: TripRequest | null) => void;
}

interface TripRequest {
  tripId: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistanceKm: number;
  estimatedFare: number;
  expiresAt: number; // timestamp
}
```

### API Client (Axios + interceptor JWT)

```typescript
// services/api.client.ts
import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = axios.create({
  baseURL: process.env.API_BASE_URL ?? 'http://localhost:3000',
  timeout: 10_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (!refreshToken) { logout(); return Promise.reject(error); }
      try {
        const { data } = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`,
          { refreshToken });
        setTokens(data.accessToken, data.refreshToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient.request(error.config);
      } catch {
        logout();
      }
    }
    return Promise.reject(error);
  }
);
```

### Socket.io Client Wrapper

```typescript
// services/socket.client.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';

let socket: Socket | null = null;

export function getSocket(namespace: 'passenger' | 'driver'): Socket {
  if (socket?.connected) return socket;
  const token = useAuthStore.getState().accessToken;
  socket = io(`${process.env.API_BASE_URL}/${namespace}`, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

### LocationService (GPS + cola MMKV)

```typescript
// services/location.service.ts
import Geolocation from '@react-native-community/geolocation';
import { MMKV } from 'react-native-mmkv';
import { apiClient } from './api.client';

const storage = new MMKV({ id: 'location-queue' });
const QUEUE_KEY = 'location_queue';
const MAX_QUEUE_SIZE = 100;

export class LocationService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.intervalId = setInterval(() => {
      Geolocation.getCurrentPosition(
        ({ coords }) => this.send(coords.latitude, coords.longitude),
        () => {} // silently ignore errors — already queued
      );
    }, 5_000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private async send(lat: number, lng: number): Promise<void> {
    const queued = this.getQueue();
    queued.push({ lat, lng, timestamp: Date.now() });
    if (queued.length > MAX_QUEUE_SIZE) queued.shift(); // discard oldest
    this.saveQueue(queued);
    await this.flush();
  }

  async flush(): Promise<void> {
    const queue = this.getQueue();
    if (queue.length === 0) return;
    // Send most recent only to minimize API calls
    const { lat, lng } = queue[queue.length - 1];
    try {
      await apiClient.patch('/drivers/me/location', { lat, lng });
      this.saveQueue([]); // clear on success
    } catch {
      // keep queue for next attempt
    }
  }

  private getQueue(): Array<{ lat: number; lng: number; timestamp: number }> {
    const raw = storage.getString(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private saveQueue(q: Array<{ lat: number; lng: number; timestamp: number }>): void {
    storage.set(QUEUE_KEY, JSON.stringify(q));
  }
}
```

---

## TrackingService (backend)

```typescript
// tracking.service.ts
interface TrackingService {
  recordLocation(driverId: string, lat: number, lng: number): Promise<void>;
  getTripLocations(tripId: string, limit?: number): Promise<TripLocation[]>;
}

interface TripLocation {
  lat: number;
  lng: number;
  recordedAt: Date;
}
```

**Lógica de `recordLocation`:**
1. Buscar en Redis: `driver:{driverId}:active_trip` → `tripId`
2. Si existe `tripId`, insertar en `trip_locations`: `{ trip_id, driver_id, lat, lng, recorded_at: NOW() }`
3. Actualizar Redis: `driver:{driverId}:location` → `{ lat, lng }` (TTL 5 min) — comportamiento existente del drivers service

---

## Contratos de API nuevos (Sprint 7)

### TRACK-001-A: `GET /trips/:id/track`

```
GET /trips/:tripId/track
Authorization: Bearer {token}
Roles permitidos: passenger (solo su viaje), driver (solo su viaje), admin
```

**Response 200:**
```typescript
{
  tripId: string;
  locations: Array<{
    lat: number;    // ej: 19.4326
    lng: number;    // ej: -99.1332
    recordedAt: string; // ISO 8601
  }>;
  count: number;
}
```

**Errores:**
| HTTP | Código interno | Condición |
|---|---|---|
| 404 | TRIP_NOT_FOUND | El viaje no existe |
| 403 | FORBIDDEN | El usuario no pertenece al viaje |
| 400 | TRIP_NOT_STARTED | El viaje aún no está en progreso |

---

### TRACK-001-B: `POST /users/me/device-token`

```
POST /users/me/device-token
Authorization: Bearer {token}
Roles permitidos: passenger, driver
```

**Request:**
```typescript
{
  token: string;          // FCM token del dispositivo
  platform: 'ios' | 'android';
}
```

**Response 200:**
```typescript
{
  registered: true;
}
```

**Errores:**
| HTTP | Código interno | Condición |
|---|---|---|
| 400 | INVALID_TOKEN | token vacío o malformado |

---

## Migration 030 — device_tokens

```typescript
// migrations/030_device_tokens.ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('device_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('token').notNullable();
    table.enu('platform', ['ios', 'android']).notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'active']);
    table.unique(['token']); // un token solo puede estar registrado una vez
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('device_tokens');
}
```

---

## ADRs aplicables a este sprint

| ADR | Decisión |
|---|---|
| ADR-001 | Monolito modular — tracking es un módulo interno, no microservicio |
| ADR-003 | TimescaleDB para `trip_locations` (hypertable ya existe) |
| ADR-004 | React Native sobre Flutter (inamovible) |
| ADR-008 | SELECT FOR UPDATE en transiciones de estado (aplica a trip status changes desde mobile) |
| ADR-009 | pricing_snapshot inmutable — mobile solo lee, no escribe |
| ADR-024 | Socket.io 4 con namespaces /passenger y /driver (JWT en handshake) |
| **ADR-031** | **React Navigation 6** para routing mobile — vs Expo Router (descartado, proyecto bare RN sin Expo) |
| **ADR-032** | **@react-native-community/geolocation** para GPS — vs react-native-background-geolocation (descartado, licencia comercial) |
| **ADR-033** | **@react-native-firebase/messaging** para FCM — vs notifee (descartado, complejidad innecesaria en MVP) |

---

## Variables de entorno nuevas requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `GOOGLE_MAPS_API_KEY_ANDROID` | Google Maps para Android | `AIza...` |
| `GOOGLE_MAPS_API_KEY_IOS` | Google Maps para iOS | `AIza...` |
| `GOOGLE_SERVICES_JSON` | Path al google-services.json de Firebase | `android/app/google-services.json` |
| `GOOGLE_SERVICE_INFO_PLIST` | Path al GoogleService-Info.plist de Firebase | `ios/GoogleService-Info.plist` |
| `API_BASE_URL` | URL del backend desde el dispositivo | `http://10.0.2.2:3000` (emulador Android) |

> Nota: `FCM_SERVER_KEY` ya debe estar en el backend desde Sprint 5 (NotificationService FCMChannel).
