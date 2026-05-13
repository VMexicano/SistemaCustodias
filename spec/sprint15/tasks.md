# Tasks — Sprint 15: Backoffice Enrichment + Clone Kit

**Fecha:** 2026-04-27
**Sprint:** 15
**Condición de inicio:** Sprint 14 completo (SP14-QA-001 ✅)
**Estado global:** 🔲 Pendiente

---

## Tabla resumen

| ID | Título | Tipo | Estado |
|---|---|---|---|
| BACK15-001 | Trip detail: tab Temperatura (chart) + tab Custodia (timeline) | FEATURE | 🔲 |
| BACK15-002 | Vertical editor: modal con toggles de features JSONB | FEATURE | 🔲 |
| KIT15-001 | Clone starter kit: VERTICAL_CLONE_GUIDE.md + templates | FEATURE | 🔲 |
| SP15-QA-001 | Playwright: vertical editor E2E + smoke datos trip detail | QA_ONLY | 🔲 |

> KIT15-001 no tiene dependencia técnica estricta — puede ejecutarse en paralelo con Sprints 13-14 si se desea adelantar.

---

## Grafo de dependencias

```
(Sprint 14 ✅)
    ├── BACK15-001 (trip detail enrichment) ─┐
    ├── BACK15-002 (vertical editor)        ─┼──→ SP15-QA-001
    └── KIT15-001  (clone kit)              ─┘
        (puede adelantarse: solo depende de Sprint 13)
```

---

## Grupos de ejecución paralela

- **Grupo 1** (esperan Sprint 14): `BACK15-001 ∥ BACK15-002 ∥ KIT15-001`
- **Grupo 2** (esperan Grupo 1): `SP15-QA-001`

---

## Tareas detalladas

---

### BACK15-001 — Trip detail: tab Temperatura + tab Custodia

- **Tipo:** FEATURE
- **Sprint:** 15
- **Agentes:** mobile (frontend web)
- **Depende de:** Sprint 14 (APIs /temperature y /custody disponibles + datos generados)
- **Irreversible:** no

**Scope incluye:**
- Modificar modal de detalle en `TripsPage.tsx`: detectar si viaje tiene datos → mostrar tab condicionalmente
- Tab "Temperatura": `LineChart` de Recharts con referencias de setpoints + 4 summary cards
- Tab "Custodia": timeline vertical con events de custody + link a foto si hay `photo_url`
- Queries lazy: `GET /trips/:id/temperature` y `GET /trips/:id/custody` solo al abrir el modal
- Ambas queries con `enabled: !!selectedTrip` (TanStack Query)

**Scope excluye:**
- Chart en tiempo real (WebSocket)
- Exportación PDF
- Filtros de rango en el chart (admin ve todos los datos del viaje)

**Criterios de aceptación (negocio):**
- Admin abre viaje cold-chain → tab "Temperatura" visible con gráfica
- Admin abre viaje custody → tab "Custodia" visible con timeline de eventos
- Admin abre viaje taxi → sin tabs adicionales (sin cambio)

**Criterios de aceptación (técnico):**
- `GET /trips/:id/temperature` con array vacío → tab no aparece
- `GET /trips/:id/custody` con array vacío → tab no aparece
- Recharts LineChart renderiza sin errores con al menos 1 punto
- `summary.out_of_range_count > 0` → Badge rojo visible

**TDD specs:**
```typescript
// No hay unit tests de componentes en el backoffice web (solo Playwright)
// Playwright en SP15-QA-001 verifica el comportamiento E2E
```

**dependencies_verified:**
- `recharts` en `apps/web/package.json` — verificar antes de implementar
- `api.get()` con `delete` y `put` ya existe (Sprint 11)
- `Modal`, `Badge` ya existen en `src/components/ui/`

---

### BACK15-002 — Vertical editor: modal con toggles de features JSONB

- **Tipo:** FEATURE
- **Sprint:** 15
- **Agentes:** mobile (frontend web)
- **Depende de:** Sprint 14 (solo necesita PATCH /admin/verticals/:id que existe desde Sprint 10)
- **Irreversible:** no

