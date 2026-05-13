# Decisions Log — Architecture Decision Records (ADR)

> Registro de todas las decisiones de arquitectura y producto significativas.
> Cada decisión incluye el contexto, las opciones consideradas, y el razonamiento.
>
> **Formato:** Una sección por decisión, en orden cronológico.
> **Cuándo agregar:** Toda decisión que no sea trivialmente reversible.

---

## ADR-047 — Flujo de Aprobación Opcional en TripStateMachine

**Fecha:** 2026-05-07
**Estado:** Aceptado
**Área:** Trips · Verticals · Multi-vertical

### Contexto

El state machine actual asume disponibilidad inmediata de conductores (flujo taxi pull). Los verticales B2B (`custody`, `cold-chain`) requieren un paso de aprobación intermedia antes del despacho: una empresa/dispatcher revisa la solicitud, la aprueba y opcionalmente asigna un conductor. El campo `trips.status` es `varchar(30)` (no un PG ENUM), por lo que agregar valores nuevos no requiere `ALTER TYPE`.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Estados nuevos en el state machine central | Un solo state machine, una sola tabla `trips`, todos los verticales comparten historial | Hay que blindar que taxi nunca pase por PENDING_APPROVAL |
| State machine separado por vertical | Máxima flexibilidad | Duplicación de lógica, dos fuentes de verdad para `trips.status` |
| Campo `approval_status` separado | No toca el flujo principal | Dos campos de estado → inconsistencia posible, lógica partida |

### Decisión

Extender el state machine central con dos estados opcionales: `PENDING_APPROVAL` y `APPROVED`. Un nuevo actor `dispatcher` tiene permisos exclusivos en las transiciones de aprobación. El flag `vertical.features.requiresApproval: boolean` (JSONB, default `false`) determina qué flujo inicial aplica al crear el viaje.

**Flujo taxi (requiresApproval: false):**
```
REQUESTED → SEARCHING → ACCEPTED → ...
```

**Flujo B2B (requiresApproval: true):**
```
REQUESTED → PENDING_APPROVAL → APPROVED → SEARCHING → ACCEPTED → ...
```

Nuevas transiciones en `VALID_TRANSITIONS`:
- `REQUESTED→PENDING_APPROVAL` — actor: `system`
- `PENDING_APPROVAL→APPROVED` — actor: `dispatcher`
- `PENDING_APPROVAL→CANCELLED` — actores: `dispatcher`, `passenger`
- `APPROVED→SEARCHING` — actor: `system` (BullMQ job)
- `APPROVED→CANCELLED` — actores: `dispatcher`, `passenger`

### Consecuencias

- **Facilita:** Taxi no cambia en absoluto; verticales B2B tienen flujo completo de aprobación; el config se lee de Redis (sin query extra); el backoffice puede filtrar por `PENDING_APPROVAL`
- **Complica:** `trips.service.createTrip` debe consultar el config del vertical al crear el viaje; los tests del state machine deben cubrir ambas ramas al 100%
- **Criterio de revisión:** Si más de 3 verticales necesitan flujos de aprobación radicalmente distintos, evaluar state machine pluggable por vertical

### Nota de implementación — actorId en transiciones de dispatcher

`trip_status_history.changed_by` tiene FK → `users.id`. Los admin/dispatchers residen en `admin_users`, no en `users`. Por esto, todas las transiciones con `actor: 'dispatcher'` deben pasar `actorId: null` al state machine. La trazabilidad del dispatcher se preserva en `trips.approved_by` (columna dedicada, migration 038) y en el campo `notes` del historial (formato: `"[dispatcher:{uuid}] ..."`).

### Patrón JSONB Knex para actualizar features

```typescript
// Activar requiresApproval en un vertical
knex('verticals')
  .where({ slug: 'custody' })
  .update({ features: knex.raw("features || ?::jsonb", [JSON.stringify({ requiresApproval: true })]) });
```

---

## ADR-026 — Política de Tarifa de Cancelación MVP

**Fecha:** 2026-04-23
**Estado:** Aceptado
**Área:** Trips · Payments

### Contexto

Una vez que un conductor acepta un viaje, cancelar sin penalización abre la puerta a abuso por parte del pasajero (acepta, espera que llegue el conductor, cancela). Se necesita una política simple para el MVP que desincentive el abuso sin generar fricción en cancelaciones legítimas (cambio de planes en los primeros segundos).

### Decisión

| Actor | Condición | Tarifa |
|---|---|---|
| Pasajero | < 120 s desde `accepted_at` | $0 MXN |
| Pasajero | ≥ 120 s desde `accepted_at` | $50 MXN |
| Conductor | Cualquier momento | $0 MXN |
| Sistema (timeout) | Cualquier momento | $0 MXN |

Implementada en `TripStateMachine.getCancellationFee()`. El campo `accepted_at` del viaje es la referencia de tiempo. Si `accepted_at` es `null` (cancelación antes de aceptación), la tarifa es $0.

### Consecuencias

- **Facilita:** Lógica centralizada en el state machine; la tarifa se devuelve como parte del resultado de `transition()`; fácil de ajustar sin tocar rutas o controladores
- **Complica:** La tarifa se cobra vía BullMQ `paymentQueue` — si falla, se pierde; no hay reintento automático en MVP
- **Criterio de revisión:** Si el porcentaje de cancelaciones pagadas supera el 15% del total, revisar el umbral de 120 s y el monto $50 con datos reales

---

## ADR-025 — TripStateMachine como Clase Pura

**Fecha:** 2026-04-23
**Estado:** Aceptado
**Área:** Trips · Arquitectura

### Contexto

Las transiciones de estado de viaje involucran validación (¿es legal esta transición?), autorización (¿puede este actor ejecutarla?), cálculo de tarifa de cancelación, y escritura al historial. La pregunta es si esta lógica vive en `TripsService`, en el repositorio, o en una clase propia.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Lógica en `TripsService` | Un solo lugar | Mezcla lógica de negocio con coordinación de repos; difícil de testear aisladamente |
| Clase pura `TripStateMachine` | 100% testeable sin mocks de DB; lógica de dominio explícita | Un objeto extra en el grafo de dependencias |
| Enum + funciones libres | Simple | Sin encapsulamiento; no escalable para 16+ transiciones |

### Decisión

`TripStateMachine` es una clase pura (no toca la base de datos directamente). Recibe la transacción Knex (`trx`) como parámetro y escribe únicamente a `trip_status_history` via `tripsRepo.insertStatusHistory`. El `SELECT FOR UPDATE` lo aplica `TripsService` antes de llamar al state machine. Esto permite 100% de cobertura de tests sin contenedores.

### Consecuencias

- **Facilita:** 100% branch coverage en CI sin Docker; lógica de dominio versionada y legible
- **Complica:** El caller (`TripsService`) debe siempre obtener el lock antes de llamar al state machine; la clase asume que el trip recibido está bloqueado

---

## ADR-024 — Socket.io Rooms por Trip ID

**Fecha:** 2026-04-23
**Estado:** Aceptado
**Área:** Realtime · Trips

### Contexto

Los eventos en tiempo real (cambio de estado, nueva solicitud de viaje) deben llegar solo a los actores relevantes. La alternativa es broadcast global o filtrado en cliente.

### Decisión

Cada viaje activo tiene un room de Socket.io con nombre `trip:{trip_id}`. El pasajero se une al room al recibir `trip_requested`; el conductor se une al aceptar. Los eventos `trip_status_changed` se emiten al room. Los nuevos viajes en búsqueda se emiten en `drivers_online` (room especial al que todos los conductores online se suscriben al conectarse).

Implementado en `realtime.events.ts` con helpers tipados: `emitTripRequested`, `emitTripStatusChanged`.

### Consecuencias

- **Facilita:** Aislamiento natural por viaje; sin filtrado en cliente; el servidor no necesita rastrear qué sockets corresponden a qué viaje
- **Complica:** El cliente debe unirse y salir del room en el momento correcto; reconexiones requieren re-join
- **Criterio de revisión:** Si la escala supera 10k conductores simultáneos, evaluar Redis adapter para Socket.io multi-instancia

---

## ADR-023 — Cálculo de Distancia: Haversine + Radio 5km

**Fecha:** 2026-04-23
**Estado:** Aceptado
**Área:** Pricing · Trips

### Contexto

El cálculo de tarifa requiere una estimación de distancia entre origen y destino. Las opciones son: distancia euclidiana, Haversine (distancia de gran círculo), o consulta a API externa (Google Maps Distance Matrix).

### Opciones consideradas

| Opción | Precisión | Costo | Latencia |
|---|---|---|---|
| Euclidiana | Baja en distancias >5km | $0 | 0ms |
| Haversine | Alta para línea recta; subestima ruta real ~15-25% | $0 | 0ms |
| Google Maps API | Ruta real | ~$0.005/req | 100-300ms |

### Decisión

Haversine implementado en `PricingEngine.calculateDistanceKm()`. Razones:

1. **MVP**: La precisión de ruta real no justifica el costo de API ni la dependencia externa en esta fase
2. **Factor de compensación**: El `costPerKm` puede calibrarse al alza para absorber el error de subestimación
3. **Regla de negocio**: Se rechaza el viaje si origen y destino están a menos de **0.5 km** (evitar viajes triviales)

El cálculo final usa `snapshot.tax_pct` para aplicar el IVA al subtotal. Los factores (surge, etc.) se aplican en orden fijo: `fixed_amount` → `percentage` → `multiplier`.

### Consecuencias

- **Facilita:** Sin dependencia de Google Maps en creación de viaje; estimación instantánea; 100% testeable
- **Complica:** La tarifa estimada puede diferir de la tarifa final hasta un 25% en rutas con muchas curvas; el `recalculate()` al completar el viaje también usa Haversine
- **Criterio de revisión:** Si los reclamos por diferencia estimado/real superan el 10% de viajes, integrar Google Maps Directions API en el flujo de `COMPLETED`

---

## ADR-001 — Monolito Modular sobre Microservicios

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Arquitectura general

### Contexto
Necesitamos construir una plataforma multi-vertical con equipo de 5 personas. La arquitectura inicial debe permitir velocidad de desarrollo y entrega de MVP, pero sin hipotecar la capacidad de escalar después.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Microservicios desde el inicio | Alta escalabilidad, equipos independientes | Alta complejidad operacional, requiere DevOps senior, lento para MVP |
| Monolito modular | Rápido de desarrollar, fácil de debuggear, un solo deployment | Escala vertical principalmente, puede volverse difícil si se modulariza mal |
| Serverless (AWS Lambda) | Sin gestión de servidores, escala automático | Cold starts malos para WebSockets, difícil de testear localmente |

### Decisión
Monolito modular con separación clara de módulos internos. Los módulos se pueden extraer como microservicios cuando el volumen de negocio lo justifique, sin reescribir la lógica de negocio si la arquitectura interna es limpia.

