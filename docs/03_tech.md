# Tech — Stack Tecnológico

## Resumen de Decisiones

| Capa | Tecnología | Versión | Justificación |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Stack MERN del equipo |
| Lenguaje | TypeScript | 5.x | Tipado estático, reduce bugs en runtime |
| Framework API | Fastify | 4.x | 3x más rápido que Express en concurrencia |
| Tiempo real | Socket.io | 4.x | WebSockets con rooms, namespaces, reconnect |
| Colas | BullMQ | 5.x | Jobs con reintentos, prioridad, backoff exponencial |
| Validación | Zod | 3.x | Esquemas tipados, integración nativa con TypeScript |
| ORM / Query Builder | Knex | 3.x | Flexible, soporta migraciones, mismo ecosistema Node |
| BD Transaccional | PostgreSQL | 15 | Relacional, ACID, extensible |
| BD Tiempo real | Redis | 7 | Cache, estado activo, broker de BullMQ |
| BD Series de tiempo | TimescaleDB | latest-pg15 | Extensión de PG para tracking GPS |
| Frontend Web | Next.js + React | 14 / 18 | SSR, mismo stack del equipo |
| Mobile | React Native | 0.73+ | Mismo paradigma React, código compartible |
| Mapas mobile | Google Maps SDK nativo | - | Mejor performance que wrappers JS en React Native |
| Mapas web | Google Maps JS API | - | Cobertura excelente en México |
| Pagos | Stripe | - | API madura, disponible en México |
| Push | FCM + APNs | - | Estándar Android e iOS |
| SMS | Twilio | - | OTP y alertas críticas |
| Logs | Pino | 8.x | JSON estructurado, mínimo overhead |
| Métricas | Prometheus + Grafana | - | Self-hosted, gratuito |
| Trazas | OpenTelemetry + Jaeger | - | Portable a Datadog sin cambio de código |
| Testing | Jest + Supertest | 29 / 6 | Estándar Node.js |
| Testing E2E | Playwright | 1.x | Para uso local del agente y smoke en CI |
| Contenedores | Docker | - | Entorno reproducible |
| CI/CD | GitHub Actions | - | Nativo al repositorio |
| Deploy MVP | Railway / Render | - | Deploy simple, BD managed |
| CDN | Cloudflare | - | Edge en LATAM, DDoS, SSL |

---

## Backend

### Fastify — Configuración Base

```typescript
// src/app.ts
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const app = Fastify({
  logger: pinoLogger,
}).withTypeProvider<TypeBoxTypeProvider>();

// Plugins globales
await app.register(import('@fastify/cors'),        { origin: ALLOWED_ORIGINS });
await app.register(import('@fastify/helmet'));
await app.register(import('@fastify/rate-limit'),  { max: 100, timeWindow: '1 minute' });
await app.register(import('@fastify/jwt'),          { secret: JWT_SECRET });
await app.register(import('@fastify/multipart'));   // upload de documentos

// Health check
app.get('/health', () => ({ status: 'ok' }));

// Error handler global
app.setErrorHandler(errorHandler);
```

### Estructura de módulos

```typescript
// Cada módulo sigue el mismo patrón:
// routes → controller → service → repository

// routes.ts — define endpoints y validación Zod
// controller.ts — recibe request, llama service, retorna response
// service.ts — lógica de negocio pura, inyección de dependencias
// repository.ts — acceso a BD, sin lógica de negocio
// schema.ts — esquemas Zod para request/response
// types.ts — interfaces TypeScript del módulo
```

### Knex — Configuración

```typescript
// src/config/database.ts
import knex from 'knex';

export const db = knex({
  client:     'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: parseInt(process.env.DATABASE_POOL_MIN ?? '2'),
    max: parseInt(process.env.DATABASE_POOL_MAX ?? '10'),
  },
  migrations: {
    directory: './src/migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './src/seeds',
  },
});
```

### Redis — Configuración

```typescript
// src/config/redis.ts
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,  // requerido por BullMQ
  enableReadyCheck:     false,
  retryStrategy: (times) => Math.min(times * 50, 2_000),
});
```

---

## Mobile — React Native

### Dependencias clave

```json
{
  "dependencies": {
    "react-native-maps":              "^1.x",
    "react-native-google-maps":       "nativo",
    "@react-native-firebase/app":     "^18.x",
    "@react-native-firebase/messaging": "^18.x",
    "socket.io-client":               "^4.x",
    "@mmkv/react-native":             "^2.x",
    "@tanstack/react-query":          "^5.x",
    "zustand":                        "^4.x",
    "react-native-reanimated":        "^3.x",
    "react-native-gesture-handler":   "^2.x"
  }
}
```

### Gestión de estado

| Capa | Herramienta | Qué maneja |
|---|---|---|
| Estado del servidor | React Query | Caché de datos de API, revalidación |
| Estado global UI | Zustand | Usuario autenticado, viaje activo |
| Estado local | useState / useReducer | Estado de formularios y pantallas |
| Persistencia local | MMKV | Tokens, puntos GPS offline, preferencias |

### Tracking offline

