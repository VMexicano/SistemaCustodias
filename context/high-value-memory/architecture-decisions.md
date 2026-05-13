# Architecture Decisions — Memorias de Alto Valor

Síntesis de decisiones no-obvias. Las ADRs completas están en `docs/13_decisions_log.md`.

---

## Aprobación: obligatoria, no configurable

**Contexto:** `custody-orders` — transición DRAFT → PENDING_APPROVAL
**Decisión:** Toda orden SIEMPRE pasa por aprobación de supervisor. No hay flag `skip_approval`.
**Por qué:** Requisito legal del transporte de valores en México — no es una feature de UX.
**Aplicar cuando:** Alguien proponga hacer la aprobación opcional. Rechazar.

---

## CREW_CONFIRMED: requiere dos confirmaciones, no una

**Contexto:** `custody-orders` — transición ASSIGNED → CREW_CONFIRMED
**Decisión:** El estado cambia solo cuando custodio Y copiloto confirman individualmente.
**Por qué:** Estándar de seguridad — ninguna persona actúa sola en transporte de valores.
**Aplicar cuando:** Implementes `/orders/:id/confirm-crew` — necesitas tracking de quién confirmó.

---

## custody_snapshot: se genera en IN_TRANSIT, no antes

**Contexto:** `custody-orders` — transición AT_PICKUP → IN_TRANSIT
**Decisión:** El snapshot se genera en este momento exacto y es inmutable desde entonces.
**Por qué:** Es la "foto" del estado cuando el cargo cambia de manos — evidencia legal.
**Aplicar cuando:** Alguien proponga generarlo en APPROVED o ASSIGNED. No — debe ser IN_TRANSIT.

---

## pricing_snapshot: se congela en APPROVED, no al crear la orden

**Contexto:** `custody-orders` — transición PENDING_APPROVAL → APPROVED
**Decisión:** El precio se calcula y congela cuando el supervisor aprueba.
**Por qué:** El precio acordado es el de aprobación — no puede cambiar después.
**Aplicar cuando:** Se calcule el precio. No recalcular en estados posteriores.

---

## Tipos de custodia: JSONB schema, no columnas por tipo

**Contexto:** `value-declaration` — campo `declared_value`
**Decisión:** El schema de `declared_value` se valida contra `custody_types.value_declaration_schema`.
**Por qué:** Agregar un tipo = solo un INSERT, sin migraciones de schema.
**Aplicar cuando:** Alguien proponga agregar columna específica por tipo. Usar JSONB.

---

## order_transitions: solo INSERT, nunca UPDATE

**Contexto:** `compliance` — cadena de custodia
**Decisión:** Los registros de `order_transitions` son inmutables. Nunca UPDATE ni DELETE.
**Por qué:** Son evidencia legal. Modificarlos invalida la trazabilidad regulatoria.
**Aplicar cuando:** Necesites "corregir" una transición. Insertar una nueva con notas.

---

## Soft delete: deleted_at en toda entidad, nunca DELETE

**Contexto:** Todo el codebase
**Decisión:** Toda eliminación = `UPDATE SET deleted_at = NOW()`. Nunca `DELETE FROM`.
**Por qué:** Los registros históricos deben mantenerse para auditorías regulatorias.
**Aplicar cuando:** Implementes cualquier operación de "eliminar". Siempre soft delete.
