# Steering — Índice

> Los archivos de steering son resúmenes accionables diseñados para ser
> leídos por agentes al inicio de cada tarea. Son más cortos y directos
> que los docs/ completos. Cuando necesites más detalle, ir a docs/.

---

## Archivos de steering

| Archivo | Propósito | Leer cuando |
|---|---|---|
| `product.md` | Qué construimos, actores, fases, verticales | Antes de una tarea de producto |
| `architecture.md` | Stack inamovible, ADRs, infraestructura | Antes de cualquier decisión técnica |
| `business-rules.md` | Reglas críticas de negocio por dominio | **Siempre — antes de implementar** |
| `coding-standards.md` | Convenciones, patrones de código, checklist | Antes de escribir código |
| `testing-standards.md` | Estrategia, herramientas, umbrales, patrones | Antes de escribir tests |

---

## Relación con docs/

```
steering/              ← Resúmenes para agentes (leer primero)
  product.md           → docs/01_product.md (fuente completa)
  architecture.md      → docs/03_tech.md + docs/13_decisions_log.md
  business-rules.md    → docs/05_context.md
  coding-standards.md  → docs/04_structure.md + docs/07_skills.md
  testing-standards.md → docs/03_tech.md + docs/PLAN_TDD_SDD.md

docs/                  ← Documentación completa de referencia
  06_memory.md         ← Estado vivo del proyecto (actualizar en cada sesión)
  09_api_contracts.md  ← Contratos exactos de la API
  10_data_dictionary.md← Schema completo de BD
  PLAN_TDD_SDD.md      ← Plan de sprints + specs de tests por módulo
```

---

## Flujo de lectura recomendado por rol

### Backend Developer
```
1. steering/business-rules.md      (obligatorio)
2. steering/coding-standards.md    (obligatorio)
3. docs/06_memory.md               (estado actual)
4. docs/09_api_contracts.md        (endpoints a implementar)
5. docs/10_data_dictionary.md      (tablas afectadas)
6. docs/PLAN_TDD_SDD.md            (specs de tests)
```

### Arquitecto
```
1. steering/architecture.md        (decisiones vigentes)
2. docs/13_decisions_log.md        (ADRs completas)
3. docs/05_context.md              (restricciones de contexto)
```

### QA
```
1. steering/testing-standards.md   (umbrales y patrones)
2. steering/business-rules.md      (para identificar casos edge)
3. docs/PLAN_TDD_SDD.md            (specs de tests esperados)
```

### DevOps
```
1. steering/architecture.md        (infraestructura definida)
2. docs/12_environment_setup.md    (entorno de desarrollo)
3. docs/11_runbook.md              (operaciones en producción)
```