### Consecuencias
- **Facilita:** Desarrollo rápido, debugging simple, un solo deploy para MVP
- **Complica:** Escalar componentes individualmente requiere extraerlos primero
- **Criterio de revisión:** Cuando un módulo específico (ej: tracking) necesite escalar independientemente del resto

---

## ADR-002 — Fastify sobre Express

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Framework backend

### Contexto
El endpoint `PATCH /drivers/me/location` se llama cada 3-5 segundos por cada conductor online. Con 200 conductores activos, son ~2,400 requests por minuto solo de ubicaciones. La latencia de este endpoint debe ser < 50ms.

### Opciones consideradas

| Opción | Throughput | Ecosystem | Curva de aprendizaje |
|---|---|---|---|
| Express | ~15k req/s | Muy maduro | Mínima |
| Fastify | ~45k req/s | Maduro | Baja |
| Hono | ~60k req/s | Joven | Media |
| Elysia (Bun) | ~100k req/s | Muy joven | Alta |

### Decisión
Fastify. La diferencia de rendimiento es significativa para el caso de uso de tracking, el ecosistema es maduro, y la curva de aprendizaje es baja para un equipo con experiencia en Express.

### Consecuencias
- **Facilita:** Alto throughput en tracking, serialización JSON nativa más rápida
- **Complica:** Algunos plugins de Express no son compatibles directamente
- **Criterio de revisión:** Si el equipo tiene problemas recurrentes con Fastify, evaluar migración

---

## ADR-003 — PostgreSQL + Redis + TimescaleDB

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Bases de datos

### Contexto
Necesitamos almacenar tres tipos de datos con características muy distintas:
1. Datos transaccionales con relaciones complejas (usuarios, viajes, pagos)
2. Estado efímero en tiempo real (posición del conductor, estado activo del viaje)
3. Series de tiempo de alta frecuencia (GPS cada 3-5 segundos por conductor)

### Opciones consideradas

**Para datos transaccionales:**
- PostgreSQL: relacional, ACID, maduro — ✓
- MongoDB: flexible, pero sin joins nativos ni transacciones fuertes — ✗
- MySQL: similar a PostgreSQL pero menos features — ✗

**Para tiempo real:**
- Redis: velocidad < 1ms, TTL automático, soporte en BullMQ — ✓
- Memcached: más simple pero sin estructuras de datos avanzadas — ✗
- Estado solo en memoria del proceso: se pierde al reiniciar — ✗

**Para GPS (series de tiempo):**
- TimescaleDB: extensión de PostgreSQL, un solo motor que ya conocemos — ✓
- InfluxDB: motor dedicado, más operacional para mantener — ✗
- Guardar en PostgreSQL normal: degradación grave a escala — ✗

### Decisión
Los tres juntos. TimescaleDB como extensión de PostgreSQL elimina la necesidad de operar un motor completamente distinto para las series de tiempo.

### Consecuencias
- **Facilita:** Cada tipo de dato en su herramienta óptima
- **Complica:** Tres sistemas que mantener, más complejidad en el setup local
- **Mitigación:** docker-compose levanta todo en un comando; Railway/Render ofrece los tres como servicios managed

---

## ADR-004 — React Native sobre Flutter

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Mobile

### Contexto
El equipo ya conoce React y JavaScript. Necesitamos una app móvil para iOS y Android.

### Opciones consideradas

| Opción | Performance | Mapas | Curva del equipo |
|---|---|---|---|
| React Native | Buena | Requiere SDK nativo | Mínima (mismo paradigma) |
| Flutter | Excelente | Plugin maduro | Alta (Dart) |
| Native (Swift/Kotlin) | Óptima | Nativa | Muy alta (dos codebases) |

### Decisión
React Native con Google Maps SDK nativo (no el wrapper JS). El wrapper JS de Google Maps en React Native tiene problemas de performance documentados — usar el SDK nativo resuelve ese problema sin sacrificar el beneficio de React Native.

### Consecuencias
- **Facilita:** El equipo web puede contribuir al código mobile, componentes compartibles con la web
- **Complica:** Performance en animaciones complejas es inferior a Flutter; el SDK nativo requiere configuración adicional
- **Criterio de revisión:** Si el performance en mapas es inaceptable en dispositivos de gama baja

---

## ADR-005 — BullMQ + Cron sobre Kafka

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Colas de mensajes

### Contexto
Necesitamos procesar jobs asíncronos (pagos, notificaciones, sincronización de GPS) y programar eventos futuros (viajes agendados, alertas de documentos).

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| BullMQ + cron | Sobre Redis (ya lo tenemos), UI incluida, fácil de debuggear | No es un event broker real, límites a muy alto volumen |
| Kafka | Event streaming a escala, replay completo, estándar de industria | Complejidad operacional alta, requiere ZooKeeper/KRaft |
| RabbitMQ | Más simple que Kafka, buen ecosystem | Otro servicio que operar, sin replay por default |
| AWS SQS | Managed, confiable | Vendor lock-in, latencia mayor, más costo |

### Decisión
BullMQ sobre Redis para jobs async, + cron job cada minuto para scheduler de viajes programados. El cron consulta PostgreSQL (fuente de verdad) y encola en BullMQ. Esto hace el scheduler resiliente a reinicios del servidor.

### Consecuencias
- **Facilita:** Un solo sistema adicional (Redis, ya requerido), UI de monitoring incluida
- **Complica:** No es un event broker con replay completo; a volumen alto puede tener limitaciones
- **Criterio de revisión:** Cuando los workers de BullMQ no puedan mantener el ritmo de producción de jobs, evaluar migración a Kafka con la misma interfaz de EventBus

---

## ADR-006 — Stripe como único procesador de pagos en MVP

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Pagos

### Contexto
México tiene métodos de pago locales importantes (OXXO Pay, SPEI, transferencias) y alta penetración de efectivo (~40% de transacciones). Sin embargo, integrar múltiples procesadores añade complejidad significativa al MVP.

### Opciones consideradas

| Opción | Cobertura | Complejidad | Tiempo |
|---|---|---|---|
| Solo Stripe | Tarjetas internacionales y nacionales | Baja | Bajo |
| Stripe + Conekta | + OXXO, SPEI | Media | Medio |
| Stripe + Conekta + Efectivo | Cobertura completa | Alta | Alto |
| MercadoPago | Multi-método, multi-país | Media | Medio |

### Decisión
Solo Stripe para el MVP. La decisión se toma con la premisa de que el segmento inicial de usuarios tiene tarjeta. La abstracción `PaymentService` permite agregar Conekta y efectivo en Fase 2 sin modificar la lógica de negocio.

### Consecuencias
- **Facilita:** MVP más rápido, menos puntos de fallo, una sola integración a mantener
- **Complica:** Excluye usuarios sin tarjeta en MVP — puede limitar la adopción en ciertos segmentos
- **Criterio de revisión:** Si la tasa de abandono en pago es alta, activar Conekta en Fase 2

---

## ADR-007 — OpenTelemetry sobre Datadog directo

**Fecha:** Inicio del proyecto
**Estado:** Aceptado
**Área:** Observabilidad

### Contexto
Necesitamos trazabilidad distribuida (traces) para diagnosticar problemas de latencia. La pregunta es si usar un vendor específico directamente o una capa de abstracción.

### Decisión
OpenTelemetry como capa de instrumentación, con Jaeger self-hosted para el MVP. Cuando el volumen justifique el costo, migrar a Datadog o New Relic apuntando el exporter de OpenTelemetry al nuevo destino — sin cambiar el código de la aplicación.

### Consecuencias
- **Facilita:** Portabilidad total, sin vendor lock-in en la instrumentación
- **Complica:** Jaeger self-hosted requiere mantenimiento; la UI es menos polida que Datadog
- **Criterio de revisión:** Cuando el tiempo de diagnóstico de incidentes sea inaceptable o el equipo crezca

---

## ADR-008 — SELECT FOR UPDATE en transiciones de estado

**Fecha:** Diseño de la máquina de estados
**Estado:** Aceptado
**Área:** Concurrencia

### Contexto
El sistema puede recibir múltiples conductores aceptando el mismo viaje simultáneamente. Sin protección, dos conductores podrían ser asignados al mismo viaje.

### Opciones consideradas

| Opción | Garantía | Complejidad |
|---|---|---|
| SELECT FOR UPDATE en PostgreSQL | ACID — garantía total | Baja — una línea de código |
| Lock en Redis | Eventual — puede fallar si Redis cae | Media — requiere TTL y manejo de fallos |
| Validación en aplicación sin lock | Sin garantía real — race condition posible | Baja — pero incorrecta |

### Decisión
`SELECT FOR UPDATE` dentro de la transacción PostgreSQL. Es la solución correcta para este problema — concurrencia en datos relacionales con requisitos ACID.

### Consecuencias
- **Facilita:** Garantía total de que un viaje solo puede ser aceptado por un conductor
- **Complica:** Las transacciones largas bloquean filas — mantener las transacciones cortas y los efectos secundarios fuera de ellas
- **Regla derivada:** Los efectos secundarios (BullMQ jobs) se encolan dentro de la transacción pero se ejecutan fuera de ella

---

## ADR-009 — pricing_snapshot inmutable en trips

**Fecha:** Diseño del schema
**Estado:** Aceptado
**Área:** Datos

### Contexto
Los factores de precio son dinámicos y cambian con frecuencia. Si un admin modifica un factor, ¿cómo afecta a los viajes ya completados en el historial?

### Decisión
Al completarse un viaje, el desglose completo del precio (con todos los factores que se aplicaron y su valor en ese momento) se guarda en `pricing_snapshot JSONB`. Este campo nunca se modifica. Los cambios en `pricing_factors` solo afectan viajes futuros.

### Consecuencias
- **Facilita:** El historial de un viaje siempre muestra exactamente cuánto se cobró y por qué
- **Complica:** Los reportes financieros deben leer el snapshot, no recalcular
- **Regla derivada:** El campo `pricing_snapshot` es de solo escritura después del primer insert. Cualquier query que lo actualice es un bug.

---

## ADR-010 — Scheduler con cron + PostgreSQL

**Fecha:** Diseño del scheduler
**Estado:** Aceptado
**Área:** Viajes programados

### Contexto
Los viajes programados necesitan notificaciones en 3 momentos: 24h, 1h, y 15 min antes. ¿Cómo garantizar que estas notificaciones lleguen aunque el servidor se reinicie?

### Opciones consideradas

| Opción | Resiliencia ante reinicios | Complejidad |
|---|---|---|
| BullMQ delayed jobs | Los jobs en memoria se pueden perder | Baja |
| PostgreSQL + cron cada 1 min | Los registros persisten en BD | Media |
| Cron externo (AWS EventBridge) | Alta resiliencia | Alta, vendor lock-in |

### Decisión
PostgreSQL como fuente de verdad (tabla `scheduled_trips` con flags `*_sent`) + cron job cada minuto que consulta registros pendientes y encola en BullMQ. Si el cron falla, al recuperarse encuentra los registros con `sent = false` y los procesa.

