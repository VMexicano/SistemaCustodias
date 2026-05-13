# Vertical Spec — Custodia de Valores
> Fork de UBER_BASE Sprint 17 (2026-05-07)
> Este archivo es la referencia de identidad del vertical. Leerlo junto con `context/project-index.md`.

---

## Identidad

| Campo | Valor |
|---|---|
| slug | `custody` |
| Nombre | Custodia de Valores |
| Mercado | B2B — empresas de seguridad, bancos, joyerías, notarías, transportadoras de valores |
| Modelo de negocio | Contrato mensual por empresa + tarifa por viaje basada en valor declarado |
| pricingModel | `per_declared_value` — porcentaje sobre `metadata.cargo.declared_value` |
| requiresApproval | `true` — viajes pasan por PENDING_APPROVAL → APPROVED antes de SEARCHING |
| B2B | Sí — empresas con company_users, facturación, dashboards ejecutivos |
| Base sprint | Sprint 17 completo |

---

## Features activas

```json
{
  "scheduling": true,
  "multiStop": true,
  "cargoDeclaration": true,
  "chainOfCustody": true,
  "temperatureLog": false,
  "b2bAccounts": true,
  "requiresApproval": true,
  "pricingModel": "per_declared_value",
  "custodyEventTypes": [
    { "code": "pick_up",  "label": "Recolección",           "requiresPhoto": true,  "requiresSignature": false },
    { "code": "handoff",  "label": "Relevo de custodia",    "requiresPhoto": true,  "requiresSignature": true  },
    { "code": "delivery", "label": "Entrega y liberación",  "requiresPhoto": true,  "requiresSignature": true  }
  ],
  "cargoFields": [
    { "key": "cargo_description", "label": "Descripción del valor",       "type": "text",   "required": true  },
    { "key": "declared_value",    "label": "Valor declarado (MXN)",        "type": "number", "required": true  },
    { "key": "seal_number",       "label": "Número de sello de seguridad", "type": "text",   "required": true  },
    { "key": "recipient_name",    "label": "Destinatario",                 "type": "text",   "required": true  },
    { "key": "recipient_phone",   "label": "Teléfono del destinatario",    "type": "phone",  "required": false }
  ],
  "unitTypeDetermination": "by_declared_value"
}
```

Actualizar sin deploy:
```bash
PATCH /admin/verticals/:id  { "features": { "custodyEventTypes": [...] } }
```

---

## Flujo de viaje (state machine activo)

```
REQUESTED → PENDING_APPROVAL → APPROVED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
                  ↓↓               ↓↓          ↓           ↓↓            ↓↓               ↓↓
              CANCELLED        CANCELLED   CANCELLED    CANCELLED     CANCELLED         CANCELLED
```

**Actor dispatcher** aprueba/rechaza en `PENDING_APPROVAL`.
**BullMQ job** `trip.promote-approved` transiciona APPROVED → SEARCHING automáticamente.

Endpoints de aprobación (del base, Sprint 17):
```
POST /trips/:id/approve  — requiere rol admin o dispatcher
POST /trips/:id/reject   — requiere rol admin o dispatcher
GET  /admin/trips/pending-approval  — lista paginada para AprobacionesPage
```

---

## Tipos de viaje seeded (del base)

| code | pricingModel | Notas |
|---|---|---|
| basic | per_declared_value | Vehículo estándar, valor < $500k MXN |
| plus | per_declared_value | Vehículo reforzado, valor $500k–$2M MXN |
| premium | per_declared_value | Blindado + escolta, valor > $2M MXN |

La selección de tipo de viaje se determina por `unitTypeDetermination: "by_declared_value"`.
Lógica de selección: implementar en `trips.service.ts` como `determineUnitType(declaredValue)`.

---

## Diferencias vs UBER_BASE

> Al hacer el fork, este bloque estará vacío. Documentar aquí cada cambio que se haga.

```
# Formato: [Sprint] archivo — descripción del cambio
# Ejemplo:
# [Sprint 18] apps/mobile-v2/src/screens/CustodySignatureScreen.tsx — firma digital en eventos custodia
# [Sprint 18] apps/api/src/modules/custody/custody.service.ts — campo signature_data en POST /custody/events
```

_(vacío — fork limpio de UBER_BASE Sprint 17)_

---

## Reglas de negocio adicionales

> Sobre las reglas R-TRIP-001..R-DATA-002 del base (en `context/project-index.md`).

```
# Agregar aquí las reglas específicas del vertical a medida que se implementan.
# Ejemplo:
# R-CUST-001  Viajes con declared_value > $500k MXN requieren tipo 'plus' o 'premium'
# R-CUST-002  Cada evento de custodia es inmutable (append-only) — ya en ADR-041 del base
# R-CUST-003  El dispatcher que aprueba queda registrado en trips.approved_by — ya en Migration 038
```

_(sin reglas adicionales — fork limpio)_

