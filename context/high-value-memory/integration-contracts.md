# Integration Contracts — Memorias de Alto Valor

Contratos no-obvios entre módulos — lo que no se puede inferir solo del código.

---

## custody-orders → notifications: transición dispara job, no llamada directa

**Contexto:** Toda transición de estado en `custody-orders`
**Contrato:** La transición hace commit en BD, LUEGO agrega job a `notificationsQueue`.
**Por qué:** Las notificaciones son efectos secundarios fuera de transacción — si el job falla, la transición ya ocurrió.
**Aplicar cuando:** Implementes una nueva transición. Nunca `notificationsService.send()` dentro de `db.transaction()`.

---

## custody-orders → tracking: solo órdenes activas reciben lecturas

**Contexto:** `POST /tracking/location`
**Contrato:** El endpoint acepta lecturas solo si la orden está en `EN_ROUTE_TO_PICKUP` o `IN_TRANSIT`. Cualquier otro estado → 200 OK pero se descarta silenciosamente.
**Por qué:** Evitar lecturas históricas que contaminen el tracking activo.
**Aplicar cuando:** Implementes el endpoint de tracking o el cliente mobile.

---

## alerts → custody-orders: `panic` cambia el estado automáticamente

**Contexto:** `AlertEngine.createAlert()` con tipo `panic`
**Contrato:** Al crear una alerta de tipo `panic`, el `AlertEngine` automáticamente llama la transición `IN_TRANSIT → INCIDENT` en la orden. El cliente no necesita hacer dos requests.
**Por qué:** La alerta de pánico debe ser atómica — una acción del operador, un efecto coordinado.
**Aplicar cuando:** Consumas el endpoint `POST /alerts` desde la app mobile. Un solo request.

---

## compliance → order_transitions: solo lectura, nunca escribe

**Contexto:** Módulo `compliance` — generación de reportes
**Contrato:** El módulo `compliance` solo lee de `order_transitions` — nunca inserta ni modifica.
**Por qué:** Las transiciones las escribe `custody-orders` — compliance es un lector de evidencias.
**Aplicar cuando:** Implementes el módulo compliance. No tiene writes a order_transitions.

---

## value-declaration → custody-orders: declaración se referencia, no se embebe

**Contexto:** Tabla `custody_orders.custody_snapshot`
**Contrato:** El snapshot incluye el `declared_value` copiado desde `value_declarations` en el momento de IN_TRANSIT. La tabla `value_declarations` sigue siendo la fuente viva.
**Por qué:** El snapshot es una copia inmutable del estado en el momento del pickup.
**Aplicar cuando:** Generes el `custody_snapshot`. Copiar el `declared_value`, no solo referenciar el ID.