### Consecuencias
- **Facilita:** Resiliencia total ante reinicios, debugging simple (consultar la tabla)
- **Complica:** Un minuto de granularidad — los recordatorios no son al segundo exacto
- **Criterio de revisión:** Si se requiere precisión de segundos, usar un scheduler dedicado

---

## ADR-011 — pnpm como gestor de paquetes del monorepo

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Infraestructura / Monorepo

### Contexto
Turborepo es compatible con npm, yarn y pnpm. La elección afecta la velocidad de instalación, el tamaño de `node_modules` y el funcionamiento de workspace links entre apps del monorepo.

### Opciones consideradas

| Opción | Pros | Contras |
|--------|------|---------|
| npm workspaces | Sin configuración extra, estándar | Lento, `node_modules` gigante, hoisting impredecible |
| yarn workspaces | Maduro | Dos versiones (classic/berry) con comportamientos distintos |
| **pnpm workspaces** | 2-3× más rápido, store compartido, symlinks estrictos | Algunos paquetes necesitan `public-hoist-pattern` |

### Decisión
pnpm. El store compartido ahorra ~60% de espacio en disco. Los symlinks estrictos detectan dependencias implícitas que npm/yarn ocultan silenciosamente.

### Consecuencias
- **Facilita:** Instalaciones rápidas en CI, menos espacio en disco, detección de deps implícitas
- **Complica:** Algunos paquetes mal escritos necesitan `shamefully-hoist` o `public-hoist-pattern` en `.npmrc`
- **Criterio de revisión:** Si más de 3 paquetes requieren hacks de hoisting, reevaluar

---

## ADR-012 — Zod para validación de variables de entorno al arranque

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Backend / Configuración

### Contexto
La API requiere ~15 variables de entorno. Acceder a `process.env.X` directamente produce errores runtime crípticos cuando una variable falta o tiene formato incorrecto (ej: `Cannot read properties of undefined`).

### Opciones consideradas

| Opción | Pros | Contras |
|--------|------|---------|
| `process.env.X` directo | Sin overhead | Errores crípticos, sin tipado, typos silenciosos |
| dotenv-safe | Valida que existan variables | No valida tipos ni formatos |
| **Zod en environment.ts** | Tipado, validación de formato, fail-fast con mensaje claro | Requiere mantener el schema actualizado |

### Decisión
Módulo `src/config/environment.ts` que valida todas las variables con Zod al arrancar. Si alguna falta o es inválida, el proceso termina con mensaje descriptivo. Ningún módulo accede a `process.env.X` directamente.

### Consecuencias
- **Facilita:** Debugging de configuración, documentación viva de variables, tipado completo
- **Complica:** Agregar variable nueva requiere actualizar el schema (beneficio disfrazado de costo)
- **Criterio de revisión:** Nunca — esta práctica solo mejora con el tiempo

---

## ADR-013 — Testcontainers sobre mocks de base de datos

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Testing

### Contexto
Los tests de integración necesitan una base de datos. La alternativa más común es mockear Knex/Redis con librerías de mock. La plataforma tiene lógica crítica de concurrencia (SELECT FOR UPDATE) y transacciones que los mocks no replican fielmente.

### Opciones consideradas

| Opción | Pros | Contras |
|--------|------|---------|
| Mocks (jest.mock, ioredis-mock) | Rápidos, sin Docker | Divergen del comportamiento real; no replican transacciones ni FOR UPDATE |
| BD compartida en CI | Sin overhead de contenedores | Tests no aislados, condiciones de carrera entre suites |
| **Testcontainers** | BD real, tests aislados, misma imagen que producción | ~15-30s de setup, requiere Docker |

### Decisión
Testcontainers. Los mocks producen tests que pasan pero fallan en producción — exactamente el escenario que los tests deben prevenir. El costo en tiempo es aceptable dado el nivel de confianza que provee.

### Consecuencias
- **Facilita:** Confianza real en los tests, cero divergencia mock/prod, prueba de transacciones reales
- **Complica:** Docker requerido en local y CI; tests de integración son más lentos
- **Criterio de revisión:** Si el pipeline CI supera 10 minutos, evaluar paralelización de suites

---

## ADR-014 — Documentación SDD/TDD por sprint en spec/sprint{N}/

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Proceso de desarrollo / Agentes

### Contexto
Durante la Fase 1 (Planeación), el equipo de agentes produce un plan de sprint. Sin un formato estándar y persistente, este plan vive solo en el contexto de la conversación y se pierde entre sesiones. Los agentes de ejecución (backend, devops, qa) necesitan un contrato claro y estable al que referirse durante la implementación.

### Opciones consideradas

| Opción | Pros | Contras |
|--------|------|---------|
| Plan solo en el chat | Sin overhead de archivos | Se pierde entre sesiones, no consultable por agentes |
| Un solo `docs/sprint-{N}-plan.md` | Simple | Mezcla requirements, diseño y tareas — difícil de navegar |
| **`spec/sprint{N}/` con 3 documentos** | Separación de concerns, navegable, consultable por agentes | Más archivos que mantener |

### Decisión
Al aprobar el plan de cada sprint, el agente planner genera tres documentos en `spec/sprint{N}/`:
- `requirements.md` — requerimientos funcionales y no funcionales, actores, constraints, decisiones pendientes
- `design.md` — diseño técnico de componentes, ADRs aplicables, contratos de API, estructuras de datos
- `tasks.md` — tareas atómicas con checklist SDD/TDD completo, grafo de dependencias, Definition of Done

Este conjunto de documentos es el **contrato de referencia** para los agentes de ejecución durante los Sprints 2-7.

### Consecuencias
- **Facilita:** Agentes de ejecución tienen contexto completo sin depender del historial del chat; QA puede verificar criterios de aceptación definidos antes de que empiece la implementación; onboarding de nuevos agentes es inmediato
- **Complica:** El agente planner debe escribir tres documentos en lugar de uno; si el plan cambia, los tres documentos deben actualizarse
- **Criterio de revisión:** Si los documentos de spec se vuelven obsoletos frecuentemente (>50% de sprints), consolidar en un solo archivo

---

## ADR-015 — Autenticación OTP-only (sin passwords)

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Auth / Seguridad

### Contexto
El primer vertical es una app de taxi en México. Los usuarios son pasajeros y conductores que se identifican por número de teléfono. Implementar passwords agrega fricción innecesaria y superficie de ataque adicional.

### Opciones consideradas

| Opción | UX | Seguridad | Complejidad |
|--------|-----|-----------|-------------|
| Password + teléfono | Familiar | Riesgo de passwords débiles, breach exposure | Media |
| **OTP-only vía teléfono** | Mínima fricción | Teléfono es el factor de identidad | Baja |
| OAuth (Google/Apple) | Cómodo | Delega seguridad al provider | Media-alta |

### Decisión
OTP-only para MVP. El número de teléfono es la identidad del usuario. Flujo: `register` → OTP → `verify-phone` → tokens. Para sesiones subsecuentes: `login` → OTP → `verify-phone`. Sin passwords en la base de datos.

### Consecuencias
- **Facilita:** Sin gestión de passwords, sin riesgo de breach de credenciales, UX fluida para taxi
- **Complica:** Dependencia del canal de entrega de OTP; si el teléfono cambia, el usuario pierde acceso
- **Criterio de revisión:** Si los usuarios piden login alternativo en Fase 2 (OAuth Google/Apple)

---

## ADR-016 — Revocación de refresh tokens: híbrido PostgreSQL + Redis

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Auth / Seguridad

### Contexto
Los JWT son stateless. Para invalidar un refresh token antes de que expire (logout, rotación, seguridad), se necesita estado externo. Redis es volátil — si se reinicia, se pierde la blacklist y tokens revocados vuelven a ser válidos.

### Opciones consideradas

| Opción | Durabilidad | Latencia | Riesgo |
|--------|-------------|----------|--------|
| Solo Redis blacklist | ❌ Volátil | Mínima | Token revocado válido tras restart |
| Solo PostgreSQL | ✅ Durable | +1 query por refresh | Ninguno |
| **Híbrido: PostgreSQL (fuente de verdad) + Redis (cache)** | ✅ Durable | Redis hit = mínima / miss = +1 query | Mínimo |

### Decisión
PostgreSQL (`user_auth.refresh_token_jti`) es la fuente de verdad. Redis (`blacklist:token:{jti}`) es un cache de revocación con TTL residual. Si Redis falla, el sistema cae a PostgreSQL sin pérdida de seguridad. En validación: Redis primero (fast path), PostgreSQL como fallback obligatorio si Redis miss.

### Consecuencias
- **Facilita:** Seguridad durable, performance en el caso común (Redis hit), sin vendor lock-in de Redis para seguridad crítica
- **Complica:** Lógica de validación en dos pasos; `user_auth` requiere columnas `refresh_token_jti`, `refresh_token_exp`, `revoked_at`
- **Criterio de revisión:** Si el volumen de tokens activos supera 100k, evaluar Redis Cluster con AOF persistence

---

## ADR-017 — Stripe SetupIntent en Sprint 2, PaymentIntent en Sprint 5

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Pagos

### Contexto
Los usuarios necesitan guardar su método de pago antes de solicitar viajes, pero el cobro real ocurre al completar el viaje (Sprint 5). Mezclar el almacenamiento y el cobro en el mismo sprint aumenta el riesgo y la complejidad.

### Decisión
Sprint 2 solo implementa Stripe SetupIntent (guardar el método de pago). Sprint 5 implementa PaymentIntent (cobrar). El frontend completa el SetupIntent con Stripe.js; el backend solo almacena el `pm_xxxxx` resultante.

### Consecuencias
- **Facilita:** Sprint 2 más pequeño y enfocado; el riesgo de bugs de cobro se aísla en Sprint 5
- **Complica:** El usuario puede guardar una tarjeta pero no puede pagar hasta Sprint 5 — solo afecta el orden de desarrollo
- **Criterio de revisión:** No aplica — decisión de secuenciación del roadmap

---

## ADR-018 — OTPChannelService como interfaz abstracta (sin Twilio en MVP)

**Fecha:** 2026-04-05
**Estado:** Aceptado
**Área:** Auth / Integraciones externas

### Contexto
Twilio SMS cuesta ~$0.05-0.08 USD/mensaje en México. Con 1,000 usuarios/día haciendo login una vez al día, serían ~$1,500-2,400 USD/mes solo en OTPs. Inaceptable para MVP. Además, el proveedor puede cambiar sin afectar la lógica de negocio si la interfaz está bien abstraída.

### Opciones consideradas

| Opción | Costo MVP | Pros | Contras |
|--------|-----------|------|---------|
| Twilio SMS (plan original) | ~$1,500-2,400/mes | Confiable | Caro a escala |
| Firebase Phone Auth | Gratis hasta 10k/mes | Sin costo en early stage | Dependencia de Google |
| WhatsApp Business API | ~$0.005-0.01/conv | 95%+ adopción en MX | Aprobación de Meta |
| **Interfaz abstracta + proveedor swappable** | Depende del proveedor | Sin lock-in | Más código inicial |

