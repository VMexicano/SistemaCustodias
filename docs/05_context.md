# Context — Contexto del Proyecto para Agentes

## Propósito de este documento

Este documento es la fuente de contexto primaria que debe leer cualquier agente antes de trabajar en este proyecto. Contiene el estado actual, las decisiones tomadas, y las restricciones que deben respetarse.

---

## Qué es este proyecto

Plataforma de movilidad y servicios bajo demanda tipo UBER. Base técnica reutilizable para múltiples verticales de negocio. Primer vertical en desarrollo: **Taxi en México**.

---

## Estado actual del proyecto

| Área | Estado |
|---|---|
| Arquitectura | Definida — Monolito Modular |
| Schema de BD | Definido — pendiente implementación |
| API | Contratos definidos — pendiente implementación |
| Mobile | Diseño de pantallas definido — pendiente implementación |
| Infraestructura | Docker + GitHub Actions definido — pendiente setup |
| Testing | Estrategia definida — pendiente implementación |

**Fase actual:** Preparación para desarrollo del MVP (Fase 1)

---

## Decisiones inamovibles

Estas decisiones ya fueron tomadas y documentadas. No deben cuestionarse ni cambiarse sin actualizar este documento:

1. **Stack:** Node.js + TypeScript + Fastify — no Express, no NestJS
2. **BD:** PostgreSQL + Redis + TimescaleDB — no MongoDB, no MySQL
3. **Mobile:** React Native — no Flutter
4. **Pagos MVP:** Solo Stripe, solo tarjeta — no efectivo en MVP
5. **Mercado inicial:** Solo México — no multipaís en MVP
6. **Arquitectura:** Monolito modular — no microservicios en MVP
7. **Lenguaje:** TypeScript estricto en todo el codebase
8. **Autenticación:** JWT con OTP por teléfono — no email en MVP

---

## Reglas de negocio críticas

El agente debe conocer estas reglas antes de implementar cualquier funcionalidad:

### Viajes
- Un pasajero no puede tener dos viajes activos simultáneamente
- Un conductor no puede aceptar un viaje si ya tiene uno activo
- Toda transición de estado debe registrarse en `trip_status_history`
- El `pricing_snapshot` en `trips` es inmutable — nunca se recalcula después de completarse
- Las transiciones de estado usan `SELECT FOR UPDATE` para evitar race conditions

### Conductores
- Un conductor no puede operar sin todos los documentos requeridos aprobados
- Si un documento vence con un viaje en curso, el conductor termina el viaje y se suspende después
- La aprobación es automática cuando todos los documentos requeridos están aprobados

### Precios
- El precio nunca puede ser menor al `min_fare` del tipo de viaje
- El IVA se calcula sobre el subtotal, no sobre la tarifa base
- Los factores de precio se aplican en orden: `fixed_amount` → `percentage` → `multiplier`

### Pagos
- Los cobros se ejecutan en BullMQ, fuera de la transacción de BD
- Si Stripe falla, el viaje ya está `COMPLETED` — no se revierte el estado
- Después de 3 reintentos fallidos, el pago escala a revisión manual en `system_error_logs`

### Datos
- Nunca borrar registros de negocio — usar soft delete con `deleted_at`
- Todo cambio de entidad de negocio debe registrarse en `audit_logs`
- Los puntos GPS se guardan en TimescaleDB con TTL de 90 días
- El GPS se envía al servidor cada 3-5 segundos; el flush a TimescaleDB se hace en batch cada 30 segundos
- El tiempo límite del conductor para aceptar una solicitud es 30 segundos (configurable en `region_config`)

---

## Entorno de desarrollo

### Levantar el entorno local
```bash
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

### URLs locales
| Servicio | URL |
|---|---|
| API | http://localhost:3000 |
| Panel Admin | http://localhost:3001 |
| Bull Board | http://localhost:3002 |
| Grafana | http://localhost:3003 |
| Jaeger | http://localhost:16686 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Variables de entorno
Copiar `.env.example` a `.env.local` y completar los valores. Las claves de Stripe en desarrollo usan el prefijo `sk_test_`.

---

## Convenciones que el agente debe seguir

### Código
- TypeScript estricto — sin `any` explícito
- Inyección de dependencias en todos los servicios
- Toda función async tiene manejo de errores explícito
- Los errores de negocio lanzan `BusinessError`, los técnicos `TechnicalError`
- Nunca SQL directo — usar Knex query builder

### Tests
- Todo módulo nuevo incluye sus tests en `__tests__/`
- Los mocks de servicios externos van en `src/testing/mocks/`
- Los factories de datos van en `src/testing/factories/`
- Ejecutar `npm run agent:verify:quick` antes de considerar una tarea completa

### Commits
```
feat(trips): implementar transición DRIVER_ARRIVED → IN_PROGRESS
fix(pricing): corregir aplicación de factores stackables
test(state-machine): agregar casos de cancelación tardía
```

### PRs
- Un PR por funcionalidad o fix
- Descripción clara de qué cambia y por qué
- Tests incluidos en el mismo PR
- CI debe pasar antes de review

---

## Módulos y sus responsabilidades

| Módulo | Archivo principal | Responsabilidad |
|---|---|---|
| auth | `auth.service.ts` | OTP, JWT, refresh tokens |
| users | `users.service.ts` | Perfil pasajero, métodos de pago |
| drivers | `drivers.service.ts` | Perfil conductor, documentos, disponibilidad |
| trips | `trips.state-machine.ts` | Ciclo de vida del viaje |
| pricing | `pricing-engine.ts` | Cálculo de tarifas con factores |
| payments | `payment.service.ts` | Abstracción sobre Stripe |
| tracking | `tracking.service.ts` | GPS en tiempo real e histórico |
| notifications | `notification.service.ts` | Push, SMS, fallback automático |
| scheduler | `scheduler.service.ts` | Viajes programados, alertas de docs |
| admin | `admin.service.ts` | Panel de operación |

---

## Errores comunes a evitar

```
✗ Lógica de negocio en controllers o routes
✗ Acceso directo a BD desde services (usar repository)
✗ SQL crudo sin Knex
✗ Secrets hardcoded en el código
✗ Ignorar el manejo de errores en llamadas a servicios externos
✗ Modificar una migración ya aplicada
✗ Borrar registros de BD con DELETE
✗ Asumir que Redis siempre está disponible
✗ Recalcular pricing_snapshot después de completarse el viaje
✗ Ejecutar efectos secundarios dentro de transacciones de BD
```

---

## Documentos relacionados

| Documento | Contenido |
|---|---|
| `01_product.md` | Qué construimos, verticales, fases |
| `02_design.md` | Diseño visual, componentes, UX |
| `03_tech.md` | Stack completo con configuraciones |
| `04_structure.md` | Estructura de archivos y convenciones |
| `05_context.md` | Este documento |
| `06_memory.md` | Estado vivo del proyecto |
| `07_skills.md` | Habilidades y capacidades del agente |
| `08_agents.md` | Arquitectura multi-agente |
| `arquitectura_uber_base_v1.md` | Documento técnico completo |
