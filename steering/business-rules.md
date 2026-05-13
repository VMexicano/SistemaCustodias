# Steering — Reglas de Negocio

> Estas reglas son CRÍTICAS. Violarlas produce bugs de negocio graves (pagos incorrectos,
> doble asignación de conductores, pérdida de datos de auditoría).
> Leer completo antes de implementar cualquier módulo.
> Fuente: docs/05_context.md

---

## Reglas de Viajes

### R-TRIP-001 — Un pasajero, un viaje activo
```
Un pasajero NO puede tener dos viajes activos simultáneamente.
Verificar antes de crear un viaje: SELECT FROM trips WHERE passenger_id = ? AND status NOT IN (estados terminales)
Si ya hay uno activo → lanzar BusinessError PASSENGER_HAS_ACTIVE_TRIP
```

### R-TRIP-002 — Trip stacking: máximo 2 viajes por conductor (Sprint 16)
```
Un conductor puede aceptar un segundo viaje (stacking) SOLO si:
  1. Ya tiene un viaje en estado IN_PROGRESS
  2. El viaje activo tiene ≤10 minutos estimados restantes
  3. No tiene ya 2 viajes (activeTrip + queuedTrip)

Si el conductor ya tiene 2 viajes → DRIVER_TRIP_QUEUE_FULL (409)
Si el viaje activo tiene >10 min restantes → DRIVER_NOT_NEAR_COMPLETION (409)
Si el conductor no tiene ningún viaje activo y acepta uno → flujo normal (DRIVER_HAS_ACTIVE_TRIP obsoleto)

El segundo viaje (queuedTrip) se promueve a activeTrip al completar el primero.
```

### R-TRIP-003 — Historial de estados inmutable
```
Toda transición de estado DEBE registrarse en trip_status_history.
Este registro nunca se modifica ni elimina. Es append-only.
```

### R-TRIP-004 — pricing_snapshot inmutable (ADR-009)
```
El pricing_snapshot en trips se escribe UNA SOLA VEZ al completarse el viaje.
NUNCA se recalcula después. Es la fuente de verdad del precio cobrado.
Cualquier query que lo actualice es un BUG.
```

### R-TRIP-005 — Concurrencia con SELECT FOR UPDATE (ADR-008)
```
Toda transición de estado de un viaje usa SELECT FOR UPDATE dentro de una
transacción PostgreSQL para evitar race conditions.
Patrón obligatorio:
  await trx('trips').where({ id }).forUpdate().first()
```

### R-TRIP-006 — Efectos secundarios fuera de transacciones
```
Los efectos secundarios (enqueue a BullMQ, llamadas a Stripe, push notifications)
se encolan DENTRO de la transacción pero se EJECUTAN FUERA de ella.
Nunca hacer llamadas HTTP o a servicios externos dentro de un trx().
```

---

## Reglas de Conductores

### R-DRV-001 — Sin documentos = sin operar
```
Un conductor NO puede ponerse online sin todos los documentos requeridos aprobados.
Verificar: todos los driver_documents con required=true tienen status='approved'.
```

### R-DRV-002 — Documento vencido durante viaje activo
```
Si un documento vence mientras el conductor tiene un viaje activo:
  1. El conductor TERMINA el viaje normalmente (no interrumpir)
  2. DESPUÉS de completarse el viaje → suspender automáticamente al conductor
  3. NO suspender en medio del viaje
```

### R-DRV-003 — Aprobación automática
```
Cuando TODOS los documentos requeridos (required=true) están aprobados:
  → drivers.status cambia automáticamente a 'approved'
No requiere intervención manual del admin para este cambio de estado.
```

### R-DRV-004 — online solo si approved
```
drivers.online solo puede ser true si drivers.status = 'approved'.
Al suspender un conductor → online = false automáticamente.
```

---

## Reglas de Precios

### R-PRICE-001 — Precio mínimo garantizado
```
El precio NUNCA puede ser menor al min_fare del tipo de viaje.
fare = MAX(calculated_fare, trip_type.min_fare)
```

### R-PRICE-002 — IVA sobre subtotal
```
El IVA se calcula sobre el subtotal del viaje, NO sobre la tarifa base.
tax_amount = fare_subtotal × region_config.tax_rate
```