### Decisión
`OTPChannel` como interfaz TypeScript. `LogOTPChannel` para dev/test (OTP en logs, gratis). `FirebaseOTPChannel` para producción (gratis hasta 10k verificaciones/mes). El proveedor se configura vía `OTP_PROVIDER` en variables de entorno. Sin Twilio en MVP.

### Consecuencias
- **Facilita:** Cambio de proveedor sin modificar `AuthService`; costo $0 en early stage; tests sin llamadas externas
- **Complica:** Requiere mantener `FirebaseOTPChannel` y credenciales de Firebase
- **Criterio de revisión:** Cuando Firebase supere 10k/mes → migrar a WhatsApp Business API creando `WhatsAppOTPChannel`

---

## ADR-019 — URLs de documentos: cliente provee URL (sin S3 en Sprint 3)

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Backend / Sprint 3

### Contexto
El módulo de conductores requiere que los conductores suban documentos (licencia, seguro, etc.). Se necesita decidir cómo manejar el almacenamiento de archivos en el MVP.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Integración S3/GCS directa | Almacenamiento propio y controlado | Agrega dependencia externa, requiere IAM, costos |
| Presigned upload URLs en Sprint 3 | Control sin procesar el archivo | Complejidad extra, delay para MVP |
| **Cliente provee URL** | Sin dependencia de almacenamiento, iteración rápida | El cliente debe manejar upload previamente |

### Decisión
En Sprint 3, `POST /drivers/me/documents` acepta un campo `fileUrl` (URL string) que el cliente ya debe haber subido a algún almacenamiento. La API valida que sea una URL válida pero no procesa ni almacena el archivo directamente. La integración con S3/GCS se añade en Sprint 6 (Admin panel).

### Consecuencias
- **Facilita:** MVP más rápido, sin costos de almacenamiento en Sprint 3
- **Complica:** La validación del archivo (tamaño, tipo) queda en el cliente hasta Sprint 6
- **Criterio de revisión:** Sprint 6 — implementar presigned URLs y mover storage a S3

---

## ADR-020 — Registro de conductor como flujo separado al de pasajero

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Producto / Backend

### Contexto
Un usuario puede usar la plataforma primero como pasajero y luego decidir convertirse en conductor. Si el registro de conductor está integrado en el registro de usuario, no hay forma de hacer esta transición sin re-registro.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Integrado en POST /auth/register (un solo paso) | Un solo paso | No permite transición pasajero→conductor |
| **POST /drivers/register separado** | Permite que cualquier usuario sea conductor, flujos independientes | Dos endpoints en lugar de uno |
| Automático al primer viaje como conductor | Sin fricción | No permite onboarding de documentos previo |

### Decisión
`POST /drivers/register` es un endpoint separado que puede ser llamado por cualquier usuario autenticado. Crea el perfil de conductor y agrega el rol `driver` en `user_roles`. Es idempotente en la asignación de roles.

### Consecuencias
- **Facilita:** Un pasajero puede convertirse en conductor sin volver a registrarse
- **Facilita:** El onboarding de documentos puede ocurrir antes del primer viaje
- **Complica:** El cliente mobile necesita manejar dos flujos distintos (pasajero y conductor)
- **Criterio de revisión:** Si el negocio decide que conductor y pasajero son siempre usuarios distintos

---

## ADR-021 — service_modes en drivers y service_mode en trip_types (multi-vertical)

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Arquitectura de dominio

### Contexto
La plataforma es una base reutilizable para múltiples verticales: taxi (personas), paquetería (cargo), servicios mixtos. Sin una abstracción de "modo de servicio", el schema asume implícitamente que siempre hay un pasajero humano, lo que rompe para verticales de carga.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| `service_mode` enum en drivers (un modo) | Simple | Un conductor no puede operar en múltiples modos |
| Tabla junction `driver_service_modes` | Máxima flexibilidad y queryable | Over-engineering para MVP |
| **`service_modes TEXT[]` en drivers + `service_mode` en trip_types** | Flexible, un driver puede ofrecer varios modos, queryable con ANY() | Arrays PG menos ergonómicos que tabla junction |

### Decisión
- `drivers.service_modes TEXT[] DEFAULT '{people}'` — los modos que el conductor puede operar
- `trip_types.service_mode VARCHAR(20) DEFAULT 'people'` — el modo de servicio del tipo de viaje
- Valores válidos: `people` | `cargo` | `mixed`
- En Sprint 4, el matching solo asigna conductores cuyo `service_modes` contiene el `service_mode` del `trip_type`

### Consecuencias
- **Facilita:** Sprint 4 puede tener `requester_id` nullable para viajes de cargo sin romper schema
- **Facilita:** Los requisitos de documentos pueden filtrarse por modo de servicio
- **Complica:** El seed de trip_types necesita actualizarse con `service_mode = 'people'`
- **Criterio de revisión:** Si > 3 verticales activos → considerar tabla junction `driver_service_modes`

---

## ADR-022 — Entorno de desarrollo: Docker solo para infraestructura, apps nativas

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Infraestructura / Developer Experience

### Contexto
El monorepo tiene tres apps (`api`, `web`, `mobile`) y seis servicios de infraestructura (PostgreSQL, Redis, Grafana, Prometheus, Jaeger, Bull Board). Se debe decidir qué corre en Docker y qué corre nativo durante el desarrollo local.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Todo en Docker (infra + apps) | Un solo `docker compose up` | React Native Metro **no puede dockerizarse** — necesita conectarse físicamente al teléfono por WiFi/USB; hot-reload degradado |
| Todo nativo (sin Docker) | Hot-reload máximo | Developer debe instalar y gestionar PostgreSQL + Redis + extras localmente |
| **Docker solo para infra, apps nativas** | Infra lista en segundos, hot-reload total, Metro funciona, un solo `pnpm dev` arranca todo | Docker requerido como prerequisito |

### Decisión
- **Docker:** `postgres`, `redis`, `grafana`, `prometheus`, `jaeger`, `bull-board` — `docker compose up -d`
- **Nativo:** `api` (tsx watch), `web` (Next.js HMR), `mobile` (Metro bundler) — `pnpm dev` desde la raíz

Un solo comando `pnpm dev` en la raíz usa Turborepo para correr las tres apps en paralelo con hot-reload completo. Los cambios de código reflejan al instante sin rebuild.

**Puertos en uso:**

| Servicio | Puerto | Tipo |
|---|---|---|
| API (Fastify) | 3333 | App nativa |
| Web (Next.js) | 3002 | App nativa |
| Mobile (Metro) | 8081 | App nativa |
| PostgreSQL | 5432 | Docker |
| Redis | 6379 | Docker |
| Grafana | 3000 | Docker |
| Bull Board | 3001 | Docker |
| Prometheus | 9090 | Docker |
| Jaeger | 16686 | Docker |

> **Nota para LLMs:** Web corre en 3002 (no 3000) para evitar conflicto con Grafana. El teléfono físico debe usar la IP LAN del host (no `localhost`) para conectarse a la API y a Metro.

### Consecuencias
- **Facilita:** Developer experience óptimo — hot-reload, Metro conecta al teléfono, cambios visibles al instante
- **Facilita:** Aislamiento total — los contenedores de infra no se reinician al cambiar código de la app
- **Complica:** Docker es prerequisito del setup local (ya era necesario para Testcontainers)
- **Implica:** Para producción se añadirán Dockerfiles para `api` y `web` en Sprint 7; mobile no aplica
- **Criterio de revisión:** Si se añade un servicio de workers (BullMQ) que también necesite hot-reload, añadirlo como app nativa al `pnpm dev`

---

## ADR-023 — Haversine inline para distancia estimada y radio de búsqueda de conductores

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Backend / Pricing

### Contexto
El PricingEngine necesita calcular la distancia entre dos coordenadas para estimar la tarifa antes de crear el viaje. Adicionalmente, el módulo de matching necesita un radio de búsqueda inicial para encontrar conductores disponibles.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Google Maps Distance Matrix API | Distancia de conducción real, tráfico en tiempo real | Costo por request, latencia de red, dependencia externa |
| Librería de geodesia (geolib, turf.js) | Más precisa para polígonos complejos | Dependencia adicional para un solo cálculo |
| Haversine inline | Sin dependencias, sin latencia, sin costo, suficiente para estimación | Distancia en línea recta (no driving distance) — margen de error ~20-30% |

### Decisión
Haversine inline implementado directamente en `PricingEngine` (sin librerías externas). Radio inicial de búsqueda: **5 km** configurable por región.

El estimado es de buena fe — el precio final se calcula al `COMPLETED` con `actual_distance_km` real. La diferencia haversine vs driving distance es aceptable para el MVP.

**Nota en spec:** Siempre especificar "distancia en línea recta" al documentar valores de prueba. CDMX → AICM = ~5.7 km (línea recta) ≠ ~14 km (driving distance).

### Consecuencias
- **Facilita:** Zero dependencias externas, zero latencia, zero costo en estimados
- **Facilita:** 100% testeable sin mocks ni API keys
- **Complica:** El estimado puede diferir ~20-30% del precio final en rutas con curvas o tráfico
- **Criterio de revisión:** Si los usuarios reportan estimados muy alejados del precio final, integrar Google Maps Distance Matrix en Sprint 5+

---

## ADR-024 — Socket.io con namespaces /passenger y /driver para comunicación real-time

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Backend / Real-time

### Contexto
El ciclo de vida del viaje requiere comunicación bidireccional en tiempo real entre pasajero y conductor: notificaciones de estado, actualizaciones de ubicación y cambios de destino.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Polling HTTP | Simple, sin infra adicional | Alta latencia, muchos requests innecesarios |
| Server-Sent Events (SSE) | Nativo HTTP, simple | Unidireccional (servidor → cliente únicamente) |
| Socket.io 4 | Bidireccional, namespaces, rooms, fallback automático | Mantener conexiones persistentes |
| WebSocket nativo | Más ligero que Socket.io | Sin rooms ni namespaces nativos, más código |

### Decisión
Socket.io 4 con dos namespaces separados por rol:
- `/passenger` — recibe actualizaciones de estado y ubicación del conductor
- `/driver` — recibe solicitudes de viaje y cambios del pasajero; envía `location:update`

**Auth:** JWT en el handshake (`socket.handshake.auth.token`), validado con `JWTService.verify()`.
**Room naming:** `trip:{trip_id}` — pasajero y conductor del mismo viaje en el mismo room.
**Singleton:** `getIO()` exportado desde `realtime.plugin.ts` para acceso desde `trips.service.ts`.

### Consecuencias
- **Facilita:** Comunicación bidireccional con rooms listos para usar, auth integrado
- **Facilita:** `socket.io-client` disponible para tests en memoria sin levantar infraestructura
- **Complica:** `fastify-plugin` no instalado — se usa patrón `getIO()` singleton en lugar de `app.io` decorator
- **Criterio de revisión:** Si se necesita escalar horizontalmente, añadir Redis adapter (`@socket.io/redis-adapter`) para sincronizar rooms entre instancias

