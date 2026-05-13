# Steering — Estándares de Testing

> Estrategia, herramientas, umbrales de cobertura y patrones de test.
> Fuentes: docs/03_tech.md · docs/PLAN_TDD_SDD.md

---

## Stack de testing

| Tipo | Herramienta | Cuándo corre |
|---|---|---|
| Unit | Jest + ts-jest | En cada commit |
| Integration | Jest + Supertest + Testcontainers | En cada PR |
| E2E / Smoke | Playwright | @smoke antes de deploy en CI |
| Verificación rápida (agente) | `npm run agent:verify:quick` | Antes de cada PR |

---

## Umbrales de cobertura mínima (no negociables)

| Módulo | Líneas | Branches | Justificación |
|---|---|---|---|
| `TripStateMachine` | **100%** | **100%** | Concurrencia y dinero involucrado |
| `PricingEngine` | **100%** | **100%** | Cálculo económico directo al usuario |
| `PaymentService` | **95%** | **90%** | Integración financiera crítica |
| Global | **75%** | **70%** | Umbral mínimo del proyecto |

---

## Arquitectura de tests

### Unit tests — qué mockear

```typescript
// En unit tests:
// ✅ Mockear: repositorios, servicios externos (Stripe, FCM, Twilio, Redis, Google Maps)
// ✅ Usar: factories de datos (src/testing/factories/)
// ✗ NUNCA: conectar a BD real, hacer llamadas HTTP reales

// Ejemplo correcto
const repo     = createMock<TripRepository>();
const stripe   = createMock<StripeAdapter>();
const service  = new TripService(repo, stripe);
```

### Integration tests — qué usar

```typescript
// En integration tests:
// ✅ Usar: Testcontainers (PostgreSQL real, Redis real)
// ✅ Usar: Supertest para llamadas HTTP al servidor Fastify
// ✅ Verificar: comportamiento end-to-end de routes → BD
// ✅ Usar: datos de seed reales (factories que insertan en BD)
// ✅ Incluir: al menos un test E2E del flujo completo del módulo (onboarding, ciclo de vida, etc.)
// ✗ NUNCA: mocks de la BD en integration tests
```

### E2E / Smoke tests — Playwright

```typescript
// Solo para flujos críticos:
// - Happy path completo de un viaje (ver PLAN_TDD_SDD.md)
// - Login de admin
// - Pago con tarjeta de prueba Stripe
// Los tags @smoke deben correr en < 5 minutos en CI
```

---

## Ubicación de archivos de testing

```
src/testing/
├── factories/           ← Generan datos de prueba consistentes
│   ├── trip.factory.ts
│   ├── driver.factory.ts
│   └── user.factory.ts
├── mocks/               ← Mocks de servicios externos
│   ├── stripe.mock.ts
│   ├── maps.mock.ts
│   └── fcm.mock.ts
└── helpers/             ← Utilidades para tests
    ├── create-test-user.ts
    └── generate-test-token.ts
```

---

## Patrones de test

### Aserciones de BusinessError (patrón obligatorio)

`BusinessError` tiene `code` como propiedad separada de `message`. Jest compara `toThrow` por mensaje, no por código — esto genera falsos negativos silenciosos cuando se usa un mensaje personalizado.

```typescript
// ❌ MAL — compara por message, falla si el servicio usa mensaje personalizado
await expect(svc.doSomething()).rejects.toThrow(new BusinessError('DRIVER_NOT_FOUND'));

// ✅ BIEN — compara por la propiedad code, independiente del mensaje
await expect(svc.doSomething()).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
```

**Regla:** Todo test que verifique un error de dominio DEBE usar `.rejects.toMatchObject({ code: 'ERROR_CODE' })`.

---

### Factory de datos

```typescript
// src/testing/factories/trip.factory.ts
export const TripFactory = {
  build: (overrides?: Partial<Trip>): Trip => ({
    id:          uuid(),
    passengerId: uuid(),
    status:      TripStatus.REQUESTED,
    originLat:   19.432608,
    originLng:   -99.133209,
    destLat:     19.427023,
    destLng:     -99.167735,
    ...overrides,
  }),

  // Para integration tests — inserta en BD
  create: async (trx: Knex, overrides?: Partial<Trip>): Promise<Trip> => {
    const data = TripFactory.build(overrides);
    const [trip] = await trx('trips').insert(data).returning('*');
    return trip;
  },
};
```

