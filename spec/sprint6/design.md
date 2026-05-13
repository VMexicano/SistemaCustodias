# Sprint 6 — Design

## Arquitectura al finalizar Sprint 6

```
apps/
  api/
    src/
      modules/
        scheduler/          ← NUEVO
          scheduler.service.ts
          scheduler.repository.ts
        scheduled-trips/    ← NUEVO
          scheduled-trips.controller.ts
          scheduled-trips.service.ts
          scheduled-trips.repository.ts
          scheduled-trips.routes.ts
        admin/              ← NUEVO
          admin.controller.ts
          admin.service.ts
          admin.repository.ts
          admin.routes.ts
          admin.middleware.ts
  web/                      ← REEMPLAZADO (Next.js → Vite 5 + React 19)
    index.html
    vite.config.ts
    src/
      main.tsx
      App.tsx
      pages/
        LoginPage.tsx
        DashboardPage.tsx
        ConfigPage.tsx
      components/
        StatsCard.tsx
        TripsTable.tsx
        ErrorsTable.tsx
        PricingForm.tsx
      lib/
        api.ts              ← fetch wrapper con cookie auth
        auth.ts             ← guard / redirect logic
```

---

## Componentes clave

### SchedulerService

```typescript
class SchedulerService {
  constructor(
    private readonly schedulerRepo: SchedulerRepository,
    private readonly tripsService: TripsService,
    private readonly notificationQueue: NotificationQueue
  ) {}

  // Llamado por node-cron cada minuto
  async tick(): Promise<void>

  // Activa viajes cuyo scheduled_for <= NOW()
  private async activateDueTrips(): Promise<void>

  // Envía recordatorios pendientes (24h, 1h, 15m)
  private async sendReminders(): Promise<void>
}
```

**Pattern:** SELECT FOR UPDATE en scheduled_trips para evitar doble activación.

### TripStateMachine — nueva transición

```
SCHEDULED → REQUESTED  (activado por scheduler)
SCHEDULED → CANCELLED  (cancelado por pasajero vía DELETE /trips/scheduled/:id)
```

Nueva entrada en el grafo de transiciones válidas:
```typescript
{ from: 'SCHEDULED', to: 'REQUESTED', actor: 'system' }
{ from: 'SCHEDULED', to: 'CANCELLED', actor: 'passenger' }
```

### AdminMiddleware

```typescript
// apps/api/src/modules/admin/admin.middleware.ts
export async function adminOnly(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.roles.includes('admin')) {
    throw reply.code(403).send({ code: 'FORBIDDEN', message: 'Admin role required' });
  }
}
```

Usado como `preHandler: [authenticate, adminOnly]` en todas las rutas `/admin/*`.

---

## Contratos de API

### Scheduler / Viajes programados

#### POST /trips/schedule
```typescript
// Request
interface ScheduleTripBody {
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  tripTypeId: string;
  scheduledFor: string; // ISO 8601 — mínimo 30 min en el futuro
}

// Response 201
interface ScheduleTripResponse {
  tripId: string;
  status: 'SCHEDULED';
  scheduledFor: string;
  estimatedFare: number;
}

// Errores
// 400 SCHEDULED_TOO_SOON     — scheduledFor < NOW + 30min
// 409 PASSENGER_HAS_ACTIVE_TRIP
```

#### GET /trips/scheduled
```typescript
// Response 200
interface ScheduledTripsResponse {
  trips: Array<{
    tripId: string;
    scheduledFor: string;
    origin: string;
    destination: string;
    estimatedFare: number;
    tripType: string;
  }>;
}
```

#### DELETE /trips/scheduled/:tripId
```typescript
// Response 204 — No content
// Errores
// 404 TRIP_NOT_FOUND
// 403 FORBIDDEN (no es viaje del pasajero)
// 409 TRIP_NOT_SCHEDULED (ya fue activado)
```

---

### Admin — Monitoreo

#### GET /admin/stats
```typescript
// Response 200
interface AdminStatsResponse {
  activeTrips: number;
  onlineDrivers: number;
  todayRevenueMXN: number;
  pendingErrors: number;
}
```

#### GET /admin/trips?status=&page=&limit=
```typescript
// Query params: status?: string, page?: number (default 1), limit?: number (default 20)
// Response 200
interface AdminTripsResponse {
  data: Array<{
    id: string; passengerId: string; driverId: string | null;
    status: string; originAddress: string; destinationAddress: string;
    finalFare: number | null; createdAt: string;
  }>;
  total: number; page: number; limit: number;
}
```