---

## ADR-025 — TripStateMachine como clase pura — SELECT FOR UPDATE en el service caller

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Backend / Domain

### Contexto
Las transiciones de estado de un viaje deben ser atómicas y protegidas contra condiciones de carrera (dos conductores aceptando el mismo viaje simultáneamente). La pregunta es dónde aplicar el `SELECT FOR UPDATE`.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Lock dentro de TripStateMachine | Encapsulación total | La clase necesita acceso a Knex, pierde pureza, difícil de testear sin BD |
| Lock en trips.service.ts (caller) | StateMachine es clase pura, 100% testeable con mocks | El caller debe recordar aplicar el lock antes de llamar transition() |
| Lock en trips.repository.ts | Separación de concerns | Duplica lógica, el repo no sabe de estados |

### Decisión
**Lock en `trips.service.ts`** — el caller aplica `SELECT FOR UPDATE` antes de invocar `TripStateMachine.transition()`.

`TripStateMachine` es una clase pura (sin dependencias de BD) que solo valida transiciones, calcula fees y escribe en `trip_status_history` dentro de la transacción que recibe como parámetro.

```typescript
// Patrón correcto en trips.service.ts:
return await db.transaction(async (trx) => {
  const trip = await trx('trips').where({ id }).forUpdate().first(); // ← lock aquí
  const result = await stateMachine.transition({ trip, toStatus, actor, actorId, trx });
  await trx('trips').where({ id }).update({ status: result.newStatus, updated_at: new Date() });
  return result;
});
```

### Consecuencias
- **Facilita:** TripStateMachine con 100% coverage sin Testcontainers (mocks de trx)
- **Facilita:** Lógica de negocio completamente separada de infraestructura
- **Implica:** El spec de cualquier módulo que use TripStateMachine debe especificar "el lock lo aplica el caller"
- **Criterio de revisión:** Si el patrón produce bugs por callers que olvidan el lock, encapsular dentro de un método de repositorio transaccional

---

## ADR-026 — Política de cancelación MVP — cargo fijo $50 MXN

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Área:** Producto / Backend

### Contexto
Necesitamos una política de cancelación para el MVP que proteja al conductor de cancelaciones tardías del pasajero, sin complejidad de cálculos dinámicos.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Sin cargo siempre | Máxima simplicidad | Incentiva cancelaciones abusivas |
| Cargo proporcional al tiempo de espera | Más justo | Complejo de calcular y comunicar |
| Cargo fijo después de N segundos | Simple, predecible, fácil de comunicar | No considera distancia recorrida por el conductor |
| Cargo configurable por región | Máxima flexibilidad | Complejidad de configuración innecesaria para MVP |

### Decisión
**Cargo fijo de $50 MXN** si el pasajero cancela **≥ 120 segundos** después de que el viaje fue `ACCEPTED`.

```
passenger cancela ACCEPTED o DRIVER_EN_ROUTE:
  < 120s desde accepted_at  → cancellation_fee = $0
  ≥ 120s desde accepted_at  → cancellation_fee = $50 MXN

driver cancela (cualquier estado pre-viaje) → cancellation_fee = $0
sistema cancela (timeout SEARCHING)         → cancellation_fee = $0
```

Implementado en `TripStateMachine.getCancellationFee()`. El valor $50 MXN está hardcodeado para MVP — configurable por región en Sprint 6.

### Consecuencias
- **Facilita:** Implementación simple, testeable, comunicable al pasajero claramente
- **Complica:** No cubre el caso de conductor que ya recorrió mucha distancia antes de que el pasajero cancele
- **Criterio de revisión:** Sprint 6 — mover a `commission_rules` configurable por región; considerar cargo proporcional a distancia recorrida

---

## ADR-027 — Circuit breaker: opossum para servicios externos

**Fecha:** 2026-04-07
**Estado:** Aceptado
**Área:** Resiliencia / Backend

### Contexto
PaymentService y NotificationService llaman a Stripe y FCM respectivamente. Sin circuit breaker, un fallo en Stripe puede acumular workers bloqueados durante 10s cada uno, agotando el pool de conexiones de BullMQ.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| `opossum` | Mantenido por Red Hat, battle-tested en Node.js, métricas integradas | Dependencia externa |
| Implementación manual | Sin dependencia externa | Tiempo de desarrollo, bugs potenciales |
| Sin circuit breaker | Sin overhead | Cascada de fallos en Stripe/FCM downtime |

### Decisión
`opossum` — estándar de facto para circuit breakers en Node.js. Parámetros por servicio definidos en `steering/architecture.md`:

```
Stripe: timeout 10s, errorThresholdPercentage 30%, resetTimeout 120s
FCM:    timeout 5s,  errorThresholdPercentage 50%, resetTimeout 30s
```

### Consecuencias
- **Facilita:** Detección rápida de fallos externos, métrica `circuit_breaker.opened` en Prometheus
- **Complica:** Configuración inicial por servicio externo
- **Criterio de revisión:** Migrar a Resilience4j si se pasa a microservicios

---

## ADR-028 — INotificationChannel abstracta: Log (dev) + FCM (prod), sin SMS

**Fecha:** 2026-04-07
**Estado:** Aceptado
**Área:** Notificaciones

### Contexto
Necesitamos push notifications para eventos del viaje y pagos. En dev/test no queremos depender de Firebase. Twilio (SMS) fue evaluado pero descartado para Sprint 5 — no es crítico para MVP y añade complejidad operacional sin valor inmediato.

### Decisión
`INotificationChannel` abstracta con dos implementaciones controladas por `NOTIFICATION_PROVIDER`:
- `log` → `LogNotificationChannel` — imprime en consola (dev/test, sin credenciales externas)
- `fcm` → `FCMNotificationChannel` — Firebase Admin SDK (producción)

Sin fallback SMS en Sprint 5. Si un push falla, BullMQ reintenta hasta 3 veces. Si todos fallan, el error queda en logs.

Mismo patrón que ADR-018 (OTPChannelService) — reutiliza convención ya conocida del equipo.

### Consecuencias
- **Facilita:** Desarrollo sin credenciales Firebase, mismo patrón ya conocido (ADR-018)
- **Complica:** Sin notificación garantizada si FCM cae (sin SMS fallback)
- **Criterio de revisión:** Agregar Twilio SMS en Sprint 6+ si el negocio requiere notificación crítica garantizada

---

## ADR-029 — Scheduler: node-cron en proceso principal (MVP monolito)

**Fecha:** 2026-04-07
**Estado:** Aceptado
**Área:** Backend / Infraestructura

### Contexto
Sprint 6 requiere activar viajes programados automáticamente cuando llega su `scheduled_for` y enviar recordatorios (24h, 1h, 15m). Necesitamos un mecanismo de ejecución periódica. Las opciones principales: BullMQ repeatable jobs, node-cron en proceso principal, o un proceso worker separado.

### Opciones consideradas
| Opción | Pros | Contras |
|---|---|---|
| BullMQ repeatable jobs | Ya instalado, Redis-backed, sobrevive reinicios | Complejo para lógica de "buscar viajes pendientes"; no es un cron sino un job repetido |
| node-cron en proceso principal | Simple, sin dependencias extra, ADR-010 lo definía así | Si el proceso cae, el cron también; no distribuido |
| Proceso worker separado | Aislado, escalable | Over-engineering para MVP monolito |

### Decisión
`node-cron` corriendo en el mismo proceso del API (ADR-001: monolito modular). `SchedulerService.start()` se llama en `app.ts` al arrancar. El cron ejecuta cada minuto: activa viajes due y envía recordatorios pendientes usando `SELECT FOR UPDATE SKIP LOCKED` para idempotencia.

### Consecuencias
- **Facilita:** Setup simple, sin infraestructura adicional, código legible y testeable
- **Complica:** Si el proceso cae entre minutos, los viajes se activan en el siguiente tick (máx 1 min de retraso); no escala horizontalmente sin duplicar activaciones (mitigado con SKIP LOCKED)
- **Criterio de revisión:** Extraer a worker separado cuando el volumen de viajes programados supere 1000/día o se necesite escalar el API horizontalmente

---

## ADR-030 — Admin panel: Vite 5 + React 19 reemplaza Next.js 14

**Fecha:** 2026-04-07
**Estado:** Aceptado
**Área:** Frontend / Admin

### Contexto
El admin panel (`apps/web/`) era un placeholder de Next.js 14 con un solo archivo. Al implementarlo en Sprint 6, evaluamos si mantener Next.js o cambiar a algo más apropiado para un panel admin interno.

### Opciones consideradas
| Opción | Pros | Contras |
|---|---|---|
| Next.js 14 (App Router) | Ya en el stack, SSR, file-based routing | SSR innecesario para panel admin interno sin SEO; App Router añade complejidad |
| Vite 5 + React 19 SPA | Más ligero, HMR instantáneo, ideal para SPA auth-gated | Sin SSR (no necesario aquí); requiere migración |
| Remix | SSR + forms nativo | Over-engineering; curva de aprendizaje |

### Decisión
Migrar `apps/web/` a Vite 5 + React 19 + TanStack Router v1 + TanStack Query v5 + Tailwind CSS. El costo de migración fue cero (un archivo placeholder). Next.js sigue listado en el stack general para futuros frontends públicos si aplica.

Turborepo sin cambios — los scripts `dev`/`build`/`type-check` son genéricos y funcionan con Vite sin tocar `turbo.json`.

Auth: JWT almacenado en memoria (variable de módulo), no en localStorage ni cookie — adecuado para panel admin de uso interno.

### Consecuencias
- **Facilita:** DX más rápido (Vite HMR), bundle más pequeño, configuración más simple
- **Complica:** Sin SSR (irrelevante para admin panel); el JWT en memoria se pierde al refrescar la página (el usuario debe re-autenticarse)
- **Criterio de revisión:** Si se necesita un frontend público (landing, pasajero web), usar Next.js en un nuevo workspace — no en `apps/web/`

---

## ADR-033 — Mapbox en lugar de Google Maps para la app mobile

**Fecha:** 2026-04-21
**Estado:** Aceptado
**Área:** Mobile / Maps

### Contexto
La app necesita mapas interactivos, búsqueda de direcciones (geocoding) y trazado de rutas. Google Maps es el estándar de facto pero su modelo de precios es prohibitivo para un MVP: $7/1,000 map loads + $17/1,000 Places requests + $5-10/1,000 Directions requests.

### Opciones consideradas

| Opción | Free tier | Precio a escala | SDK RN | Madurez |
|---|---|---|---|---|
| Google Maps | 28k loads/mes combinado | $7+/1,000 loads | `react-native-maps` | Alta |
| **Mapbox** | 50k loads + 100k geocoding/mes | $0.50/1,000 loads | `@rnmapbox/maps` | Alta |
| HERE Maps | 250k req/mes | ~$1/1,000 | Limitado | Media |
| OpenStreetMap + WebView | Ilimitado | $0 | N/A (WebView) | Baja (performance) |

