# Steering — Estándares de Código
> Convenciones y patrones obligatorios para todo el codebase.
> Actualizado: 2026-05-13

---

## Reglas absolutas (nunca violar)

```
✗ NUNCA usar `any` en TypeScript
✗ NUNCA hacer DELETE en BD — siempre soft delete (deleted_at)
✗ NUNCA reescribir custody_snapshot o pricing_snapshot después de generados
✗ NUNCA ejecutar efectos secundarios dentro de una transacción DB
✗ NUNCA hacer transiciones de estado sin SELECT FOR UPDATE
✗ NUNCA saltarse la validación de roles en un endpoint protegido
```

---

## Patrón de módulo (siempre este orden)

```
{módulo}.routes.ts        → registra rutas, define schemas de request/response
{módulo}.controller.ts    → extrae datos del request, llama al service, devuelve response
{módulo}.service.ts       → lógica de negocio, orquesta repository y efectos secundarios
{módulo}.repository.ts    → queries a la BD con Knex — sin lógica de negocio
{módulo}.schemas.ts       → schemas Zod o JSON Schema para validación
{módulo}.types.ts         → interfaces TypeScript del módulo
```

---

## Inyección de dependencias

```typescript
// ✅ Correcto — DI explícita
export function buildOrdersService(db: Knex, queue: Queue): OrdersService {
  const repo = buildOrdersRepository(db);
  return { /* methods */ };
}

// ❌ Incorrecto — importación directa de instancias globales
import { db } from '../db';
```

---

## Transiciones de estado

```typescript
// Patrón obligatorio para toda transición
async function transition(
  orderId: string,
  toStatus: OrderStatus,
  actor: Actor,
  opts?: TransitionOptions
): Promise<CustodyOrder> {
  return db.transaction(async (trx) => {
    // 1. SELECT FOR UPDATE — obligatorio
    const order = await trx('custody_orders').where({ id: orderId }).forUpdate().first();

    // 2. Validar transición
    CustodyStateMachine.validateTransition(order.status, toStatus);

    // 3. Registrar en audit log
    await trx('order_transitions').insert({
      order_id: orderId,
      from_status: order.status,
      to_status: toStatus,
      actor_id: actor.id,
      actor_role: actor.role,
      location: opts?.location ? db.raw('POINT(?,?)', [...]) : null,
      digital_signature: opts?.signature,
      created_at: new Date(),
    });

    // 4. Actualizar estado
    const [updated] = await trx('custody_orders')
      .where({ id: orderId })
      .update({ status: toStatus, updated_at: new Date() })
      .returning('*');

    return updated;
  });
  // 5. Efectos secundarios FUERA de la transacción → BullMQ
}
```

---

## Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos | kebab-case | `custody-orders.service.ts` |
| Variables/funciones | camelCase | `createOrder`, `orderId` |
| Clases/Interfaces | PascalCase | `CustodyOrder`, `OrderStatus` |
| Constantes | UPPER_SNAKE_CASE | `MAX_OTP_ATTEMPTS` |
| Rutas API | kebab-case | `/custody-orders/:id/confirm-crew` |
| Campos BD | snake_case | `custody_type_id`, `deleted_at` |
| Eventos BullMQ | kebab-case | `send-notification`, `check-geofence` |

---

## Manejo de errores

```typescript
// Errores de dominio — siempre con códigos de negocio
throw new AppError('INVALID_TRANSITION', 400, `Cannot transition from ${from} to ${to}`);
throw new AppError('CREW_INCOMPLETE', 422, 'Both custodio and copiloto must be assigned');
throw new AppError('SIGNATURE_REQUIRED', 422, 'Digital signature is required for this transition');

// El error handler de Fastify convierte AppError → HTTP response estructurado
{ "error": "INVALID_TRANSITION", "message": "...", "statusCode": 400 }
```

---

## Validación de datos

- **Entrada de request:** Zod schemas en `{módulo}.schemas.ts`
- **value_declaration:** JSON Schema validation contra `custody_types.value_declaration_schema`
- **Regla:** Validar en la frontera del sistema (controller) — no en el repository

---

## Queries con Knex

```typescript
// ✅ Correcto
const orders = await db('custody_orders')
  .where({ client_id: clientId, deleted_at: null })
  .orderBy('created_at', 'desc')
  .limit(20)
  .offset(page * 20);

// ❌ Incorrecto — lógica de negocio en el repository
// ❌ Incorrecto — SQL raw innecesario cuando Knex lo cubre
```

---

## Soft delete

```typescript
// ✅ Siempre soft delete
await db('operators').where({ id }).update({ deleted_at: new Date() });

// ❌ Nunca
await db('operators').where({ id }).delete();

// ✅ Siempre filtrar en queries
.where({ deleted_at: null })
```
