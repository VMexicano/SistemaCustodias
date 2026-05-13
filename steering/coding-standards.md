# Steering — Estándares de Código

> Convenciones y patrones obligatorios para todo el codebase.
> Fuentes: docs/04_structure.md · docs/07_skills.md

---

## Nomenclatura

| Tipo | Convención | Ejemplo |
|---|---|---|
| Archivos | kebab-case | `trip-state-machine.ts` |
| Clases | PascalCase | `TripStateMachine` |
| Funciones / métodos | camelCase | `calculateFare` |
| Constantes | UPPER_SNAKE_CASE | `VALID_TRANSITIONS` |
| Interfaces / types | PascalCase | `Trip`, `CreateTripDto` |
| Enums | PascalCase | `TripStatus` |
| Variables de entorno | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Tablas de BD | snake_case | `trip_status_history` |

---

## Estructura de módulo (patrón obligatorio)

Cada módulo del API tiene exactamente estos archivos:

```
src/modules/{module}/
├── {module}.routes.ts       ← solo mapeo de endpoints + validación Zod
├── {module}.controller.ts   ← recibe request, llama service, retorna response
├── {module}.service.ts      ← TODA la lógica de negocio, dependencias inyectadas
├── {module}.repository.ts   ← solo acceso a BD con Knex, sin lógica
├── {module}.schema.ts       ← tipos Zod de request y response
├── {module}.types.ts        ← interfaces TypeScript del módulo
└── __tests__/
    ├── {module}.service.test.ts       ← unit tests (mocks)
    └── {module}.integration.test.ts   ← integration tests (BD real)
```

---

## Patrones de código obligatorios

### Endpoint con autenticación

```typescript
// routes.ts — solo mapeo, sin lógica
router.post('/trips', {
  schema:    { body: CreateTripSchema },
  onRequest: [authenticate, authorize('passenger')],
}, tripController.create);

// controller.ts — sin lógica de negocio
async create(req: FastifyRequest<{ Body: CreateTripDto }>, reply) {
  const trip = await this.tripService.create(req.user.id, req.body);
  return reply.status(201).send({ success: true, data: { trip } });
}

// service.ts — TODA la lógica aquí
async create(passengerId: string, dto: CreateTripDto): Promise<Trip> {
  // validaciones de negocio
  // orquestación de repositorios
  // emisión de eventos
}

// repository.ts — solo BD, sin lógica
async create(data: CreateTripData): Promise<Trip> {
  const [trip] = await db('trips').insert(data).returning('*');
  return trip;
}
```

### Transacción con efectos secundarios

```typescript
// service.ts
async doSomething(data: SomeDto): Promise<Result> {
  return await db.transaction(async (trx) => {
    // 1. Leer con lock si hay concurrencia
    const entity = await trx('table').where({ id: data.id }).forUpdate().first();

    // 2. Validar con BusinessError
    if (!entity) throw BusinessErrors.NOT_FOUND(data.id);

    // 3. Modificar
    const [updated] = await trx('table')
      .where({ id: data.id })
      .update({ ...changes, updated_at: new Date() })
      .returning('*');

    // 4. Efectos secundarios — encolar DENTRO de la trx, ejecutan FUERA
    await queue.add('some.job', { id: updated.id });

    // 5. Auditoría siempre
    await trx('audit_logs').insert({
      entity_type: 'table',
      entity_id:   data.id,
      action:      'updated',
      actor_type:  'user',
      actor_id:    data.actorId,
      new_value:   updated,
    });

    return updated;
  });
}
```

### Servicio externo con Circuit Breaker

```typescript
// adapter.ts
export class ExternalServiceAdapter {
  private breaker = createCircuitBreaker(
    this.callService.bind(this),
    { name: 'service-name', timeout: 5_000, errorThreshold: 40 }
  );

  async doCall(input: Input): Promise<Output> {
    try {
      return await this.breaker.fire(input);
    } catch (error) {
      if (error.message === 'Breaker is open') {
        return this.fallback(input);  // Degradación controlada
      }
      throw new IntegrationError('service-name', 'ERR_001', 'Descripción', error);
    }
  }
}
```

### Unit test de servicio (patrón AAA)

```typescript
describe('SomeService', () => {
  let service:  SomeService;
  let repo:     jest.Mocked<SomeRepository>;

  beforeEach(() => {
    repo    = createMock<SomeRepository>();
    service = new SomeService(repo);
  });

  it('descripción del comportamiento esperado', async () => {
    // Arrange
    const input = SomeFactory.build();
    repo.findById.mockResolvedValue(input);

    // Act
    const result = await service.doSomething(input.id);

    // Assert
    expect(result).toMatchObject({ status: 'expected' });
    expect(repo.update).toHaveBeenCalledWith(input.id, expect.any(Object));
  });
});
```

---

## TypeScript — Reglas estrictas

```typescript
// ✅ Correcto
interface CreateTripDto {
  originLat:  number;
  originLng:  number;
  destLat:    number;
  destLng:    number;
  tripTypeId: string;
}

// ✗ NUNCA — any explícito
function doSomething(data: any) { ... }

// ✅ Si necesitas tipo desconocido:
function doSomething(data: unknown) { ... }
```

Configuración `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

## Respuestas de la API — Formato estándar

```typescript
// Éxito
{ "success": true, "data": { ... } }

// Error de negocio (4xx)
{
  "success": false,
  "error": {
    "code": "PASSENGER_HAS_ACTIVE_TRIP",
    "message": "El pasajero ya tiene un viaje activo"
  }
}

// Error de validación (422)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": [{ "field": "phone", "message": "Formato inválido" }]
  }
}
```

---

## Commits (formato convencional)

```
feat(trips):     implementar transición DRIVER_ARRIVED → IN_PROGRESS
fix(pricing):    corregir aplicación de factores stackables
refactor(auth):  extraer validación OTP a método privado
test(state-machine): agregar casos de cancelación tardía
docs(context):   documentar nueva decisión de radio de búsqueda
chore(deps):     actualizar fastify a 4.28.0
```

Formato: `tipo(módulo): descripción en minúsculas, imperativo`

---

## Checklist por módulo nuevo

```
[ ] routes.ts — endpoints con validación Zod, sin lógica
[ ] controller.ts — sin lógica de negocio
[ ] service.ts — lógica completa, dependencias inyectadas
[ ] repository.ts — solo Knex, sin lógica
[ ] schema.ts — tipos Zod de request/response
[ ] types.ts — interfaces TypeScript
[ ] __tests__/{module}.service.test.ts
[ ] __tests__/{module}.integration.test.ts
[ ] Registrar módulo en src/app.ts
[ ] npm run agent:verify:quick pasa
[ ] docs/06_memory.md actualizado
[ ] Sin any en TypeScript
[ ] Sin secrets hardcoded
[ ] Sin DELETE (solo soft delete con deleted_at)
[ ] Audit log para cambios de entidades de negocio
```