### Decisión
Usar Mapbox con `@rnmapbox/maps`. Migrar todas las pantallas que usan `react-native-maps` + `PROVIDER_GOOGLE`. Las coordenadas (lat/lng WGS84) son idénticas entre proveedores — solo cambian los componentes visuales.

Costo proyectado: $0/mes hasta ~50,000 viajes/mes; ~$50/mes a 200,000 viajes/mes vs ~$6,800/mes con Google al mismo volumen. Ver `docs/14_service_costs.md` para el desglose completo.

### Consecuencias
- **Facilita:** Costos controlables; SDK bien mantenido; geocoding y directions en el mismo token
- **Complica:** Rebuild APK obligatorio al cambiar SDK nativo; los E2E tests con MapboxGL.MapView siguen sin poder usar testID en la vista nativa (mismo problema que con Google Maps)
- **Criterio de revisión:** Si Mapbox sube precios, MapTiler es un drop-in replacement (mismo protocolo de vector tiles y compatible con el mismo SDK)

---

## ADR-031 — roles en verify-phone response en lugar de JWT decode en mobile

**Fecha:** 2026-04-21
**Estado:** Aceptado
**Área:** Mobile / Auth

### Contexto
`LoginScreen.tsx` necesitaba saber el rol del usuario (passenger/driver) post-login para navegar al stack correcto. El enfoque original era decodificar el JWT access token en el cliente para leer el campo `roles`. Hermes JS engine (React Native) no tiene `atob` ni `Buffer.from` con base64 confiable, lo que hace imposible decodificar JWT en mobile sin dependencias adicionales.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Librería `jwt-decode` en mobile | Sin cambios en API | Añade dependencia; Hermes puede tener otros quirks |
| Polyfill `atob` (react-native-quick-base64) | Compatible con Hermes | Otra dependencia nativa; build más complejo |
| **Devolver `roles` en el response body de verify-phone** | Sin dependencia extra; contrato explícito | Leve duplicación con el JWT payload |

### Decisión
`POST /auth/verify-phone` devuelve `roles: string[]` explícitamente en el response body además del JWT. Mobile lee `roles` del body — nunca decodifica el JWT. Este patrón aplica a cualquier claim que mobile necesite de forma inmediata post-auth.

### Consecuencias
- **Facilita:** Mobile sin dependencias de decode, compatible con cualquier JS engine
- **Complica:** Si los roles cambian post-login (poco frecuente), el cliente necesita un refresh explícito
- **Criterio de revisión:** Ninguno — patrón estándar para mobile en este proyecto

---

## ADR-032 — Hermes bundle embebido en debug APK (debuggableVariants=[])

**Fecha:** 2026-04-21
**Estado:** Aceptado
**Área:** Mobile / Build

### Contexto
Detox en Android requiere un APK autocontenido (sin depender de Metro bundler en runtime). Por defecto, React Native debug builds esperan conectarse a Metro para obtener el JS bundle. En el flujo E2E con Detox en CI/emulador, Metro no está disponible o no es confiable.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Correr Metro en paralelo a Detox | Simple de entender | Race condition con el emulador; Metro puede morir mid-test |
| Release APK para Detox | Bundle siempre embebido | No se puede debuggear; build más lento |
| **debuggableVariants=[] en build.gradle** | Bundle embebido en debug APK; sigue siendo debuggable | Menos obvia; build ~20s más lento que el default |

### Decisión
`android/app/build.gradle` establece `react { debuggableVariants = [] }`. Esto obliga a Gradle a ejecutar `createBundleDebugJsAndAssets` y empaquetar el bundle Hermes en el APK debug, eliminando la dependencia de Metro en tiempo de ejecución.

### Consecuencias
- **Facilita:** Detox E2E determinístico sin Metro; APK portable entre máquinas
- **Complica:** Cambios en JS requieren rebuild del APK (no hay hot reload en E2E); build debug tarda ~3-4 min adicionales
- **Criterio de revisión:** Si se migra a Detox con Metro explícito o a otro test runner E2E

---

## ADR-034 — DateTimePicker React Native: componente nativo de la comunidad

**Fecha:** 2026-04-24
**Estado:** Aceptado
**Área:** Mobile

### Contexto
`ScheduleConfirmScreen` (Sprint 9) necesita que el pasajero seleccione una fecha y hora futuras para programar su viaje. Se requiere una experiencia de selección clara y con validación de mínimo 30 minutos de anticipación.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| `@react-native-community/datetimepicker` | UX nativa Android/iOS, mantenido por la comunidad RN, soporte en Expo Bare | Puede no estar instalado — requiere verificar deps transitivas; si no → rebuild APK |
| Picker custom (ScrollView + slots de 30 min) | Sin nueva dependencia nativa, no requiere rebuild | UX inferior, más código a mantener, no se comporta como el SO espera |
| `react-native-modal-datetime-picker` | API sencilla | Envuelve `@rn-community/datetimepicker` internamente — misma dep nativa |

### Decisión
`@react-native-community/datetimepicker` — es el estándar de la comunidad React Native para selección de fecha/hora nativa. El agente mobile debe verificar si ya está disponible como dep transitiva antes de instalar (`pnpm list --filter mobile-v2 @react-native-community/datetimepicker`).

### Consecuencias
- **Facilita:** UX consistente con el sistema operativo (Material Design en Android, iOS nativo en iOS), menos código a mantener
- **Complica:** Si no está como dep transitiva, requiere `pnpm add` + rebuild APK — no bloquea el desarrollo de las otras pantallas
- **Criterio de revisión:** Si después de 3 meses el picker nativo genera problemas de compatibilidad, evaluar un picker custom

---

## ADR-035 — `dispatch_window_min` configurable por viaje en scheduled_trips

**Fecha:** 2026-04-24
**Estado:** Aceptado
**Área:** Backend / BD

### Contexto
El despacho anticipado de viajes programados (Sprint 9) arranca la búsqueda de conductor X minutos antes de `scheduled_for`. La ventana inicial es de 30 minutos (Opción A). En Fase 2, se planea soporte para pre-asignación (Opción B) donde la ventana puede ser 0 (driver ya asignado) o variable por región/tipo de servicio.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Hardcodear 30 min en `scheduler.service.ts` | Simple, sin columna extra | Requiere cambio de código para cualquier ajuste; no escala a diferentes tipos de servicio |
| `dispatch_window_min` por viaje en `scheduled_trips` (DEFAULT 30) | Configurable sin nueva migración; Opción B usa valor 0 con pre-asignación | Un campo extra en la tabla (overhead mínimo) |
| Config global en tabla `region_config` | Un solo lugar de configuración | No permite ventanas diferentes por tipo de viaje o por viaje individual |

### Decisión
Almacenar `dispatch_window_min INTEGER NOT NULL DEFAULT 30` en `scheduled_trips` (migration 033). El scheduler lee este valor en cada evaluación de despacho.

### Consecuencias
- **Facilita:** En Fase 2, el admin puede configurar ventanas distintas por región o tipo de servicio sin nueva migración. La Opción B (pre-asignación) usará `dispatch_window_min = 0` para que el scheduler no re-despache un viaje ya asignado.
- **Complica:** El scheduler hace un read adicional por row (mínimo — es un INTEGER). Requiere que cualquier creación de viaje programado establezca el valor explícitamente si difiere del default.
- **Criterio de revisión:** Si después de 6 meses el valor nunca varía del default 30, simplificar a constante.

---

## ADR-036 — `verticals` como entidad de primera clase con feature flags JSONB

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD / Arquitectura multi-vertical

### Contexto
La plataforma debe soportar múltiples modelos de negocio (taxi, custodia de valores, cadena de frío) desde la misma base de código, sin branching de código por vertical.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Feature flags en `env` por deployment | Simple | Requiere deploy separado por vertical; no administrable en caliente |
| Tabla `verticals` con `features JSONB` | Admin puede cambiar features sin deploy; UI adapta comportamiento leyendo `/config` | Un nivel más de indirección; JSONB necesita validación en aplicación |
| Código condicional por vertical | Control total | Duplicación masiva; imposible de mantener a escala |

### Decisión
Crear tabla `verticals` con columna `features JSONB`. El vertical activo se determina por `VERTICAL_SLUG` env var. La API expone `GET /config` (público, sin auth) que retorna el vertical activo con sus feature flags. Los clients (web y mobile) leen `/config` al arrancar y adaptan su UI. Cache Redis TTL 60s para no golpear BD en cada request. PATCH /admin/verticals invalida el cache.

### Consecuencias
- **Facilita:** Nuevos verticales sin deploy (sólo insertar row + configurar `VERTICAL_SLUG`). Admin puede habilitar/deshabilitar features en caliente. Mobile y web no tienen lógica hardcodeada por vertical.
- **Complica:** La UI debe esperar el fetch de `/config` antes de renderizar features condicionales. Si el cache Redis está down, se consulta BD (fallback transparente). Cambiar `VERTICAL_SLUG` requiere reinicio del servidor.
- **Criterio de revisión:** Si se necesita multi-tenancy (múltiples verticales en una instancia), reemplazar `VERTICAL_SLUG` env por tenant routing por dominio/subdominio.

---

## ADR-037 — `trips.metadata JSONB` para extensibilidad por vertical sin migraciones

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD

### Contexto
Cada vertical necesita guardar campos distintos en un viaje: taxi no necesita campos extra; custodia necesita `declared_value`, `cargo_type`; cadena de frío necesita `temp_min`, `temp_max`. Crear columnas por vertical generaría una migración por vertical nuevo.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Columnas separadas por vertical | Type-safe, queryable | Migración por vertical; tabla trips crece indefinidamente |
| Tabla `trip_vertical_data` (1-1) | Normalizado | JOIN extra en cada query de viaje |
| `metadata JSONB DEFAULT '{}'` | Sin migraciones adicionales; flexibilidad total | Sin validación de schema en BD; dificulta queries sobre campos internos |

### Decisión
Agregar `trips.metadata JSONB NOT NULL DEFAULT '{}'`. Los módulos de vertical guardan sus campos específicos aquí. La API no valida el contenido del metadata — cada vertical es responsable de su propio schema (validación Zod en el módulo de vertical cuando se implemente). El campo es opcional en POST /trips y se retorna en GET /trips/:id.

### Consecuencias
- **Facilita:** Migración única para todos los verticales futuros. Cualquier campo específico de vertical puede almacenarse sin tocar el schema principal de trips.
- **Complica:** Pérdida de tipado en BD; consultas SQL sobre campos internos son verbosas (`metadata->>'declared_value'`). Se mitiga con Zod en capa de aplicación.
- **Criterio de revisión:** Si un campo de metadata se vuelve de alta frecuencia de consulta, considerar promoverlo a columna propia.

---

## ADR-038 — `companies` + `company_users` como capa B2B sobre B2C existente

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD / Producto