**Scope incluye:**
- Botón "Editar" en cada tarjeta de `VerticalesPage.tsx`
- Modal con: campos `name` (TextInput), `description` (TextArea), toggles por feature booleana, select para `pricingModel`
- Al guardar: `PATCH /admin/verticals/:id` con `{ name, description, features }`
- Actualizar la lista local sin recargar (`queryClient.invalidateQueries(['vertical-config'])`)
- Validación: `name` no puede estar vacío

**Scope excluye:**
- Crear nuevos verticales (POST) desde el UI
- Eliminar verticales
- Editar `slug` (inmutable por diseño)

**Criterios de aceptación (negocio):**
- Admin desactiva `scheduling` en taxi → el toggle refleja el cambio y se guarda
- Admin activa `cargoDeclaration` en taxi → el vertical ahora tiene el flag en true en `GET /config`

**Criterios de aceptación (técnico):**
- `PATCH /admin/verticals/:id` se llama con el body correcto al guardar
- Sin `name` → botón Guardar disabled
- Error de red → muestra mensaje de error en el modal sin cerrarlo
- `queryClient.invalidateQueries` se llama tras PATCH exitoso

**TDD specs:**
```typescript
// Solo Playwright (SP15-QA-001) — no unit tests para componentes web
```

---

### KIT15-001 — Clone starter kit

- **Tipo:** FEATURE
- **Sprint:** 15
- **Agentes:** backend (documentación)
- **Depende de:** Sprint 13 (para documentar seed template correcto)
- **Irreversible:** no

**Scope incluye:**

#### `docs/VERTICAL_CLONE_GUIDE.md`
Guía paso a paso con comandos exactos:
1. Clonar repo + instalar deps (`pnpm install`)
2. Copiar `.env.example` → `.env` + configurar `VERTICAL_SLUG`
3. Levantar Docker (`docker compose up -d`)
4. Correr migraciones (`pnpm --filter api knex migrate:latest`)
5. Correr seed del vertical (`pnpm --filter api knex seed:run`)
6. Crear seed personalizado (usando `apps/api/seeds/templates/vertical.template.ts`)
7. Configurar features del vertical (vía `PATCH /admin/verticals/:id` o directo en seed)
8. Configurar requisitos de conductor (seed con `vertical_id`)
9. Verificar `GET /config` retorna el vertical correcto
10. Compilar APK (`cd apps/mobile-v2/android && ./gradlew assembleDebug`)
11. Levantar backoffice web (`pnpm --filter web dev`) → verificar `VerticalesPage`
12. Checklist final de verificación

Incluye sección "Referencia de verticales existentes" con tabla de features para taxi, custody, cold-chain.

#### `apps/api/seeds/templates/vertical.template.ts`
Seed comentado con:
- INSERT en `verticals` con todos los campos y features JSONB documentados
- INSERT en `trip_types` con los 3 modelos de tarifa documentados
- INSERT en `document_requirements` con `vertical_id`
- Instrucciones de cómo resolver IDs en runtime

#### `.env.vertical.example` (en raíz del monorepo)
```bash
# Variables relevantes al vertical
VERTICAL_SLUG=mi_vertical          # identifica qué vertical sirve GET /config
VITE_VERTICAL_SLUG=mi_vertical     # backoffice web
# Variables de la app mobile (en app.json extra)
# extra.verticalSlug = "mi_vertical"
```

**Criterios de aceptación (negocio):**
- Un desarrollador externo puede seguir la guía y tener el stack corriendo con un nuevo vertical en < 1 día

**Criterios de aceptación (técnico):**
- Cada paso de la guía tiene un comando verificable (output esperado documentado)
- El seed template compila sin errores TypeScript (`npx tsc --noEmit`)
- `.env.vertical.example` documenta todas las variables relacionadas con el vertical

---

### SP15-QA-001 — Playwright: vertical editor E2E + smoke datos trip detail