```typescript
// La app del conductor guarda puntos GPS localmente cuando pierde señal
// Al recuperar, sincroniza en batch con timestamps originales

class OfflineTracker {
  private queue: LocationPoint[] = [];

  addPoint(point: LocationPoint) {
    if (!this.isOnline) {
      this.queue.push(point);
      MMKV.set('offline_gps_queue', JSON.stringify(this.queue));
    } else {
      this.sendToServer(point);
    }
  }

  async sync() {
    if (this.queue.length === 0) return;
    await api.post('/drivers/me/location/batch', { points: this.queue });
    this.queue = [];
    MMKV.delete('offline_gps_queue');
  }
}
```

---

## Bases de Datos

### PostgreSQL — Configuración de producción

```sql
-- Parámetros relevantes para este workload
max_connections         = 100
shared_buffers          = 256MB    -- 25% de RAM disponible
work_mem                = 4MB
maintenance_work_mem    = 64MB
wal_buffers             = 16MB
checkpoint_completion_target = 0.9
random_page_cost        = 1.1      -- si usas SSD
effective_cache_size    = 768MB    -- 75% de RAM disponible
```

### TimescaleDB — Hypertable GPS

```sql
-- trip_locations como hypertable particionado por día
SELECT create_hypertable(
  'trip_locations',
  'time',
  chunk_time_interval => INTERVAL '1 day'
);

-- Compresión automática de datos de más de 7 días
ALTER TABLE trip_locations SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'time DESC',
  timescaledb.compress_segmentby = 'trip_id'
);

SELECT add_compression_policy('trip_locations', INTERVAL '7 days');

-- Retención de datos: eliminar puntos de más de 90 días
SELECT add_retention_policy('trip_locations', INTERVAL '90 days');
```

### Redis — Estructura de Keys

```
trip:{id}:state              → estado completo del viaje activo (HSET)
driver:{id}:location         → posición actual del conductor (HSET, TTL 5min)
driver:{id}:active_trip      → id del viaje activo del conductor (STRING)
passenger:{id}:active_trip   → id del viaje activo del pasajero (STRING)
pricing:factors:{region}     → factores activos cacheados (STRING JSON, TTL 5min)
```

---

## Seguridad

### JWT

```typescript
// Access token: 15 minutos
// Refresh token: 30 días con rotación automática

interface JWTPayload {
  sub:    string;    // user_id
  roles:  string[];  // ['passenger'] | ['driver'] | ['admin']
  region: string;    // 'MX'
}
```

### Rate Limiting por endpoint

| Endpoint | Límite | Ventana |
|---|---|---|
| `POST /auth/login` | 5 req | 15 min |
| `POST /auth/verify-phone` | 3 req | 10 min |
| `POST /trips` | 10 req | 1 hora |
| `PATCH /drivers/me/location` | 1000 req | 1 hora |
| Default | 100 req | 1 min |

### Validación de entrada

Todo endpoint valida con Zod. Si la validación falla, retorna 422 con detalle de los campos inválidos. Nunca llega SQL crudo a la BD.

---

## Resiliencia

### Circuit Breaker — Servicios externos

| Servicio | Timeout | Threshold de error | Reset |
|---|---|---|---|
| Google Maps | 5 seg | 40% | 60 seg |
| Stripe | 10 seg | 30% | 120 seg |
| FCM | 5 seg | 50% | 30 seg |
| Twilio | 8 seg | 50% | 60 seg |

### Fallbacks

| Servicio | Fallback |
|---|---|
| Google Maps | Estimación lineal por distancia haversine |
| Redis caído | Leer estado desde PostgreSQL |
| FCM falla | SMS vía Twilio para notificaciones críticas |
| Stripe falla | 3 reintentos exponenciales → escalación manual |

---

## Testing

### Stack

| Tipo | Herramienta | Cuándo corre |
|---|---|---|
| Unit | Jest | En cada commit |
| Integration | Jest + Testcontainers | En cada PR |
| E2E | Playwright (local) | Agente de desarrollo |
| Smoke | Playwright @smoke | Antes de deploy en CI |

### Cobertura mínima

| Módulo | Líneas | Branches |
|---|---|---|
| `TripStateMachine` | 100% | 100% |
| `PricingEngine` | 100% | 100% |
| `PaymentService` | 95% | 90% |
| Global | 75% | 70% |

---

## Infraestructura

### MVP

```
Cloudflare (CDN + DDoS + SSL)
  → Railway / Render
      → API Service (Node.js + Fastify + Socket.io)
      → Workers (BullMQ)
      → Scheduler (Cron)
      → PostgreSQL + TimescaleDB (Managed)
      → Redis (Managed)
      → Prometheus + Grafana + Jaeger
```

### Migración a AWS (> 1,000 viajes/día)

| Componente | AWS |
|---|---|
| API | ECS Fargate |
| PostgreSQL | RDS Multi-AZ |
| Redis | ElastiCache |
| Secretos | AWS Secrets Manager |
| Imágenes | ECR |

---

## Observabilidad

### Los tres pilares

| Pilar | Herramienta | Qué cubre |
|---|---|---|
| Logs | Pino JSON | Eventos del sistema, requestId en cada log |
| Logs BD | PostgreSQL audit_logs | Auditoría de negocio inmutable |
| Métricas | Prometheus + Grafana | KPIs del negocio y salud del sistema |
| Trazas | OpenTelemetry → Jaeger | Recorrido de requests, latencia por capa |

### Métricas clave

`trips_active`, `drivers_online`, `driver_matching_seconds` (histogram), `trip_fare_mxn` (histogram), `payment_queue_size`, `circuit_breaker.opened`
