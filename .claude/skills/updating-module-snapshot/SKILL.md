---
name: updating-module-snapshot
description: Update a module's snapshot file in context/snapshots/ to reflect the current implementation state. Use after completing or partially completing a module, after QA approves a module, or at session end. Keeps the snapshot accurate so future sessions and agents load correct context about what has been built.
---

Snapshots are the memory of the project. An inaccurate snapshot means the next agent starts with a wrong mental model — it might re-implement something that exists, or skip something that's broken. Update them immediately when state changes.

## Snapshot File Location

```
context/snapshots/{module}.snapshot.md
```

Where `{module}` is one of: `auth`, `trips`, `pricing`, `payments`, `drivers`, `tracking`, `notifications`, `admin`, `infra`.

## Status Values

| Symbol | Estado | When to use |
|---|---|---|
| 🔲 | No iniciado | Nothing implemented yet |
| 🔄 | En progreso | Partially implemented — some files exist |
| ✅ | Completo | All files, all tests, QA approved |
| ⚠️ | Bloqueado | Can't proceed — missing dependency, unresolved decision |

## Fields to Update

When updating a snapshot after work is done:

1. **Estado** — change to reflect current reality
2. **% Implementación** — estimate based on files completed vs total files needed
3. **% Cobertura** — update from `npm run test:coverage` output, or "N/A" if no tests yet
4. **Última actualización** — today's date in YYYY-MM-DD format
5. **Archivos existentes** — add any new files created this session
6. **Completado** — mark items done with `[x]`
7. **Pendiente** — remove items that are now done, keep what remains

## Snapshot Format Reference

```markdown
# Snapshot — {Module}

**Estado:** 🔄 En progreso
**% Implementación:** 60%
**% Cobertura:** 82% lines / 74% branches
**Última actualización:** 2026-04-04

## Archivos existentes
- src/modules/{module}/routes.ts
- src/modules/{module}/controller.ts
- src/modules/{module}/service.ts
- src/modules/{module}/repository.ts
- src/modules/{module}/__tests__/{module}.service.test.ts

## Completado
- [x] routes.ts con validación Zod
- [x] controller.ts
- [x] service.ts — lógica principal
- [x] repository.ts

## Pendiente
- [ ] __tests__/{module}.integration.test.ts
- [ ] Cobertura al umbral requerido (75% global)
- [ ] Audit logs en service.ts

## Notas técnicas
{Any non-obvious implementation decisions, known issues, or warnings for the next agent}
```

## When to Update

- After backend agent completes implementation → update to 🔄, list new files
- After QA agent approves → update to ✅, add final coverage numbers
- After discovering a blocker → update to ⚠️, describe the blocker in Notas técnicas
- At session end → verify all snapshots reflect what was actually built this session

## Creating a New Snapshot

If the module doesn't have a snapshot yet, create the file with all fields initialized:

```markdown
# Snapshot — {Module}

**Estado:** 🔲 No iniciado
**% Implementación:** 0%
**% Cobertura:** N/A
**Última actualización:** {today}

## Archivos existentes
(ninguno)

## Completado
(ninguno)

## Pendiente
- [ ] routes.ts
- [ ] controller.ts
- [ ] service.ts
- [ ] repository.ts
- [ ] schema.ts
- [ ] types.ts
- [ ] __tests__/{module}.service.test.ts
- [ ] __tests__/{module}.integration.test.ts

## Notas técnicas
(ninguna)
```