### Contexto
Clientes empresariales (B2B) necesitan ser modelados separados de usuarios individuales (B2C). Un usuario puede pertenecer a múltiples empresas con distintos roles.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Agregar `company_id` a tabla `users` | Simple, sin tabla intermedia | Un usuario solo puede pertenecer a una empresa; no soporta múltiples roles |
| Tabla `companies` + `company_users` (muchos a muchos) | Flexible; usuarios compartidos entre empresas con distintos roles | Un nivel más de complejidad |
| Schema separado por empresa (multi-tenant BD) | Aislamiento total | Complejidad operacional muy alta; overkill para MVP |

### Decisión
Tabla `companies` independiente vinculada a `verticals`. Los usuarios existentes se asocian vía tabla pivote `company_users(company_id, user_id, role)`. La auth sigue siendo por usuario individual — no por empresa. El JWT no lleva `company_id` en esta fase.

### Consecuencias
- **Facilita:** Un usuario puede ser admin de Empresa A y member de Empresa B. El modelo B2C existente no se rompe. En Sprint futuro se puede agregar `company_id` al JWT si se necesita contexto de empresa en cada request.
- **Complica:** Para operaciones empresariales, se requiere un JOIN adicional a `company_users` para verificar membresía.
- **Criterio de revisión:** Si el 90% de los requests de usuario B2B requieren contexto de empresa, agregar `company_id` al JWT access token.

---

## ADR-039 — `configurations` key-value store por entidad con namespace

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD / Producto

### Contexto
Empresas, usuarios y verticales pueden necesitar parámetros de configuración propios (descuentos, límites de tarifa, toggles de notificaciones, etc.) sin necesidad de nuevas columnas en sus tablas.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| JSONB en columna `config` de cada entidad | Acceso directo sin JOIN | Actualización parcial compleja (merge de JSONB); sin validación de keys |
| Tabla `configurations(entity_type, entity_id, namespace, key, value JSONB)` | Upsert atómico por key; agrupable por namespace; UNIQUE constraint evita duplicados | Una tabla extra; queries de lectura requieren agregación |
| Servicio de configuración externo (Consul, etcd) | Central, observable | Dependencia externa; overkill para MVP |

### Decisión
Tabla `configurations` con `(entity_type, entity_id, namespace, key)` como clave compuesta UNIQUE y `value JSONB` libre. El namespace organiza configs por dominio (`pricing`, `notifications`, `dispatch`, `ui`). La API expone upsert (PUT), read agrupado (GET) y delete atómico.

### Consecuencias
- **Facilita:** Configuración flexible sin migraciones. Admin puede agregar/quitar configs en caliente. La estructura namespace/key es auto-documentada.
- **Complica:** Configs huérfanas si se elimina la entidad (companies usa soft delete → no hay huérfanas por ahora). Sin validación semántica del `value` en BD (se delega a la capa de negocio).
- **Criterio de revisión:** Si los namespaces se vuelven demasiado heterogéneos y difíciles de gestionar, considerar migrar a un schema más tipado por namespace.

---

## ADR-040 — `temperature_readings` como hypertable de TimescaleDB

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD / Infraestructura

### Contexto
El vertical cold-chain requiere registrar lecturas de temperatura a lo largo del viaje (cada ~5 min). Pueden ser cientos de lecturas por viaje y miles de viajes al mes. Se necesita consultas por rango de tiempo (`WHERE recorded_at BETWEEN`) y agregaciones (min, max, avg) eficientes.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Tabla PostgreSQL regular | Sin dependencia adicional | Sin compresión automática; queries de rango degradan con volumen |
| `temperature_readings` como hypertable TimescaleDB | Particionado por tiempo automático; compresión; queries de rango O(log n) | Requiere TimescaleDB activo (ya presente) |
| Tabla JSONB en `trips.metadata` | Sin nueva tabla | Sin índices eficientes; JSONB crece ilimitado; no agrupable |

### Decisión
Hypertable TimescaleDB con `recorded_at` como dimensión temporal. Mismo patrón que `trip_locations` (ADR-003). Schema: `(trip_id FK, recorded_at TIMESTAMPTZ, celsius DECIMAL(5,2), sensor_id TEXT, lat DECIMAL(10,7), lng DECIMAL(10,7))`. Índice compuesto `(trip_id, recorded_at)`.

**Patrón Knex — insert:**
```typescript
await db('temperature_readings').insert({
  trip_id: tripId,
  recorded_at: new Date(),
  celsius: data.celsius,       // DECIMAL — pasar number JS directo
  sensor_id: data.sensorId ?? null,
  lat: data.lat ?? null,
  lng: data.lng ?? null,
});
```

### Consecuencias
- **Facilita:** Queries de rango eficientes (`WHERE trip_id = ? AND recorded_at BETWEEN ? AND ?`). Compresión automática reduce storage. Consistente con patrón existente de `trip_locations`.
- **Complica:** La tabla no es reversible a PostgreSQL regular sin migración. Los JOINs con tablas no-hypertable funcionan normalmente.
- **Criterio de revisión:** Si el volumen de lecturas supera 10M/mes y se requiere mayor performance, evaluar chunk_time_interval más fino.

---

## ADR-041 — `custody_events` como log append-only inmutable

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD / Producto

### Contexto
El vertical de custodia de valores requiere una cadena de custodia auditada: cada evento (recogida, traspaso, entrega) debe ser inmutable una vez registrado. Si un evento se pudiera modificar o eliminar, la cadena de custodia perdería validez legal.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| JSONB en `trips.metadata.custody_events` | Sin tabla extra | Mutable por diseño; sin FK para actor_id; sin índice por event_type |
| Tabla `custody_events` con soft delete | Tabla dedicada con FK correctas | El soft delete implica mutabilidad lógica |
| Tabla `custody_events` append-only (sin update/delete en API) | Inmutabilidad por diseño de API; auditable | Requiere disciplina en la capa de service para no exponer update/delete |

### Decisión
Tabla `custody_events` append-only. La API expone solo `POST` (crear) y `GET` (leer). No hay endpoints `PATCH` ni `DELETE`. El service lanza `CUSTODY_EVENT_IMMUTABLE` (409) si se intenta modificar. Schema: `(id UUID PK, trip_id FK, event_type VARCHAR(30), actor_id FK users, signature_url TEXT, photo_url TEXT, declared_value DECIMAL, notes TEXT, lat DECIMAL, lng DECIMAL, occurred_at TIMESTAMPTZ, sequence INTEGER)`. El campo `sequence` se auto-incrementa por `trip_id`.

**Patrón Knex — insert:**
```typescript
const lastSeq = await db('custody_events')
  .where({ trip_id: tripId })
  .max('sequence as seq')
  .first();
await db('custody_events').insert({
  id: uuid(),
  trip_id: tripId,
  event_type: data.eventType,  // 'pick_up' | 'handoff' | 'delivery'
  actor_id: actorId,
  signature_url: data.signatureUrl ?? null,
  photo_url: data.photoUrl ?? null,
  declared_value: data.declaredValue ?? null,  // DECIMAL — number JS
  notes: data.notes ?? null,
  lat: data.lat ?? null,
  lng: data.lng ?? null,
  occurred_at: new Date(),
  sequence: (lastSeq?.seq ?? 0) + 1,
});
```

### Consecuencias
- **Facilita:** Cadena de custodia auditable. Sin posibilidad de "borrar el rastro". Modelo simple de leer para el backoffice (order by sequence).
- **Complica:** Si se registra un evento por error, no hay rollback automático — requiere proceso manual de corrección (un evento de tipo `correction` podría agregarse en sprints futuros).
- **Criterio de revisión:** Si requisitos legales exigen firma digital criptográfica verificable, agregar campo `signature_hash` y algoritmo de verificación en Sprint futuro.

---

## ADR-042 — `pricingModel` en `verticals.features` — extensión sin fork de PricingEngine

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / Producto

### Contexto
Taxi usa `per_km_min` (tarifa base + costo/km + costo/min). Custodia y cold-chain necesitan modelos distintos: tarifa fija por servicio (`fixed_rate`) o por peso × distancia (`per_weight_km`). Agregar esto sin fork del PricingEngine existente es crítico — el PricingEngine tiene 100% de cobertura y no debe romperse.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Fork PricingEngine por vertical | Independencia total | Duplicación de código; 2 engines que mantener; divergen con el tiempo |
| Subclases de PricingEngine por modelo | OOP limpio | TypeScript + herencia = complejidad en inyección de dependencias |
| `switch(pricingModel)` dentro del PricingEngine existente + campo `pricingModel` en `verticals.features` | Un solo engine; la lógica nueva es aditiva (no modifica ramas existentes) | El engine crece, pero los tests por modelo son independientes |

### Decisión
Agregar `pricingModel: 'per_km_min' | 'fixed_rate' | 'per_weight_km'` al schema de `verticals.features`. El PricingEngine lee el modelo desde el contexto de la request (pasado como parámetro opcional a `estimate()`). La rama `per_km_min` no se toca — los tests existentes de 100% cobertura siguen pasando sin cambio.

Agregar `weight_capacity_kg DECIMAL NULLABLE` a `trip_types` para soporte `per_weight_km`.

**Patrón de extensión:**
```typescript
// PricingEngine.estimate(input, pricingModel = 'per_km_min')
if (pricingModel === 'fixed_rate') {
  return { fare: tripType.base_fare, breakdown: [] };
}
if (pricingModel === 'per_weight_km') {
  const fare = (input.weight_kg ?? 1) * tripType.base_fare +
               input.distanceKm * tripType.cost_per_km;
  return { fare: Math.max(fare, tripType.min_fare), breakdown: [...] };
}
// default: per_km_min — lógica existente sin cambio
```

### Consecuencias
- **Facilita:** Tests de `per_km_min` no se tocan. Agregar un nuevo modelo es agregar una rama al switch. La decisión de qué modelo usar vive en la config del vertical (no en código del engine).
- **Complica:** El engine acumula responsabilidades; si hay más de 5 modelos, refactorizar a Strategy pattern.
- **Criterio de revisión:** Más de 4 `pricingModel` distintos → extraer a Strategy pattern con un `PricingStrategy` interface.

---

## ADR-043 — `document_requirements.vertical_id` nullable — requisitos de conductor por vertical

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Backend / BD

### Contexto
Los requisitos de documentación para conductores son distintos por vertical: taxi requiere licencia + seguro; custodia requiere certificación de seguridad + vehículo blindado; cold-chain requiere certificación de refrigeración. Actualmente `document_requirements` solo tiene `region_id`.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Nueva tabla `vertical_document_requirements` | Separación limpia | Duplica estructura; requiere migración mayor |
| `vertical_id FK NULLABLE` en `document_requirements` | Backward-compatible; NULL = aplica a todos los verticales | Un JOIN más en el query de onboarding |
| JSONB `required_for_verticals TEXT[]` en `document_requirements` | Flexible | No FK; no indexable eficientemente |

### Decisión
`ALTER TABLE document_requirements ADD COLUMN vertical_id UUID REFERENCES verticals(id) ON DELETE SET NULL`. `NULL` significa "aplica a todos los verticales" (backward-compatible con los 5 requisitos existentes de taxi). El driver onboarding filtra: `WHERE region_id = ? AND (vertical_id IS NULL OR vertical_id = ?)`.