#### GET /admin/drivers?status=&page=
```typescript
// Response 200
interface AdminDriversResponse {
  data: Array<{
    id: string; userId: string; fullName: string;
    status: string; online: boolean; ratingAvg: number | null;
  }>;
  total: number; page: number; limit: number;
}
```

#### GET /admin/errors?resolved=
```typescript
// Query: resolved?: 'true' | 'false' (default false)
// Response 200
interface AdminErrorsResponse {
  data: Array<{
    id: string; errorCode: string; message: string;
    context: Record<string, unknown>; createdAt: string; resolvedAt: string | null;
  }>;
}
```

#### PATCH /admin/errors/:id/resolve
```typescript
// Response 200
interface ResolveErrorResponse { id: string; resolvedAt: string; }
// Errores: 404 ERROR_NOT_FOUND, 409 ERROR_ALREADY_RESOLVED
```

---

### Admin — Configuración

#### GET /admin/pricing/factors
```typescript
// Response 200
interface AdminFactorsResponse {
  factors: Array<{
    id: string; code: string; name: string;
    type: string; value: number; active: boolean; priority: number;
  }>;
}
```

#### PATCH /admin/pricing/factors/:id
```typescript
// Request (todos opcionales)
interface UpdateFactorBody { active?: boolean; value?: number; }
// Response 200 — factor actualizado completo
// Errores: 404 FACTOR_NOT_FOUND
```

#### GET /admin/commissions
```typescript
// Response 200
interface AdminCommissionsResponse {
  commissions: Array<{
    id: string; regionId: string; platformFeePct: number; active: boolean;
  }>;
}
```

#### PATCH /admin/commissions/:id
```typescript
// Request
interface UpdateCommissionBody { platformFeePct: number; } // 0-100
// Response 200 — commission actualizada
// Errores: 404 COMMISSION_NOT_FOUND, 400 INVALID_FEE_PCT
```

#### GET /admin/trip-types
```typescript
// Response 200
interface AdminTripTypesResponse {
  tripTypes: Array<{
    id: string; code: string; name: string; serviceMode: string;
    baseFare: number; costPerKm: number; costPerMin: number; minFare: number;
  }>;
}
```

#### PATCH /admin/trip-types/:id
```typescript
// Request (todos opcionales)
interface UpdateTripTypeBody {
  baseFare?: number; costPerKm?: number; costPerMin?: number; minFare?: number;
}
// Response 200 — trip type actualizado
// Errores: 404 TRIP_TYPE_NOT_FOUND
```

---

## Setup Vite 5 + React 19 (WEB-001)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3002 },
  build: { outDir: 'dist' }
})
```

**Dependencias a instalar:**
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.x",
    "@tanstack/react-query": "^5.x",
    "tailwindcss": "^3.x"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "vite": "^5.x",
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x"
  }
}
```

**Auth en SPA:** JWT almacenado en memoria (variable de módulo en `lib/auth.ts`) + refresh desde cookie httpOnly. El login llama `POST /auth/login` y guarda el access token en memoria; el middleware de rutas verifica su presencia.

**Turbo pipeline (sin cambios):**
```json
// turbo.json — dev y build ya apuntan a scripts del package.json
// apps/web/package.json scripts se mantienen: dev, build, type-check
```

---

## ADRs aplicables

| ADR | Decisión |
|---|---|
| ADR-008 | SELECT FOR UPDATE en transiciones de estado — aplica a SCHEDULED → REQUESTED |
| ADR-014 | SDD/TDD antes de implementar |
| ADR-024 | WebSocket /passenger /driver — el scheduler emite via getIO() igual que trips.service |
| ADR-025 | TripStateMachine: lock en service caller |
| ADR-028 | INotificationChannel — recordatorios via NotificationQueue existente |
| **ADR-029** | Scheduler: node-cron cada minuto en proceso principal (MVP monolito) |
| **ADR-030** | Admin panel: Vite 5 + React 19 + TanStack Router/Query + Tailwind |

---

## Variables de entorno nuevas

```bash
# Ninguna nueva requerida para el backend (scheduler usa DB/Redis existentes)
# El panel web consume VITE_API_URL (opcional, default http://localhost:3333)
VITE_API_URL=http://localhost:3333
```
