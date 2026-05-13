# Requirements — Sprint 1: Fundamentos

> **Sprint:** 1 de 7
> **Fase del roadmap:** MVP Taxi México
> **Semanas estimadas:** 1-2
> **Estado:** Planificado — pendiente de ejecución
> **Última actualización:** 2026-04-05

---

## 1. Objetivo del Sprint

Establecer la base técnica completa sobre la que se construirán todos los módulos de negocio.
Al finalizar este sprint, el repositorio debe tener: monorepo funcional, servicios de infraestructura corriendo en local, API base conectada a BD, las 22 tablas del schema creadas con sus datos semilla, y el pipeline de CI verificando calidad automáticamente.

**Resultado esperado:** Un desarrollador nuevo puede clonar el repo, ejecutar `docker compose up -d && pnpm install && pnpm dev` y tener el sistema corriendo localmente en menos de 10 minutos.

---

## 2. Contexto y motivación

### ¿Por qué este sprint es el primero y más crítico?

Sprint 1 es el cimiento de los 6 sprints siguientes. Si las decisiones de infraestructura están mal tomadas aquí, cada sprint posterior carga esa deuda. Específicamente:

- **Monorepo mal configurado** → conflictos de dependencias y builds rotos en cada cambio
- **Migraciones sin `down()`** → imposible hacer rollback en producción ante errores de schema
- **Sin Testcontainers** → tests de integración con mocks que divergen del comportamiento real (ADR-012 documenta el incidente anterior)
- **Sin CI desde el día 1** → deuda técnica acumulada que es costosa de pagar en sprints avanzados

### Alcance de este sprint

| Incluye | Excluye |
|---------|---------|
| Monorepo Turborepo + workspaces | Código de módulos de negocio (auth, trips, etc.) |
| docker-compose con todos los servicios locales | Configuración de deploy en Railway/Render |
| Estructura base de `apps/api` (Fastify) | Rutas de negocio y endpoints |
| 22 migraciones Knex completas | Tests de módulos de negocio |
| Seeds: región, trip types, factores, admin | Datos de prueba de conductores/pasajeros |
| Setup Jest + Testcontainers | Specs E2E de flujos de negocio |
| Setup Playwright (configuración) | Specs Playwright de happy path |
| GitHub Actions CI | Pipeline de CD / deploy automático |
| `BusinessError` y `TechnicalError` | Lógica de manejo de errores por módulo |
| Middleware: authenticate, authorize, request-logger | Lógica de autorización por rol |

---

## 3. Actores y stakeholders

| Actor | Interés en este sprint |
|-------|----------------------|
| **Developer** | Puede levantar el entorno local en < 10 min sin pasos manuales |
| **QA** | Puede correr tests con BD real (Testcontainers) sin setup adicional |
| **DevOps** | CI verde en cada PR, health checks documentados |
| **Architect** | Stack inamovible respetado, ADRs documentadas |

---

## 4. Requerimientos funcionales

### RF-001 — Monorepo operativo
**Como** desarrollador,
**quiero** que el repositorio esté organizado como monorepo con Turborepo,
**para** poder trabajar en `apps/api`, `apps/web`, `apps/mobile` y `packages/shared-types` de forma coordinada con builds incrementales.

**Criterios de aceptación:**
- [ ] `pnpm install` en la raíz instala todas las dependencias de todos los workspaces
- [ ] `turbo run build` compila todos los paquetes en orden correcto
- [ ] `turbo run lint` verifica código en todos los workspaces
- [ ] `packages/shared-types` exporta tipos compartidos que `apps/api` puede importar

---

### RF-002 — Entorno de desarrollo local
**Como** desarrollador,
**quiero** levantar todos los servicios con un solo comando,
**para** no tener que instalar PostgreSQL, Redis ni herramientas de observabilidad manualmente.

**Criterios de aceptación:**
- [ ] `docker compose up -d` levanta: PostgreSQL 15 (TimescaleDB), Redis 7, Bull Board, Prometheus, Grafana, Jaeger
- [ ] Todos los servicios tienen health checks configurados
- [ ] Los datos persisten entre reinicios (volúmenes Docker)
- [ ] `docker compose down -v` limpia todo sin dejar residuos

**Puertos locales:**
| Servicio | Puerto |
|----------|--------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Bull Board | 3001 |
| Prometheus | 9090 |
| Grafana | 3000 |
| Jaeger UI | 16686 |
| API (dev) | 3333 |

---

### RF-003 — API base funcional
**Como** desarrollador,
**quiero** que `apps/api` arranque con configuración validada y conexiones verificadas,
**para** tener feedback inmediato si falta alguna variable de entorno o si la BD no está disponible.

**Criterios de aceptación:**
- [ ] `GET /health` retorna `{ status: "ok", db: "connected", redis: "connected", version: "0.1.0" }`
- [ ] Si una variable de entorno obligatoria falta, el proceso falla al arrancar con mensaje descriptivo (ej: `Missing required env var: DATABASE_URL`)
- [ ] El servidor acepta graceful shutdown (SIGTERM) y cierra conexiones limpiamente

---

### RF-004 — Schema de base de datos completo
**Como** desarrollador de cualquier módulo de negocio (Sprint 2+),
**quiero** que las 22 tablas estén creadas con sus relaciones FK, índices y constraints,
**para** poder implementar mi módulo sin tener que definir el schema.

**Criterios de aceptación:**
- [ ] `knex migrate:latest` crea las 22 tablas sin errores
- [ ] `knex migrate:rollback --all` revierte todas las migraciones sin errores
- [ ] `trip_locations` está configurada como hypertable de TimescaleDB
- [ ] Todas las FKs están definidas correctamente (no permite huérfanos)
- [ ] UUIDs generados con `gen_random_uuid()` en todas las PKs