---

## Roadmap

> El agente implementa sprints en orden. Cada sprint sigue el ciclo SDD → TDD del base.
> Antes de iniciar un sprint, crear el spec en `docs/specs/sprint{N}/`.

### Sprint 18 — Firma digital en eventos de custodia

**Objetivo:** Implementar la pantalla de firma del base que quedó como contrato en ADR-046 (`requiresSignature: true` existe pero la UI no está construida).

**Contexto crítico:** El campo `requiresSignature` ya está en `features.custodyEventTypes`. La tabla `custody_events` ya tiene `signature_url`. El backend ya acepta `signature_url` en `POST /trips/:id/custody/events`. Lo que falta es únicamente la UI en mobile.

**Tareas:**
```
[ ] apps/mobile-v2/src/screens/CustodySignatureScreen.tsx — canvas de firma (react-native-signature-canvas)
[ ] CustodyEventScreen.tsx: mostrar CustodySignatureScreen si eventType.requiresSignature === true
[ ] Flujo: firma → canvas → base64 → upload a storage → enviar signature_url al backend
[ ] Storage: endpoint POST /uploads/signature (multipart, devuelve URL)
[ ] Migration 039: CREATE TABLE uploads (id, entity_type, entity_id, file_url, uploaded_by, created_at)
[ ] Tests: CustodySignatureScreen (unit, 5 tests) + upload endpoint (integration)
[ ] pnpm add react-native-signature-canvas en mobile-v2
```

**Archivos clave:**
- `apps/mobile-v2/src/screens/CustodyEventScreen.tsx` — añadir lógica de firma condicional
- `apps/api/src/modules/uploads/` — nuevo módulo (routes + controller + service)

---

### Sprint 19 — Reportería B2B (PDF y CSV)

**Objetivo:** Administrador de empresa descarga reporte de viajes del período: PDF con cadena de custodia y CSV para contabilidad.

**Tareas:**
```
[ ] GET /admin/companies/:id/reports/trips?from=&to=&format=pdf|csv
[ ] reports.service: aggregateCompanyTrips(companyId, from, to)
[ ] PDF: puppeteer headless — plantilla HTML con logo, tabla de viajes, cadena de custodia por viaje
[ ] CSV: papaparse — columnas: fecha, origen, destino, conductor, declared_value, tarifa, status
[ ] Backoffice: ReportesPage con date picker + botones Descargar PDF / Descargar CSV
[ ] Tests: reports.service aggregation (unit) + PDF generation (integration)
[ ] pnpm add puppeteer papaparse @types/papaparse --filter api
```

**Archivos clave:**
- `apps/api/src/modules/reports/` — nuevo módulo
- `apps/web/src/pages/ReportesPage.tsx` — nueva página en AdminLayout

---

### Sprint 20 — Dashboard ejecutivo por empresa

**Objetivo:** CompanyDetailPage muestra métricas en tiempo real: valor custodiado, SLA cumplimiento, viajes por período, conductores más usados.

**Tareas:**
```
[ ] GET /admin/companies/:id/stats?period=week|month|quarter
[ ] companies.repository: getStats(companyId, period) — agregaciones SQL sobre trips + custody_events
[ ] Métricas: total_trips, total_value_mxn, avg_trip_duration_min, on_time_pct, top_drivers[]
[ ] Backoffice: StatsCards + LineChart (Recharts) en CompanyDetailPage — nueva tab "Dashboard"
[ ] WebSocket: subscribe a company:{id} room para stats en tiempo real si active_trips > 0
[ ] Tests: companies.repository stats (unit) + dashboard render (Playwright)
```

---

### Sprint 21 — Selección automática de unidad por valor declarado

**Objetivo:** Al crear el viaje, el sistema asigna automáticamente el tipo de unidad según `declared_value` y la configuración `unitTypeDetermination: "by_declared_value"`.

**Tareas:**
```
[ ] trips.service: determineUnitType(declaredValue, verticalFeatures) — retorna trip_type_id
    - < $500k MXN  → basic
    - $500k–$2M    → plus
    - > $2M        → premium
[ ] trips.routes: si vertical tiene unitTypeDetermination, ignorar trip_type_id del request
[ ] Configuración de umbrales via configurations: key="unit_thresholds" namespace="pricing" entity_type="vertical"
[ ] Mobile: CargoDeclarationScreen — ocultar selector de tipo de viaje si unitTypeDetermination activo
[ ] Tests: trips.service unit determination (unit, todos los umbrales)
```

**Archivos clave:**
- `apps/api/src/modules/trips/trips.service.ts` — añadir `determineUnitType()` privado
- `apps/mobile-v2/src/screens/CargoDeclarationScreen.tsx` — ocultar selector condicionalmente

---

### Sprint 22 — Facturación SAT (CFDI 4.0)

**Objetivo:** Generar CFDI por cada viaje completado para clientes empresariales.