### Test de estado de la máquina de estados

```typescript
describe('TripStateMachine — transitions', () => {
  it('should transition DRIVER_ARRIVED → IN_PROGRESS', async () => {
    // Arrange
    const trip = TripFactory.build({ status: TripStatus.DRIVER_ARRIVED });
    tripRepo.findByIdForUpdate.mockResolvedValue(trip);

    // Act
    const result = await stateMachine.transition(trip.id, TripEvent.START_TRIP, actorId);

    // Assert
    expect(result.status).toBe(TripStatus.IN_PROGRESS);
    expect(result.startedAt).toBeDefined();
    expect(tripRepo.updateStatus).toHaveBeenCalledWith(
      trip.id,
      TripStatus.IN_PROGRESS,
      expect.objectContaining({ startedAt: expect.any(Date) })
    );
    expect(historyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId:     trip.id,
        fromStatus: TripStatus.DRIVER_ARRIVED,
        toStatus:   TripStatus.IN_PROGRESS,
      })
    );
  });

  it('should throw INVALID_TRIP_TRANSITION for COMPLETED → ACCEPTED', async () => {
    const trip = TripFactory.build({ status: TripStatus.COMPLETED });
    tripRepo.findByIdForUpdate.mockResolvedValue(trip);

    await expect(
      stateMachine.transition(trip.id, TripEvent.ACCEPT_TRIP, actorId)
    ).rejects.toThrow(BusinessErrors.INVALID_TRIP_TRANSITION);
  });
});
```

### Test del motor de precios

```typescript
describe('PricingEngine', () => {
  describe('factor application order', () => {
    it('should apply fixed → percentage → multiplier in order', () => {
      const tripType = TripTypeFactory.build({
        baseFare:       50.00,
        costPerKm:      10.00,
        costPerMinute:  1.00,
        minFare:        40.00,
      });

      const factors = [
        { type: 'multiplier',   value: 1.20 },  // +20%
        { type: 'fixed_amount', value: 15.00 }, // +$15
        { type: 'percentage',   value: 0.10 },  // +10%
      ];

      // subtotal base = 50 + (5km × 10) + (10min × 1) = 110
      // + fixed:       110 + 15 = 125
      // + percentage:  125 × 1.10 = 137.50
      // × multiplier:  137.50 × 1.20 = 165
      // + IVA 16%:     165 × 1.16 = 191.40

      const result = pricingEngine.calculate(tripType, 5, 10, factors);

      expect(result.fare).toBe(165.00);
      expect(result.taxAmount).toBeCloseTo(26.40, 2);
      expect(result.total).toBeCloseTo(191.40, 2);
    });
  });
});
```

---

## Comandos de testing

```bash
npm run test                    # Unit tests
npm run test:watch              # Watch mode para desarrollo
npm run test:integration        # Integration tests (requiere Docker)
npm run test:coverage           # Reporte HTML de cobertura
npm run e2e                     # E2E completo
npm run e2e:headed              # E2E con browser visible (debug)
npm run agent:verify:quick      # Unit tests + @smoke (< 30 seg)
npm run agent:verify            # Verificación completa antes de PR
```

---

## Qué NO hacer en tests

```
✗ Mocks de la BD en integration tests
✗ Tests que dependen del orden de ejecución
✗ Tests con datos hardcodeados (usar factories)
✗ Tests que duermen con setTimeout (usar jest.useFakeTimers)
✗ Tests que hacen llamadas reales a Stripe, FCM, Twilio (usar mocks)
✗ Marcar un módulo como completo sin correr npm run agent:verify:quick
✗ Ignorar tests fallidos "por ahora"
✗ toThrow(new BusinessError('CODE')) — usar toMatchObject({ code: 'CODE' }) (ver patrón de aserciones)
✗ Módulo FEATURE aprobado sin test E2E del flujo completo
```
