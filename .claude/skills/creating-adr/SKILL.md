---
name: creating-adr
description: Create Architecture Decision Records (ADRs) following the project's format and append them to docs/13_decisions_log.md. Use when the architect agent makes a new technical decision, evaluates technology options, documents a constraint, or produces an API contract for a new module. Generates properly numbered, structured ADR entries that become the authoritative technical reference for backend and mobile agents.
---

ADRs in this project are contracts, not documentation. When the backend agent reads an ADR to implement an endpoint, the request/response types and error codes it contains are not suggestions — they are the spec. Write them with that precision.

## ADR Format

```markdown
## ADR-{NNN} — {Title}

**Fecha:** {YYYY-MM-DD}
**Estado:** Propuesto | Aprobado | Deprecado | Reemplazado por ADR-XXX
**Área:** API | Infra | BD | Mobile | Arquitectura | Seguridad

### Contexto
{2-3 sentences: what problem or decision is this addressing, and why now?}

### Opciones consideradas

| Opción | Pros | Contras | Criterio de revisión |
|---|---|---|---|
| {Opción A} | {ventajas} | {desventajas} | {cuando reconsiderar} |
| {Opción B} | | | |

### Decisión
{The chosen option and why. Be direct: "Se elige X porque Y."}

### Contrato de API (si aplica)

**Endpoint:** {METHOD /path}

**Request:**
```typescript
interface {Name}Request {
  field: Type;  // description
}
```

**Response (200):**
```typescript
interface {Name}Response {
  field: Type;
}
```

**Errores:**
| HTTP | Código interno | Cuándo |
|---|---|---|
| 409 | INVALID_TRIP_TRANSITION | La transición de estado no es válida |
| 404 | TRIP_NOT_FOUND | El trip_id no existe |
| 423 | TRIP_LOCKED | Otro proceso tiene el lock |

### Consecuencias

**Facilita:**
- {what this makes easier}

**Complica:**
- {what this makes harder or introduces as a trade-off}

**Criterio de revisión:**
{Under what conditions should this decision be revisited? Be specific: "Revisit if trip volume exceeds 10k/day and Redis latency > 50ms p99"}

### Flags de irreversibilidad
{List operations that cannot be undone: "pricing_snapshot writes", "migration of X table", or "none"}
```

## Numbering

Read `docs/13_decisions_log.md` and find the highest existing ADR number. Increment by one.

```bash
grep "^## ADR-" docs/13_decisions_log.md | tail -1
# Output: ## ADR-010 — Scheduler con cron + PostgreSQL
# Next ADR: ADR-011
```

## Appending to the Log

After drafting the ADR, append it to `docs/13_decisions_log.md` after the last existing entry. Do not prepend — the log is chronological.

## API Contract Completeness Checklist

An ADR with an API contract is not complete until:

```
□ Endpoint method and path defined
□ Request type with all fields typed (TypeScript interface)
□ Response type with all fields typed
□ All error codes listed with HTTP status + internal code + condition
□ Authentication requirement stated (public | requires JWT | requires role)
□ Rate limit if non-standard (see architecture.md for defaults)
□ irreversible_flags declared if the operation writes pricing_snapshot or triggers migration
```

An incomplete API contract causes rework when the backend agent implements the endpoint and makes assumptions that don't match the mobile agent's expectations. Completeness now prevents two integration cycles later.

## Stack Constraint Check

Before proposing any new technology, verify it against `steering/architecture.md`. If the technology is listed as "not to be used" (e.g., Prisma instead of Knex, Flutter instead of React Native), do not propose it regardless of merit. If there's a compelling reason to deviate, create the ADR documenting the deviation and get human approval before the backend agent starts implementing.