**Tareas:**
```
[ ] Integración con PAC (Proveedor Autorizado de Certificación) — Finkok o SAT directo
[ ] Migration 040: CREATE TABLE cfdi_documents (id, trip_id FK, company_id FK, uuid_cfdi, xml_url, pdf_url, status, created_at)
[ ] cfdi.service: generateCFDI(tripId) — encolado en BullMQ worker
[ ] BullMQ worker: cfdi — procesa después de COMPLETED + payment charged
[ ] GET /trips/:id/cfdi — descarga PDF/XML
[ ] Backoffice: columna "Factura" en TripsPage con botón descarga
[ ] Tests: cfdi.service mock PAC (unit) + worker integration
[ ] ADR nuevo: ADR-048 CFDI — documentar en docs/13_decisions_log.md
```

---

### Sprint 23 — Gestión de flotilla blindada

**Objetivo:** Backoffice permite registrar vehículos por categoría (blindado, semi-blindado, estándar) y asignarlos a conductores verificados por empresa.

**Tareas:**
```
[ ] Migration 041: ALTER TABLE vehicles ADD vehicle_category VARCHAR(20) CHECK ('standard','reinforced','armored')
[ ] Migration 041: ALTER TABLE vehicles ADD company_id UUID FK companies nullable
[ ] Admin: VehiculosPage — tabla filtrable por categoría + empresa
[ ] Lógica de despacho: preferir vehículo blindado cuando trip_type = premium
[ ] Tests: vehicles.service category filter (unit)
```

---

## Extension points disponibles (del base)

| Extension point | Cómo usar | Caso de uso custody |
|---|---|---|
| `custodyEventTypes` en features JSONB | `PATCH /admin/verticals/:id` | Añadir evento `inspection` sin deploy |
| `cargoFields` en features JSONB | `PATCH /admin/verticals/:id` | Añadir campo `insurance_policy` |
| `requiresApproval` en features | Ya activo — dispatcher aprueba | Base completo en Sprint 17 |
| `custody_events` append-only | `POST /trips/:id/custody/events` | Inmutable por ADR-041 |
| `configurations` key-value | `PUT /config/entity/vertical/custody/pricing/thresholds` | Umbrales sin migración |
| `company_users` roles | `owner`, `admin`, `member` | Dashboard ejecutivo por rol |
| `trips.metadata JSONB` | Campos adicionales sin migración | `metadata.cargo` ya en uso |

---

## Invariantes críticos de este vertical (no violar)

```
I-CUST-001  custody_events es append-only — NUNCA UPDATE ni DELETE (ADR-041)
I-CUST-002  trips.approved_by debe ser un admin_users.id válido (Migration 038)
            El actorId del dispatcher en trip_status_history es NULL (FK vs users.id — ADR-047 bug fix)
I-CUST-003  pricing_snapshot es inmutable — el % sobre declared_value se congela al hacer estimate (ADR-009)
I-CUST-004  requiresApproval NO se puede desactivar en prod sin revisar viajes en PENDING_APPROVAL primero
```

---

## Cómo agregar una feature nueva (guía rápida)

```
1. Definir el spec: docs/specs/sprint{N}/01_spec.md
   - Endpoints con request/response completo
   - Migration si hay tabla nueva
   - Tests requeridos (thresholds del base aplican)

2. Migration (si aplica): apps/api/migrations/{N}_{nombre}.ts
   - Siempre up() + down()
   - Campos en custody_events: NO son reversibles (append-only) — documentar como irreversible

3. Backend layer: routes → controller → service → repository
   - Para módulo custody: apps/api/src/modules/custody/
   - Errores de negocio: throw new BusinessError('CODE')
   - SELECT FOR UPDATE en transiciones de estado

4. Tests: apps/api/src/__tests__/{modulo}/{modulo}.service.test.ts
   - TripStateMachine y PricingEngine: 100% obligatorio
   - Custody y Temperature: 100% (ya en ese nivel en el base)

5. Mobile (si aplica): apps/mobile-v2/src/screens/{Screen}.tsx
   - Feature flag check: const { features } = useVerticalFeatures()
   - custodyEventTypes viene de features — no hardcodear tipos

6. Verificar: npm run agent:verify:quick

7. Actualizar context/vertical-spec.md — sección "Diferencias vs UBER_BASE"
   y context/snapshots/custody.snapshot.md (o trips.snapshot.md si aplica)
```

---

## Variables de entorno del fork

```bash
# apps/api/.env
VERTICAL_SLUG=custody

# apps/web/.env
VITE_VERTICAL_SLUG=custody
```

Para setup completo (Docker, migraciones, seeds): ver `docs/VERTICAL_CLONE_GUIDE.md` Pasos 1–5.
> ⚠️ `docs/12_environment_setup.md` está desactualizada — no usar.

Para producción: añadir credenciales PAC (CFDI) en Sprint 22.