- **Tipo:** QA_ONLY
- **Sprint:** 15
- **Agentes:** qa
- **Depende de:** BACK15-001, BACK15-002, KIT15-001
- **Irreversible:** no

**Scope incluye:**

#### `apps/api/tests/e2e/smoke/vertical-editor.spec.ts`
```typescript
test('admin can edit vertical features from VerticalesPage', async ({ page }) => {
  // Login → navegar a /admin/verticals
  // Click en Editar del vertical taxi
  // Toggle scheduling → Off
  // Click Guardar
  // Verificar que la tarjeta refleja el cambio
  // Verificar GET /config → scheduling = false
});

test('vertical editor validates empty name', async ({ page }) => {
  // Abrir editor
  // Limpiar nombre
  // Verificar botón Guardar disabled
});
```

#### `apps/api/tests/e2e/smoke/trip-detail-vertical.spec.ts`
```typescript
test('custody trip shows custody tab in trip detail', async ({ page }) => {
  // Crear viaje con evento de custodia vía API
  // Login admin → /admin/trips
  // Abrir modal del viaje
  // Verificar tab "Custodia" visible
  // Verificar al menos 1 evento en timeline
});

test('temperature data visible in cold-chain trip detail', async ({ page }) => {
  // Crear viaje con lecturas de temperatura vía API
  // Login admin → /admin/trips → abrir modal
  // Verificar tab "Temperatura" visible
  // Verificar chart y summary cards
});
```

---

## Definition of Done — Sprint 15

- [ ] Tab "Temperatura" visible en modal de viaje con datos de temperatura
- [ ] Tab "Custodia" visible en modal de viaje con timeline
- [ ] Ambas tabs ausentes en viajes sin esos datos (viajes taxi)
- [ ] Modal "Editar vertical" abre, permite cambiar features y guarda via PATCH
- [ ] `docs/VERTICAL_CLONE_GUIDE.md` existe con 12 pasos y checklist
- [ ] `apps/api/seeds/templates/vertical.template.ts` compila sin errores TypeScript
- [ ] `.env.vertical.example` en raíz del monorepo
- [ ] Playwright: `vertical-editor.spec.ts` → 2 tests ✅
- [ ] Playwright: `trip-detail-vertical.spec.ts` → 2 tests ✅
- [ ] TypeScript: 0 errores en `apps/web`
- [ ] `recharts` en `apps/web/package.json` si se usó

---

## Definition of Done — Multi-vertical completo (Sprints 13 + 14 + 15)

- [ ] `VERTICAL_SLUG=taxi` → app funcional sin cambio visible respecto al Sprint 12
- [ ] `VERTICAL_SLUG=custody` → pasajero puede declarar carga + conductor registra cadena de custodia
- [ ] `VERTICAL_SLUG=cold-chain` → conductor reporta temperatura + admin ve gráfica
- [ ] Clonar el repo y seguir `VERTICAL_CLONE_GUIDE.md` produce un stack funcional
- [ ] Cambiar `features.scheduling = false` vía editor web → app mobile no muestra "Mis programados" (feature flag respetado end-to-end)

---

## Notas por agente

**mobile (frontend web):**
- Instalar recharts si no está: `pnpm add recharts --filter web`
- Los tabs del modal se pueden implementar como state local `selectedTab: 'detalle' | 'metadata' | 'temperatura' | 'custodia'`
- En el editor de features, los campos del JSONB varían por vertical — usar `Object.entries(vertical.features)` para renderizar dinámicamente; excluir `pricingModel` del loop de booleans (tratarlo por separado)

**qa:**
- Para crear datos de prueba en Playwright: usar `api.post('/trips', ...)` con JWT de pasajero test + luego `api.post('/trips/:id/temperature', ...)` con JWT de conductor test
- Los tests de trip-detail necesitan un viaje en estado COMPLETED con datos reales — crear el flujo completo vía API en `beforeEach`

**backend:**
- `KIT15-001` no requiere código en `apps/api/src/` — solo archivos de documentación y seeds/templates
- El seed template debe usar el patrón de resolución de IDs por slug (no IDs hardcodeados) para que sea portable
