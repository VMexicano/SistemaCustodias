[![CI](https://github.com/VMexicano/UBER_BASE/actions/workflows/ci.yml/badge.svg)](https://github.com/VMexicano/UBER_BASE/actions/workflows/ci.yml)

# UBER_BASE

Plataforma tipo UBER · MVP Taxi México · Node.js 20 + TypeScript 5 + Fastify 4 + PostgreSQL + Redis + React Native

---

## Levantar el Proyecto en Local

Esta guía está actualizada al estado actual del repo:

- Monorepo con `pnpm` + `turbo`
- Docker para infraestructura (Postgres, Redis, observabilidad)
- Apps corriendo nativas con hot-reload (`api`, `web`, `mobile-v2`)

### 1) Prerequisitos

- Node.js 20 LTS
- pnpm 9
- Docker Desktop (Windows/macOS) o Docker Engine + Compose (Linux)
- Android Studio (si vas a correr `mobile-v2` en Android)
- JDK 17 (si vas a compilar Android)

Verificaciones recomendadas:

```bash
node --version
pnpm --version
docker --version
docker compose version
adb --version
```

### 2) Instalación inicial

Desde la raíz del repo:

```bash
pnpm install
```

### 3) Variables de entorno

La API lee variables desde `apps/api/.env` (no `.env.local`).

Linux/macOS:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

PowerShell (Windows):

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Valores clave a revisar en `apps/api/.env`:

- `DATABASE_URL=postgresql://ridebase_user:ridebase_pass@localhost:5432/ridebase_dev`
- `REDIS_URL=redis://localhost:6379`
- `PORT=3333`
- `STRIPE_SECRET_KEY=sk_test_...` (obligatoria por validación de entorno)
- `CORS_ORIGIN` incluye frontend local (ej. `http://localhost:5173`)

### 4) Levantar infraestructura con Docker

El `docker-compose.yml` de este repo levanta solo infraestructura, no las apps.

```bash
docker compose up -d
docker compose ps
```

Servicios esperados:

- `postgres` (5432)
- `redis` (6379)
- `bull-board` (3001)
- `prometheus` (9090)
- `grafana` (3000)
- `jaeger` (16686, OTLP 4318)

### 5) Migraciones y seed de base de datos

Desde la raíz:

```bash
pnpm --filter @ridebase/api db:migrate
pnpm --filter @ridebase/api db:seed
```

### 6) Levantar apps en desarrollo

#### Opción A: todo en paralelo (recomendada)

```bash
pnpm dev
```

#### Opción B: por app (debug más controlado)

```bash
pnpm --filter @ridebase/api dev
pnpm --filter @ridebase/web dev
pnpm --filter mobile-v2 start
```

### 7) Puertos reales del proyecto

| Servicio | Puerto | Nota |
|---|---|---|
| API (Fastify) | 3333 | `apps/api` |
| Web (Vite) | 5173 | `apps/web` |
| Mobile Metro | 8081 | `apps/mobile-v2` |
| PostgreSQL | 5432 | Docker |
| Redis | 6379 | Docker |
| Bull Board | 3001 | Docker |
| Grafana | 3000 | Docker |
| Prometheus | 9090 | Docker |
| Jaeger UI | 16686 | Docker |

### 8) Mobile Android (ADB / Expo)

Primera compilación del dev client:

```bash
pnpm --filter mobile-v2 android
```

Luego, para iterar:

```bash
pnpm --filter mobile-v2 start
```

Si usas emulador Android, mapea puertos cuando haga falta:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3333 tcp:3333
```

Si `8081` está ocupado en Windows:

```powershell
netstat -a -n -o | findstr ":8081"
taskkill /PID <PID> /F
```

### 9) Verificación rápida

```bash
curl http://localhost:3333/health
pnpm type-check
pnpm test
```

### 10) Apagar entorno

```bash
docker compose down
```

Para borrar volúmenes (destructivo):

```bash
docker compose down -v
```

## Flujo sin Docker (opcional)

Puedes correr el proyecto sin Docker solo si ya tienes Postgres y Redis locales con configuración compatible (`DATABASE_URL`, `REDIS_URL`).

En ese caso:

1. Ajusta `apps/api/.env` a tus servicios locales.
2. Ejecuta migraciones/seed.
3. Levanta apps con `pnpm dev`.

Si no tienes esos servicios instalados localmente, usa el flujo con Docker.

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 LTS |
| Lenguaje | TypeScript 5 (strict) |
| API | Fastify 4 |
| Base de datos | PostgreSQL 15 + TimescaleDB |
| Cache / Queues | Redis 7 + BullMQ |
| Mobile | Expo SDK 54 + React Native 0.81 |
| Web | Vite + React 19 |
| Monorepo | Turborepo 2 + pnpm 9 |
| CI | GitHub Actions |