### Consecuencias
- **Facilita:** Los 5 requisitos existentes (taxi) siguen funcionando sin cambio de datos. Agregar requisitos por vertical es un INSERT con `vertical_id`. El auto-approve de conductores ya usa el query por `region_id` — extenderlo es 1 condición adicional.
- **Complica:** Si un requisito aplica a 2 de 3 verticales (pero no todos), se necesitan 2 rows — no hay forma de expresar "todos excepto X" sin rows adicionales.
- **Criterio de revisión:** Si surgen 5+ verticales con combinaciones complejas de requisitos, migrar a tabla `vertical_document_requirements` explícita.

---

## ADR-044 — UX mobile vertical-aware vía feature flags — extensión de ADR-036

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Mobile / Producto

### Contexto
Los 3 verticales tienen flujos de UX distintos en mobile: taxi es origen→destino; custodia necesita declaración de carga y captura de firma en cada evento; cold-chain necesita monitoreo de temperatura activo. Hay dos enfoques arquitectónicos para manejar esto.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| Apps separadas por vertical (3 APKs) | Máxima independencia de UX | 3 veces el esfuerzo de mantenimiento; misma lógica de auth/tracking triplicada |
| Screens separadas con router condicional por `vertical.slug` | Código claro, fácil de razonar | Switch por slug puede crecer; acoplado al slug string |
| Feature flags de `vertical.store` + screens condicionales | Ya existe `useVerticalFeatures()`; cambiar de vertical = cambiar config del servidor | Screens con mucha lógica condicional si hay muchos flags |

### Decisión
Extender `verticals.features` JSONB con 3 flags nuevos: `cargoDeclaration: boolean`, `temperatureLog: boolean`, `chainOfCustody: boolean`. El `vertical.store` ya los persiste en MMKV. Las pantallas nuevas se registran en el Stack navigator pero solo se navega a ellas cuando el flag correspondiente es `true`. No hay código condicional inline — el condicional está en el evento de navegación.

**Flags por vertical:**
```
taxi:       { cargoDeclaration: false, temperatureLog: false, chainOfCustody: false }
custody:    { cargoDeclaration: true,  temperatureLog: false, chainOfCustody: true  }
cold-chain: { cargoDeclaration: true,  temperatureLog: true,  chainOfCustody: false }
```

### Consecuencias
- **Facilita:** Cambiar un vertical a prod = 1 PATCH en la BD (no deploy). Las pantallas nuevas coexisten en el bundle sin afectar a taxi. El patrón es idéntico al de `features.scheduling` (Sprint 12).
- **Complica:** El APK contiene código para todos los verticales. Para verticales con flows muy distintos (futuro), podría ser necesario code splitting o lazy loading.
- **Criterio de revisión:** Si el bundle mobile supera 80MB por incluir flows inactivos, evaluar lazy loading por feature flag.

---

## ADR-045 — Clone Starter Kit como documentación estática

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Área:** Producto / Infraestructura

### Contexto
El objetivo declarado del proyecto es que clonar el repo y cambiar `VERTICAL_SLUG` entregue una app funcional para cualquier vertical sin trabajo adicional de código. Se necesita un artefacto que guíe este proceso.

### Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| CLI generador de código (scaffolding) | Automatiza el proceso | Alto costo de desarrollo; se desactualiza con el código real |
| Cookiecutter / template repo | Estándar en la industria | Requiere mantener dos repos en sync |
| Documentación estática + seed template + checklist | Cero deuda técnica adicional; siempre fiel al código real | Requiere que el clonador siga pasos manuales |

### Decisión
Documentación estática en `docs/VERTICAL_CLONE_GUIDE.md`: checklist paso a paso (env vars, seed del vertical, features JSONB, requisitos de conductor), plantilla de seed en `apps/api/seeds/templates/vertical.template.ts`, y `.env.vertical.example` con todas las variables relevantes documentadas. Sin scaffolding — el código real es la fuente de verdad.

### Consecuencias
- **Facilita:** Cero deuda técnica de mantenimiento del generador. La guía refleja el estado real del repo en cada sprint.
- **Complica:** El proceso de clonar es manual (15-20 pasos). Sin automatización, errores humanos son posibles.
- **Criterio de revisión:** Si más de 3 equipos externos clonan el repo y reportan dificultades, considerar un script bash de setup inicial.

---

## Cómo agregar una nueva decisión

Al tomar una decisión significativa que no sea trivialmente reversible:

```markdown
## ADR-XXX — Título de la Decisión

**Fecha:** YYYY-MM-DD
**Estado:** Propuesto / Aceptado / Deprecado / Reemplazado por ADR-YYY
**Área:** Arquitectura / Backend / Mobile / BD / Infraestructura / Producto

### Contexto
¿Por qué se necesitaba tomar esta decisión?

### Opciones consideradas
| Opción | Pros | Contras |

### Decisión
¿Qué se decidió y por qué?

### Consecuencias
- **Facilita:** ...
- **Complica:** ...
- **Criterio de revisión:** ¿Cuándo reconsiderar esta decisión?

---

## ADR-046 — Extensibilidad de verticales: custodyEventTypes y cargoFields configurables vía JSONB

**Fecha:** 2026-05-07
**Estado:** Aprobado
**Área:** Mobile | Arquitectura

### Contexto

El sistema soporta un vertical `custody` (custodia de valores) que requiere un flujo de cadena de custodia diferente al taxi genérico. Se identificó la necesidad de preparar el repositorio base para que un fork (operador tipo Brinks/G4S) pueda configurar su propio flujo — tipos de eventos de custodia, campos de declaración de carga y lógica de selección de unidad — sin modificar el código core. El momento es el Sprint 16, previo al primer despliegue productivo del vertical `custody`.

### Opciones consideradas

| Opción | Pros | Contras | Criterio de revisión |
|---|---|---|---|
| Hardcodear flujos por vertical en condicionales `if (slug === 'custody')` | Simple de implementar | No escalable; cada fork requiere PR al repo base | Si solo existe un fork y nunca hay más |
| Configurar flujos vía JSONB en `verticals.features` | Config sin código; el fork solo ajusta el seed/DB | Requiere tipado compartido entre backend y mobile | Si los flujos se vuelven demasiado complejos para config pura |
| Crear un sistema de plugins cargados en runtime | Máxima extensibilidad | Complejidad alta; out of scope para MVP | Si se necesitan flujos con lógica arbitraria |

### Decisión

Se elige configurar vía JSONB (`verticals.features`) porque permite que un fork defina su flujo completo ajustando únicamente el seed de base de datos y las variables de entorno, sin tocar código TypeScript del repo base.

**Cambios implementados:**

**`apps/mobile-v2/src/stores/vertical.store.ts`** — Nuevos tipos exportados:

```typescript
export interface CustodyEventTypeConfig {
  code: string;           // código interno enviado al backend (ej. 'pick_up')
  label: string;          // texto visible en la UI
  requiresPhoto: boolean; // si la pantalla debe exigir foto antes de registrar
  requiresSignature: boolean; // placeholder — el fork implementa la lógica de firma doble
}

export interface CargoFieldConfig {
  key: string;            // nombre del campo en metadata.cargo (snake_case)
  label: string;          // etiqueta visible
  type: 'text' | 'number' | 'phone';
  required: boolean;      // bloquea el botón confirmar si está vacío
  placeholder?: string;
  multiline?: boolean;    // TextInput multilínea
}

// Adición a VerticalFeatures:
custodyEventTypes?: CustodyEventTypeConfig[];  // undefined → fallback a [pick_up, handoff, delivery]
cargoFields?: CargoFieldConfig[];              // undefined → fallback a 4 campos genéricos
unitTypeDetermination?: 'by_declared_value' | 'by_cargo_type' | 'manual' | null; // el fork implementa la lógica
```

**`apps/mobile-v2/src/screens/driver/CustodyEventScreen.tsx`** — Lee `features.custodyEventTypes` del store. Fallback a defaults sin `requiresPhoto`/`requiresSignature`. Muestra badge ✍️ si `requiresSignature = true` (indicador visual; la UI de firma es responsabilidad del fork).

**`apps/mobile-v2/src/screens/passenger/CargoDeclarationScreen.tsx`** — Reemplaza 4 campos hardcoded por render dinámico sobre `features.cargoFields`. `canConfirm` evalúa todos los campos con `required: true`. El payload `metadata.cargo` se construye con los mismos `key` del config; campos `type: 'number'` se parsean con `parseFloat`.

**`apps/api/seeds/09_verticals_and_companies.ts`** — Vertical `custody` incluye `custodyEventTypes` con `requiresSignature: true` en Traspaso y Entrega, `cargoFields` con `declared_value` requerido, y `unitTypeDetermination: 'by_declared_value'`. Vertical `cold-chain` con config análoga pero sin firma requerida.

### Contrato de config (no es endpoint — es estructura del JSONB)

El fork configura el vertical actualizando la fila en `verticals.features`:

```typescript
// Mínimo requerido para activar el flujo extendido de custodia:
interface CustodyVerticalFeatures {
  chainOfCustody: true;
  cargoDeclaration: true;
  custodyEventTypes: CustodyEventTypeConfig[];  // mínimo 1 elemento
  cargoFields: CargoFieldConfig[];              // mínimo 1 campo required
  unitTypeDetermination: 'by_declared_value' | 'by_cargo_type' | 'manual' | null;
}
```

El endpoint que sirve esta config es `GET /config` (sin cambios — ya devuelve `features` completo desde la DB).

### Consecuencias

**Facilita:**
- Un fork puede definir N tipos de eventos de custodia (ej. 5 fases del flujo Brinks) sin tocar TypeScript.
- La lógica de firma doble (`requiresSignature`) tiene un punto de extensión claro: el fork agrega la UI de firma en `CustodyEventScreen` activada por ese flag.
- `unitTypeDetermination` da al fork un campo semántico para implementar la selección de unidad blindada según valor declarado.

**Complica:**
- Los tipos de eventos que el backend acepta en `POST /trips/:id/custody/events` (`event_type`) son strings libres — el backend no valida contra la config del vertical. El fork debe sincronizar sus `code` con lo que el backend acepta.
- Si el fork necesita lógica condicional compleja entre pasos (ej. "si el valor > $500k, agregar paso de escolta"), la config JSONB no es suficiente y requiere código en el fork.

**Criterio de revisión:** Revisar si un fork necesita más de 8 tipos de eventos o si `requiresSignature` requiere integración con hardware biométrico — en ese caso evaluar un sistema de plugins cargados en runtime.

### Flags de irreversibilidad

- La actualización del seed (`09_verticals_and_companies.ts`) modifica el JSONB de `verticals.features` con `.onConflict('slug').merge(...)`. Es idempotente pero sobreescribe config manual previa en la DB.
- No hay migraciones de schema — `features` ya es `JSONB` en la tabla `verticals`.
```
