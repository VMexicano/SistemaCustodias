# Snapshot: value-declaration
> Declaración de valores por tipo de custodia — schema dinámico JSONB.
> Última actualización: 2026-05-14 — Sprint 4 ✅ COMPLETADO

## Estado de implementación

| Artefacto | Estado | Cobertura |
|---|---|---|
| `value-declaration.types.ts` | ✅ | — |
| `value-declaration.repository.ts` | ✅ | — |
| `value-declaration.service.ts` | ✅ | 11/11 tests |
| `value-declaration.controller.ts` | ✅ | — |
| `value-declaration.routes.ts` | ✅ | 2 rutas: POST + GET |
| `custody-types.routes.ts` | ✅ | 1 ruta: GET /custody-types |
| `value-declaration.service.test.ts` | ✅ | 11 casos |

Registrado en `app.ts`:
- `app.register(custodyTypesRoutes, { prefix: '/custody-types', valueDeclarationService })`
- `app.register(valueDeclarationRoutes, { prefix: '/orders/:id/value-declaration', valueDeclarationService })`

---

## Archivos principales

```
apps/api/src/modules/value-declaration/
  value-declaration.types.ts
  value-declaration.repository.ts
  value-declaration.service.ts      ← Ajv JSON Schema validation
  value-declaration.controller.ts
  value-declaration.routes.ts
apps/api/src/modules/custody-types/
  custody-types.routes.ts
apps/api/seeds/
  13_custody_test_users.ts          ← client (+525500000099) + supervisor (+525500000098)
apps/api/tests/e2e/smoke/
  custody-order-flow.spec.ts        ← smoke test E2E
```

---

## Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/custody-types` | public (autenticado) | Lista tipos activos con sus schemas |
| `POST` | `/orders/:id/value-declaration` | client, dispatcher | Upsert declaración de valores |
| `GET` | `/orders/:id/value-declaration` | client, dispatcher, supervisor | Ver declaración actual |

---

## Reglas de negocio implementadas

1. Solo se puede declarar si la orden está en `DRAFT` o `PENDING_APPROVAL` (DECLARABLE_STATUSES)
2. El schema de validación viene de `custody_types.value_declaration_schema` (JSONB) para el `custody_type_id` de la orden
3. Un mismo `order_id` puede tener a lo más UNA declaración (upsert via `onConflict('order_id').merge`)
4. Validación via Ajv con `allErrors: true` — lanza `VALIDATION_ERROR` si falla
5. SELECT FOR UPDATE en upsert para prevenir race conditions

---

## Errores de negocio añadidos

| Code | HTTP | Descripción |
|---|---|---|
| `VALUE_DECLARATION_NOT_FOUND` | 404 | GET cuando no existe declaración para la orden |
| `CUSTODY_TYPE_NOT_FOUND` | 404 | El tipo de custodia no existe o no está activo |

---

## Mobile — CustodyClientStack

```
apps/mobile-v2/src/
  stores/custody.store.ts            ← NewOrderDraft + setDraft + clearDraft
  screens/client/
    SelectCustodyTypeScreen.tsx      ← GET /custody-types → FlatList con testIDs
    NewCustodyOrderScreen.tsx        ← Formulario pickup + delivery addresses
    ValueDeclarationScreen.tsx       ← Formulario dinámico desde JSON Schema
  navigation/
    CustodyClientStack.tsx           ← Stack navigator 3 pantallas
    types.ts                         ← CustodyClientStackParamList
```

`auth.store.ts` extendido: `UserRole` ahora incluye `'client' | 'custodio' | 'copiloto'`
`RootNavigator.tsx` rutea `role === 'client'` a `CustodyClientStack`

---

## Tests (Sprint 4)

| Suite | Tests | Estado |
|---|---|---|
| `value-declaration.service.test.ts` | 11 | ✅ |
| `SelectCustodyTypeScreen.test.tsx` | 3 | ✅ |
| `ValueDeclarationScreen.test.tsx` | 5 | ✅ |
| `custody-order-flow.spec.ts` (E2E) | 3 | ✅ (skip si seed no aplicado) |

Total nuevos: **22 tests**

---

## Dependencias instaladas

- `ajv` — JSON Schema validation (compilada estáticamente)
- `ajv-formats` — formatos adicionales (date, email, uri)
