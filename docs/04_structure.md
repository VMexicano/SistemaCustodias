# Structure — Estructura del Proyecto

## Repositorio

Monorepo con tres aplicaciones principales gestionadas desde la raíz.

```
uber-platform/
├── apps/
│   ├── api/              ← Backend Node.js + Fastify
│   ├── web/              ← Panel Admin Next.js
│   └── mobile/           ← App React Native (pasajero + conductor)
├── packages/
│   ├── shared-types/     ← Interfaces TypeScript compartidas
│   ├── shared-utils/     ← Utilidades compartidas (formateo, validaciones)
│   └── ui-components/    ← Componentes React compartidos (web + mobile donde aplique)
├── infra/
│   ├── prometheus/
│   ├── grafana/
│   └── jaeger/
├── scripts/
│   ├── db/               ← Scripts de BD y seeds
│   └── ci/               ← Scripts de CI/CD
├── e2e/                  ← Tests Playwright
├── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
└── turbo.json            ← Turborepo para builds incrementales
```

---

## API — Estructura Interna

```
apps/api/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.schema.ts
│   │   │   └── __tests__/
│   │   │       ├── auth.service.test.ts
│   │   │       └── auth.integration.test.ts
│   │   │
│   │   ├── users/
│   │   ├── drivers/
│   │   │
│   │   ├── trips/
│   │   │   ├── trips.routes.ts
│   │   │   ├── trips.controller.ts
│   │   │   ├── trips.service.ts
│   │   │   ├── trips.repository.ts
│   │   │   ├── trips.state-machine.ts    ← máquina de estados
│   │   │   ├── trips.schema.ts
│   │   │   ├── trips.events.ts           ← definición de eventos WS
│   │   │   ├── trips.types.ts
│   │   │   └── __tests__/
│   │   │       ├── trips.state-machine.test.ts   ← cobertura 100%
│   │   │       └── trips.integration.test.ts
│   │   │
│   │   ├── pricing/
│   │   │   ├── pricing.routes.ts
│   │   │   ├── pricing.controller.ts
│   │   │   ├── pricing-engine.ts         ← motor de precios
│   │   │   ├── pricing.repository.ts
│   │   │   ├── pricing.schema.ts
│   │   │   └── __tests__/
│   │   │       └── pricing-engine.test.ts        ← cobertura 100%
│   │   │
│   │   ├── payments/
│   │   │   ├── payments.routes.ts
│   │   │   ├── payments.controller.ts
│   │   │   ├── payment.service.ts        ← abstracción sobre Stripe
│   │   │   ├── stripe.adapter.ts         ← integración Stripe
│   │   │   ├── payments.repository.ts
│   │   │   └── __tests__/
│   │   │       └── payment.service.test.ts       ← cobertura 95%
│   │   │
│   │   ├── tracking/
│   │   │   ├── tracking.routes.ts
│   │   │   ├── tracking.service.ts
│   │   │   └── tracking.repository.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notification.service.ts
│   │   │   ├── fcm.adapter.ts
│   │   │   ├── sms.adapter.ts            ← Twilio
│   │   │   └── email.adapter.ts
│   │   │
│   │   ├── scheduler/
│   │   │   ├── scheduler.service.ts      ← cron + BullMQ
│   │   │   └── scheduler.repository.ts
│   │   │
│   │   └── admin/
│   │       ├── admin.routes.ts
│   │       ├── admin.controller.ts
│   │       └── admin.service.ts
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── base.errors.ts            ← BusinessError, TechnicalError
│   │   │   └── business-errors.ts        ← catálogo completo
│   │   │
│   │   └── resilience/
│   │       └── circuit-breaker.ts
│   │
│   ├── observability/
│   │   ├── logger.ts
│   │   ├── metrics.ts
│   │   ├── tracer.ts
│   │   └── audit.ts
│   │
│   ├── queues/
│   │   ├── queues.config.ts              ← definición de todas las colas
│   │   ├── workers/
│   │   │   ├── payment.worker.ts
│   │   │   ├── notification.worker.ts
│   │   │   ├── tracking.worker.ts
│   │   │   └── scheduler.worker.ts
│   │   └── producers/
│   │       ├── payment.producer.ts
│   │       └── notification.producer.ts
│   │
│   ├── sockets/
│   │   ├── socket.server.ts              ← instancia de Socket.io
│   │   ├── passenger.namespace.ts
│   │   ├── driver.namespace.ts
│   │   └── admin.namespace.ts
│   │
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── validate.ts
│   │   ├── rate-limit.ts
│   │   └── request-logger.ts
│   │
│   ├── config/
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── environment.ts                ← validación de env vars con Zod
│   │
│   ├── migrations/
│   │   ├── 20240101_001_create_region_config.ts
│   │   ├── 20240101_002_create_users.ts
│   │   └── ...
│   │
│   ├── seeds/
│   │   ├── 01_region_config.ts
│   │   ├── 02_trip_types.ts
│   │   └── 03_pricing_factors.ts
│   │
│   ├── testing/
│   │   ├── factories/
│   │   │   ├── trip.factory.ts
│   │   │   ├── driver.factory.ts
│   │   │   └── user.factory.ts
│   │   ├── mocks/
│   │   │   ├── stripe.mock.ts
│   │   │   ├── maps.mock.ts
│   │   │   └── fcm.mock.ts
│   │   └── helpers/
│   │       ├── create-test-user.ts
│   │       └── generate-test-token.ts
│   │
│   ├── app.ts                            ← instancia de Fastify
│   └── main.ts                           ← punto de entrada
│
├── Dockerfile
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## Web Admin — Estructura

```
apps/web/
├── src/
│   ├── app/                              ← Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/
│   │   └── (admin)/
│   │       ├── dashboard/
│   │       ├── trips/
│   │       │   ├── page.tsx              ← lista de viajes
│   │       │   └── [id]/
│   │       │       └── page.tsx          ← detalle con mapa y timeline
│   │       ├── drivers/
│   │       │   ├── page.tsx
│   │       │   └── [id]/
│   │       │       └── page.tsx          ← detalle con checklist de docs
│   │       ├── operations/
│   │       │   ├── failed-payments/
│   │       │   └── errors/
│   │       └── config/
│   │           ├── pricing/
│   │           └── commissions/
│   │
│   ├── components/
│   │   ├── maps/
│   │   │   ├── RealtimeMap.tsx           ← mapa con conductores en vivo
│   │   │   └── TripRouteMap.tsx          ← ruta GPS histórica
│   │   ├── trips/
│   │   ├── drivers/
│   │   └── shared/
│   │
│   ├── hooks/
│   │   ├── useRealtimeDashboard.ts       ← WebSocket /admin
│   │   ├── useTrips.ts
│   │   └── useDrivers.ts
│   │
│   └── lib/
│       ├── api.ts                        ← cliente HTTP
│       └── socket.ts                     ← cliente Socket.io
```

---

## Mobile — Estructura

```
apps/mobile/
├── src/
│   ├── screens/
│   │   ├── passenger/
│   │   │   ├── HomeScreen.tsx            ← mapa + búsqueda
│   │   │   ├── EstimateScreen.tsx        ← cotización
│   │   │   ├── ActiveTripScreen.tsx      ← viaje en curso
│   │   │   ├── TripHistoryScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   │
│   │   └── driver/
│   │       ├── OnlineScreen.tsx          ← mapa + toggle disponibilidad
│   │       ├── TripRequestModal.tsx      ← solicitud con countdown
│   │       ├── ActiveTripScreen.tsx
│   │       ├── EarningsScreen.tsx
│   │       └── DocumentsScreen.tsx
│   │
│   ├── navigation/
│   │   ├── PassengerNavigator.tsx
│   │   └── DriverNavigator.tsx
│   │
│   ├── services/
│   │   ├── location.service.ts           ← GPS + offline tracking
│   │   ├── socket.service.ts             ← Socket.io client
│   │   └── notification.service.ts       ← FCM
│   │
│   ├── stores/
│   │   ├── auth.store.ts                 ← Zustand
│   │   └── trip.store.ts
│   │
│   └── lib/
│       ├── api.ts
│       └── mmkv.ts                       ← persistencia local
```

---

## Convenciones de Código

### Nomenclatura

| Tipo | Convención | Ejemplo |
|---|---|---|
| Archivos | kebab-case | `trip-state-machine.ts` |
| Clases | PascalCase | `TripStateMachine` |
| Funciones | camelCase | `calculateFare` |
| Constantes | UPPER_SNAKE | `VALID_TRANSITIONS` |
| Interfaces | PascalCase con I opcional | `Trip`, `CreateTripDto` |
| Enums | PascalCase | `TripStatus` |
| Variables de entorno | UPPER_SNAKE | `DATABASE_URL` |

### Estructura de un módulo

```typescript
// 1. routes.ts — no contiene lógica, solo mapeo
router.post('/trips', {
  schema:      { body: CreateTripSchema },
  onRequest:   [authenticate, authorize('passenger')],
}, tripController.create);