### R-PRICE-003 — Orden de aplicación de factores
```
Los factores de precio se aplican en este orden EXACTO:
  1. fixed_amount  → suma al subtotal base
  2. percentage    → calcula sobre el subtotal actualizado
  3. multiplier    → multiplica el resultado acumulado
No alterar este orden.
```

### R-PRICE-004 — Factores no-stackable
```
Cuando stackable=false, solo se aplica el factor con mayor priority.
Cuando stackable=true, se aplican todos los factores activos de ese tipo.
```

---

## Reglas de Pagos

### R-PAY-001 — Cobro async, estado no revierte
```
Los cobros se ejecutan en BullMQ, FUERA de la transacción de BD.
Si Stripe falla, el viaje ya está en COMPLETED — NO revertir el estado del viaje.
El estado del viaje y el estado del pago son independientes.
```

### R-PAY-002 — Reintentos y escalación
```
Si Stripe falla:
  → Reintentar hasta 3 veces con backoff exponencial
  → Después de 3 fallos → registrar en system_error_logs (resolved=false)
  → Escalar a revisión manual del admin
```

### R-PAY-003 — Sin números de tarjeta
```
NUNCA almacenar números de tarjeta completos.
Solo almacenar el provider_method_id de Stripe (pm_xxxxx).
El cobro siempre se hace a través de Stripe con este ID.
```

---

## Reglas de Datos

### R-DATA-001 — Soft delete siempre
```
NUNCA usar DELETE en registros de negocio.
Usar soft delete: deleted_at = NOW()
NULL en deleted_at significa registro activo.
```

### R-DATA-002 — Audit log para cambios de entidades
```
Todo cambio en entidades de negocio (viajes, conductores, pagos, documentos)
DEBE registrarse en audit_logs.
El registro es append-only — nunca se modifica.
```

### R-DATA-003 — GPS en TimescaleDB con TTL 90 días
```
Los puntos GPS se guardan en trip_locations (TimescaleDB).
Retención automática: 90 días.
El GPS se envía al servidor cada 3-5 segundos.
El flush a TimescaleDB se hace en batch cada 30 segundos.
```

### R-DATA-004 — UUIDs como primary keys
```
Todas las tablas usan UUID generado con gen_random_uuid().
NUNCA usar autoincremental (SERIAL / BIGSERIAL).
```

### R-DATA-005 — Timestamps siempre con zona horaria
```
Todos los timestamps son TIMESTAMPTZ (con zona horaria), almacenados en UTC.
NUNCA usar TIMESTAMP sin zona horaria.
```

### R-DATA-006 — factor_value en trip_applied_factors
```
trip_applied_factors.factor_value guarda el valor vigente EN EL MOMENTO del viaje,
no una FK al valor actual de pricing_factors.
Esto garantiza que el historial sea inmutable aunque el admin cambie el factor después.
```

---

## Catálogo de BusinessErrors

Los errores de negocio se lanzan con `BusinessError`. Errores técnicos con `TechnicalError`.

```typescript
// Viajes
PASSENGER_HAS_ACTIVE_TRIP      // R-TRIP-001
DRIVER_TRIP_QUEUE_FULL         // R-TRIP-002: conductor ya tiene 2 viajes (stacking)
DRIVER_NOT_NEAR_COMPLETION     // R-TRIP-002: viaje activo tiene >10 min restantes
INVALID_TRIP_TRANSITION        // Transición no permitida en la state machine
TRIP_NOT_FOUND
TRIP_APPROVAL_NOT_PENDING      // Intento de aprobar/rechazar viaje que no está en PENDING_APPROVAL

// Auth
PHONE_ALREADY_REGISTERED
PHONE_BANNED
USER_NOT_FOUND
USER_SUSPENDED
OTP_INVALID
OTP_EXPIRED
TOKEN_INVALID
TOKEN_EXPIRED

// Conductores
DRIVER_NOT_APPROVED            // R-DRV-001
DOCUMENTS_EXPIRED              // R-DRV-001
DRIVER_NOT_FOUND

// Pagos
PAYMENT_NOT_FOUND
PAYMENT_ALREADY_PROCESSED      // Idempotencia

// Precios
FARE_BELOW_MINIMUM             // R-PRICE-001
```
