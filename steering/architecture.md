# Steering — Arquitectura

> Decisiones de stack inamovibles y restricciones de arquitectura.
> Antes de proponer cualquier cambio técnico, leer este archivo completo.
> Fuentes: docs/03_tech.md · docs/13_decisions_log.md · docs/05_context.md

---

## Stack — Decisiones inamovibles

Estas decisiones ya fueron tomadas y documentadas. No cambiarlas sin:
1. Justificación técnica sólida
2. Actualizar este archivo
3. Agregar ADR en docs/13_decisions_log.md

| Capa | Tecnología | Versión | Por qué — NO cambiar por |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Stack del equipo — no Bun, no Deno |
| Lenguaje | TypeScript | 5.x (strict) | Tipado estático — no JS puro |
| Framework API | **Fastify** | 4.x | 3× throughput vs Express — **no Express, no NestJS** |
| ORM | **Knex** | 3.x | Query builder con migraciones — **no Prisma, no TypeORM** |
| Validación | Zod | 3.x | Tipado nativo TS — no Joi, no Yup |
| BD principal | **PostgreSQL** | 15 | Relacional ACID — **no MongoDB, no MySQL** |
| Cache / broker | **Redis** | 7 | Estado activo + BullMQ — **no Memcached** |
| GPS / series de tiempo | **TimescaleDB** | latest-pg15 | Extensión de PG — **no InfluxDB** |
| Colas | **BullMQ** | 5.x | Sobre Redis — **no Kafka en MVP** |
| Tiempo real | Socket.io | 4.x | WebSockets con rooms — no SSE |
| Frontend web | **Next.js + React** | 14 / 18 | App Router, SSR — |
| Mobile | **React Native** | 0.73+ | Mismo paradigma React — **no Flutter** |
| Mapas mobile | Google Maps SDK nativo | — | Performance — **no wrapper JS** |
| Pagos MVP | **Stripe** | — | Solo tarjeta MVP — **no MercadoPago, no efectivo** |
| Push | FCM + APNs | — | Estándar iOS/Android |
| SMS / OTP | Twilio | — | |
| Logs | Pino | 8.x | JSON estructurado, mínimo overhead |
| Métricas | Prometheus + Grafana | — | Self-hosted |
| Trazas | OpenTelemetry + Jaeger | — | Portable a Datadog sin cambio de código |
| Tests unit | Jest + Supertest | 29 / 6 | |
| Tests E2E | Playwright | 1.x | |
| Monorepo | Turborepo | — | Builds incrementales |
| CI/CD | GitHub Actions | — | |
| Deploy MVP | Railway / Render | — | Simple, BD managed — AWS en > 1k viajes/día |

---

## Arquitectura del sistema

**Patrón:** Monolito modular (ADR-001)
- No microservicios en MVP
- Módulos internos bien separados, extraíbles cuando el volumen lo justifique
- Un solo deployment para el MVP

**Patrón de módulo interno:**
```
routes.ts → controller.ts → service.ts → repository.ts
```
- `routes.ts`: solo mapeo de endpoints + validación Zod
- `controller.ts`: recibe request, llama service, retorna response — sin lógica de negocio
- `service.ts`: toda la lógica de negocio — inyección de dependencias
- `repository.ts`: solo acceso a BD con Knex — sin lógica de negocio

---

## Infraestructura MVP

```
Cloudflare (CDN + DDoS + SSL)
  → Railway / Render
      → API Service (Node.js + Fastify + Socket.io)
      → Workers (BullMQ)
      → Scheduler (Cron cada 1 min)
      → PostgreSQL + TimescaleDB (Managed)
      → Redis (Managed)
      → Prometheus + Grafana + Jaeger
```

---

## Seguridad

```typescript
// JWT
// Access token:  15 minutos
// Refresh token: 30 días con rotación automática
interface JWTPayload {
  sub:    string;    // user_id
  roles:  string[];  // ['passenger'] | ['driver'] | ['admin']
  region: string;    // 'MX'
}
```

**Rate limits clave:**

| Endpoint | Límite | Ventana |
|---|---|---|
| `POST /auth/login` | 5 req | 15 min |
| `POST /auth/verify-phone` | 3 req | 10 min |
| `POST /trips` | 10 req | 1 hora |
| `PATCH /drivers/me/location` | 1000 req | 1 hora |
| Default | 100 req | 1 min |

---

## Concurrencia — Circuit breakers

| Servicio | Timeout | Threshold error | Reset |
|---|---|---|---|
| Google Maps | 5 seg | 40% | 60 seg |
| Stripe | 10 seg | 30% | 120 seg |
| FCM | 5 seg | 50% | 30 seg |
| Twilio | 8 seg | 50% | 60 seg |

**Fallbacks:**
- Google Maps caído → estimación lineal haversine
- Redis caído → leer estado desde PostgreSQL
- FCM falla → SMS vía Twilio para notificaciones críticas
- Stripe falla → 3 reintentos exponenciales → escalación manual

---

## Bases de datos — Estructura de keys en Redis

```
trip:{id}:state              → estado completo del viaje activo (HSET)
driver:{id}:location         → posición actual del conductor (HSET, TTL 5 min)
driver:{id}:active_trip      → id del viaje activo del conductor (STRING)
passenger:{id}:active_trip   → id del viaje activo del pasajero (STRING)
pricing:factors:{region}     → factores activos cacheados (STRING JSON, TTL 5 min)
otp:{phone}                  → OTP de verificación (STRING, TTL 10 min)
blacklist:token:{jti}        → refresh token invalidado (STRING, TTL = tiempo restante)
```

---

## Observabilidad — Métricas clave

```
trips_active
drivers_online
driver_matching_seconds    (histogram)
trip_fare_mxn              (histogram)
payment_queue_size
circuit_breaker.opened
```

---

## Decisiones de arquitectura tomadas (ADRs)

Ver detalle completo en docs/13_decisions_log.md:

| ADR | Decisión |
|---|---|
| ADR-001 | Monolito modular sobre microservicios |
| ADR-002 | Fastify sobre Express |
| ADR-003 | PostgreSQL + Redis + TimescaleDB |
| ADR-004 | React Native sobre Flutter |
| ADR-005 | BullMQ + Cron sobre Kafka |
| ADR-006 | Stripe como único procesador en MVP |
| ADR-007 | OpenTelemetry sobre Datadog directo |
| ADR-008 | SELECT FOR UPDATE en transiciones de estado |
| ADR-009 | pricing_snapshot inmutable en trips |
| ADR-010 | Scheduler con cron + PostgreSQL |
