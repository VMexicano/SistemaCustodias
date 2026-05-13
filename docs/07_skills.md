# Skills — Habilidades del Agente de Desarrollo

## Propósito

Define qué puede y debe hacer el agente de desarrollo en este proyecto, cómo debe trabajar, y cuáles son sus límites.

---

## Habilidades Técnicas Requeridas

### Backend
- TypeScript estricto — sin `any`, interfaces bien definidas
- Fastify — routes, plugins, hooks, error handling
- Knex — query builder, migraciones, transacciones con `FOR UPDATE`
- BullMQ — definición de colas, workers, manejo de reintentos
- Socket.io — namespaces, rooms, eventos tipados
- Zod — esquemas de validación, inferencia de tipos

### Testing
- Jest — unit tests con mocks, spies, factories
- Supertest — integration tests de endpoints HTTP
- Testcontainers — PostgreSQL real en integration tests
- Playwright — E2E local para verificación del agente

### Bases de datos
- SQL con PostgreSQL — queries complejas, índices, CTEs
- TimescaleDB — hypertables, compresión, retención
- Redis — operaciones HSET/HGET, TTL, patrones de keys

### Infraestructura
- Docker y docker-compose
- Variables de entorno con validación
- GitHub Actions — lectura y escritura de workflows

---

## Flujo de Trabajo del Agente

### Antes de implementar cualquier tarea

```
1. Leer context.md — reglas de negocio y decisiones
2. Leer memory.md — estado actual del proyecto
3. Identificar el módulo y su estructura esperada
4. Verificar si hay tests existentes que afecten el cambio
```

### Al implementar

```
1. Crear o modificar archivos siguiendo la estructura definida
2. Seguir el patrón: routes → controller → service → repository
3. Inyectar dependencias — nunca instanciar servicios internamente
4. Manejar todos los errores explícitamente
5. Usar BusinessError para errores de negocio
6. Usar TechnicalError / IntegrationError para errores técnicos
```

### Al finalizar

```
1. Escribir tests del módulo implementado
2. Correr: npm run agent:verify:quick
3. Si hay fallos → diagnosticar con logs → corregir → repetir
4. Actualizar memory.md con el estado nuevo
5. Generar commit con el formato correcto
```

---

## Checklist por Módulo Nuevo

```
[ ] routes.ts — endpoints con validación Zod
[ ] controller.ts — sin lógica de negocio
[ ] service.ts — toda la lógica, dependencias inyectadas
[ ] repository.ts — solo acceso a BD
[ ] schema.ts — tipos Zod de request/response
[ ] types.ts — interfaces TypeScript
[ ] __tests__/[module].service.test.ts
[ ] __tests__/[module].integration.test.ts
[ ] Registrar el módulo en app.ts
[ ] npm run agent:verify:quick pasa
```

---

## Patrones Recurrentes

### Crear endpoint con auth

```typescript
// routes.ts
router.post('/resource', {
  schema:    { body: CreateResourceSchema },
  onRequest: [authenticate, authorize('passenger')],
}, resourceController.create);

// controller.ts
async create(req: FastifyRequest<{ Body: CreateResourceDto }>, reply) {
  const result = await this.resourceService.create(req.user.id, req.body);
  return reply.status(201).send({ success: true, data: result });
}
```

### Transacción de BD con efectos secundarios

```typescript
// service.ts
async doSomething(data: SomeDto): Promise<Result> {
  return await db.transaction(async (trx) => {
    // 1. Leer con lock si hay concurrencia
    const entity = await trx('table').where({ id: data.id }).forUpdate().first();

    // 2. Validar
    if (!entity) throw BusinessErrors.NOT_FOUND(data.id);

    // 3. Modificar
    const [updated] = await trx('table')
      .where({ id: data.id })
      .update({ ...changes })
      .returning('*');

    // 4. Enqueue efectos secundarios DENTRO de la transacción
    // pero se ejecutan FUERA de ella
    await queue.add('some.job', { id: updated.id });

    // 5. Auditoría
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

### Llamada a servicio externo con Circuit Breaker

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
        return this.fallback(input);
      }
      throw new IntegrationError('service-name', 'ERR_001', 'Error description', error);
    }
  }

  private fallback(input: Input): Output {
    // Degradación controlada
  }
}
```

### Test unitario de servicio

```typescript
describe('SomeService', () => {
  let service:    SomeService;
  let repo:       jest.Mocked<SomeRepository>;
  let eventBus:   jest.Mocked<EventBus>;

  beforeEach(() => {
    repo     = createMock<SomeRepository>();
    eventBus = createMock<EventBus>();
    service  = new SomeService(repo, eventBus);
  });

  it('descripción del comportamiento esperado', async () => {
    // Arrange
    const input    = SomeFactory.build();
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

## Lo que el Agente NO debe hacer

```
✗ Cambiar decisiones de arquitectura sin actualizar context.md
✗ Usar any en TypeScript
✗ Poner lógica de negocio en controllers o routes
✗ Hacer SQL directo sin Knex
✗ Hardcodear secrets o configuración
✗ Borrar registros con DELETE (usar soft delete)
✗ Modificar migraciones ya aplicadas
✗ Ignorar errores de servicios externos (siempre manejar)
✗ Ejecutar efectos secundarios dentro de transacciones de BD
✗ Recalcular pricing_snapshot después de completar un viaje
✗ Crear PR sin tests
✗ Marcar una tarea como completa sin pasar los tests
```

---

## Comandos de Referencia Rápida

```bash
# Desarrollo
npm run dev                     # API en modo watch
docker-compose up -d            # Levantar todos los servicios
npm run db:migrate              # Correr migraciones pendientes
npm run db:seed                 # Poblar BD con datos de prueba
npm run db:rollback             # Revertir última migración

# Testing
npm run test                    # Unit tests
npm run test:integration        # Integration tests (requiere Docker)
npm run test:coverage           # Con reporte de cobertura
npm run test:watch              # Watch mode para desarrollo
npm run e2e                     # E2E completo
npm run e2e:headed              # E2E con browser visible
npm run agent:verify:quick      # Verificación rápida del agente
npm run agent:verify            # Verificación completa

# Observabilidad
open http://localhost:3002       # Bull Board — colas
open http://localhost:3003       # Grafana — métricas
open http://localhost:16686      # Jaeger — trazas
```