// 2. controller.ts — no contiene lógica de negocio
async create(req, reply) {
  const trip = await this.tripService.create(req.user.id, req.body);
  return reply.status(201).send({ success: true, data: { trip } });
}

// 3. service.ts — toda la lógica de negocio aquí
async create(passengerId: string, dto: CreateTripDto): Promise<Trip> {
  // validaciones de negocio
  // orquestación de repositorios
  // emisión de eventos
}

// 4. repository.ts — solo acceso a BD, sin lógica
async create(data: CreateTripData): Promise<Trip> {
  const [trip] = await db('trips').insert(data).returning('*');
  return trip;
}
```

### Commits

```
feat:     nueva funcionalidad
fix:      corrección de bug
refactor: refactorización sin cambio de comportamiento
test:     añadir o modificar tests
docs:     cambios en documentación
chore:    cambios de build, dependencias, configuración
```

---

## Flujo de Desarrollo con el Agente

```
1. El agente lee el contexto del módulo a desarrollar
   → context.md + memory.md + estructura existente

2. Escribe el código siguiendo la estructura de módulo

3. Escribe los tests correspondientes

4. Corre verificación rápida:
   npm run agent:verify:quick
   → unit tests del módulo
   → @smoke de Playwright si afecta UI

5. Si todo pasa → genera PR con descripción clara

6. Si algo falla → diagnostica con logs y screenshots
   → corrige → vuelve al paso 4
```