---

### RF-005 — Datos semilla base
**Como** sistema,
**quiero** tener los datos de configuración base al arrancar en cualquier entorno,
**para** que la aplicación pueda calcular tarifas, crear viajes y autenticar usuarios sin configuración manual adicional.

**Criterios de aceptación:**
- [ ] Región México configurada: `MXN`, IVA `0.16`, timezone `America/Mexico_City`, prefijo `+52`
- [ ] 3 tipos de viaje: Basic, Plus, Premium con tarifas base en MXN
- [ ] Factores de precio iniciales creados (desactivados): noche, lluvia, hora pico, demanda alta
- [ ] Usuario admin creado con rol `admin`
- [ ] Seeds son idempotentes: ejecutar dos veces no duplica registros

---

### RF-006 — Suite de tests configurada
**Como** desarrollador,
**quiero** poder correr tests con base de datos real sin instalar nada,
**para** tener confianza en que los tests reflejan el comportamiento real del sistema.

**Criterios de aceptación:**
- [ ] `pnpm test` ejecuta la suite (0 tests por ahora, pero sin error)
- [ ] `pnpm test:coverage` genera reporte en `/coverage`
- [ ] Testcontainers levanta Postgres 15 + Redis 7 en < 30 segundos
- [ ] Los umbrales de cobertura están configurados: TripStateMachine 100%, PricingEngine 100%, PaymentService 95%, global 75%
- [ ] Fallar un umbral hace fallar el comando `pnpm test:coverage`

---

### RF-007 — Playwright configurado
**Como** QA,
**quiero** tener la infraestructura de tests E2E lista,
**para** poder escribir specs de flujos de negocio sin configuración adicional en Sprint 6.

**Criterios de aceptación:**
- [ ] `pnpm test:e2e` ejecuta sin error (0 specs)
- [ ] `playwright.config.ts` apunta al entorno local de la API
- [ ] Fixture base disponible para autenticación en tests

---

### RF-008 — CI automático en cada PR
**Como** equipo de desarrollo,
**quiero** que cada Pull Request ejecute lint, type-check y tests automáticamente,
**para** que ningún código roto llegue a `main`.

**Criterios de aceptación:**
- [ ] PR no mergeable si `lint` falla
- [ ] PR no mergeable si `tsc --noEmit` reporta errores
- [ ] PR no mergeable si cobertura cae por debajo de umbrales
- [ ] Cache de dependencias entre runs (builds rápidos)
- [ ] Tiempo total del pipeline < 5 minutos

---

## 5. Requerimientos no funcionales

### RNF-001 — TypeScript estricto (inamovible)
Todo el código de `apps/api` usa `strict: true` en `tsconfig.json`. Cero usos de `any` explícito.

### RNF-002 — Variables de entorno tipadas
Ningún módulo accede a `process.env.X` directamente. Toda configuración pasa por `src/config/environment.ts` que valida con Zod al arranque.

### RNF-003 — Logs estructurados en JSON
El logger base es Pino con nivel configurable por variable de entorno. En desarrollo: pretty-print. En producción: JSON puro.

### RNF-004 — Graceful shutdown
El servidor maneja `SIGTERM` y `SIGINT`: deja de aceptar conexiones nuevas, espera que las activas terminen (timeout 10s), cierra conexiones a BD y Redis.

### RNF-005 — Sin secrets en el repositorio
`.env` siempre en `.gitignore`. `.env.example` documenta todas las variables sin valores reales.

---

## 6. Restricciones técnicas inamovibles

Heredadas de `steering/architecture.md` y las ADRs existentes (ADR-001 a ADR-010):

| Restricción | Por qué no cambiar |
|-------------|-------------------|
| Fastify 4 (no Express, no NestJS) | ADR-002 — 3x throughput, crítico para tracking GPS |
| Knex 3 (no Prisma, no TypeORM) | ADR-001 — control granular de queries y migraciones |
| PostgreSQL 15 + TimescaleDB (no MongoDB) | ADR-003 — ACID para transacciones financieras |
| pnpm (no npm, no yarn) | ADR-011 — performance en monorepo, workspace linking nativo |
| UUID con gen_random_uuid() | R-DATA-004 — no autoincremental, consistente entre servicios |
| TIMESTAMPTZ en UTC | R-DATA-005 — siempre con zona horaria |
| Soft delete con deleted_at | R-DATA-001 — nunca DELETE en entidades de negocio |

---

## 7. Dependencias externas

| Dependencia | Tipo | Requerida en Sprint |
|-------------|------|-------------------|
| Docker Desktop | Local | Sprint 1 |
| Node.js 20 LTS | Local | Sprint 1 |
| pnpm | Local | Sprint 1 |
| GitHub Actions | CI/CD | Sprint 1 |
| Twilio | SMS/OTP | Sprint 2 |
| Stripe | Pagos | Sprint 5 |
| FCM | Push notifications | Sprint 5 |

---

## 8. Decisiones pendientes que NO bloquean Sprint 1

Estas decisiones se necesitan antes de Sprint 3-4 pero no afectan las tareas de este sprint:

| Decisión | Impacta | Urgencia |
|----------|---------|----------|
| Nombre de dominio de la API | CORS config | Antes de Sprint 2 |
| Radio inicial de búsqueda de conductores | Matching algorithm | Antes de Sprint 4 |
| Tiempo máximo sin conductor (SEARCHING timeout) | State machine | Antes de Sprint 4 |
| Porcentaje de comisión inicial | Seeds de comisiones | Antes de Sprint 4 |
| Política de cancelación (¿cargo?) | Lógica de negocio | Antes de Sprint 4 |
| Proceso de verificación de conductores | ¿Manual o externo? | Antes de Sprint 3 |
