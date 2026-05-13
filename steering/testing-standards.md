# Steering — Estándares de Testing
> Estrategia, herramientas, umbrales de cobertura y patrones de test.
> Actualizado: 2026-05-13

---

## Umbrales de cobertura (obligatorios)

| Módulo | Líneas | Branches | Notas |
|---|---|---|---|
| `CustodyStateMachine` | **100%** | **100%** | Toda transición válida e inválida |
| `AlertEngine` | **95%** | **90%** | Incluir botón de pánico y dedup |
| `PricingEngine` | **100%** | **100%** | Toda combinación de tipo + distancia |
| `compliance/chain-of-custody` | **90%** | **85%** | Generación de reportes |
| Global | **75%** | **70%** | Mínimo aceptable |

---

## Herramientas

| Herramienta | Uso |
|---|---|
| Jest | Test runner principal |
| Testcontainers | PostgreSQL real en tests de integración |
| Supertest | HTTP tests del API |
| faker-js | Generación de datos de prueba |
| factory functions | Crear entidades de test consistentes |

---

## Estructura de tests

```
apps/api/tests/
  unit/
    custody-state-machine.test.ts   ← 100% cobertura
    alert-engine.test.ts
    pricing-engine.test.ts
    geofence.utils.test.ts
  integration/
    orders/
      create-order.test.ts
      approve-order.test.ts
      assign-crew.test.ts
      transition-to-in-transit.test.ts   ← firma + custody_snapshot
      deliver-order.test.ts              ← firma + chain of custody
    auth/
      otp-flow.test.ts
    alerts/
      panic-button.test.ts
      geofence-violation.test.ts
  factories/
    order.factory.ts
    operator.factory.ts
    client.factory.ts
```

---

## Patrón de factory functions

```typescript
// factories/order.factory.ts
export function makeOrder(overrides?: Partial<CustodyOrder>): CustodyOrder {
  return {
    id: faker.string.uuid(),
    order_number: `CST-${faker.number.int({ min: 1000, max: 9999 })}`,
    client_id: faker.string.uuid(),
    custody_type_id: faker.string.uuid(),
    status: 'DRAFT',
    pickup_address: makeAddress(),
    delivery_address: makeAddress(),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}
```

---

## Tests de integración — patrón

```typescript
describe('POST /orders/:id/approve', () => {
  let container: StartedPostgreSqlContainer;
  let db: Knex;
  let app: FastifyInstance;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    db = knex({ client: 'pg', connection: container.getConnectionUri() });
    await runMigrations(db);
    app = buildApp(db);
  });

  afterAll(async () => {
    await db.destroy();
    await container.stop();
  });

  it('transitions PENDING_APPROVAL → APPROVED and creates audit log entry', async () => {
    const order = await createOrder(db, { status: 'PENDING_APPROVAL' });
    const supervisor = await createUser(db, { role: 'supervisor' });
    const token = signJwt({ sub: supervisor.id, role: 'supervisor' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/orders/${order.id}/approve`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('APPROVED');

    const transition = await db('order_transitions')
      .where({ order_id: order.id, to_status: 'APPROVED' })
      .first();
    expect(transition).toBeDefined();
    expect(transition.actor_id).toBe(supervisor.id);
  });
});
```

---

## CustodyStateMachine tests — patrón

```typescript
describe('CustodyStateMachine', () => {
  describe('validateTransition', () => {
    // Transiciones válidas
    it.each([
      ['DRAFT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['APPROVED', 'ASSIGNED'],
      // ... todas las transiciones válidas
    ])('allows %s → %s', (from, to) => {
      expect(() => CustodyStateMachine.validateTransition(from, to)).not.toThrow();
    });

    // Transiciones inválidas
    it.each([
      ['DRAFT', 'APPROVED'],           // no puede saltarse PENDING_APPROVAL
      ['COMPLETED', 'CANCELLED'],      // estado final
      ['DELIVERED', 'IN_TRANSIT'],     // no puede retroceder
      // ... todos los casos inválidos
    ])('rejects %s → %s', (from, to) => {
      expect(() => CustodyStateMachine.validateTransition(from, to))
        .toThrow('INVALID_TRANSITION');
    });
  });
});
```

---

## Reglas de testing

1. **Nunca mockear la BD** — siempre Testcontainers con PostgreSQL real
2. **Tests de integración aislados** — cada test limpia su propio estado con `beforeEach`
3. **Factories para datos** — nunca crear datos inline en el test
4. **Un test = una aserción principal** — puede tener aserciones secundarias de audit log
5. **Correr solo el módulo** — `jest --testPathPattern={módulo}` salvo indicación explícita
6. **Si falla → leer output completo** — sin head, sin tail
