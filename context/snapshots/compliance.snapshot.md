# Snapshot — compliance

**Estado:** ✅ Sprint 10 completo
**Última actualización:** 2026-05-14

## Módulo implementado

### ChainOfCustodyService (`apps/api/src/modules/compliance/`)
- `compliance.types.ts` — ChainOfCustodyReport, TransitionRecord, AlertRecord, SignatureRecord
- `compliance.repository.ts` — getOrderWithType, getClientForOrder, getOperatorData, getTransitionsWithActors, getValueDeclaration, getAlerts
- `chain-of-custody.service.ts` — buildReport(orderId, actorRole), getSignatures(orderId), buildPdf(orderId, actorRole), renderToPdf(report)
- `compliance.controller.ts` — getChainOfCustody, getChainOfCustodyPdf, getSignatures
- `compliance.routes.ts` — 3 rutas con auth

### Endpoints REST
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/orders/:id/chain-of-custody` | dispatcher, supervisor, client | Reporte JSON con SHA-256 |
| GET | `/orders/:id/chain-of-custody/pdf` | dispatcher, supervisor | Descarga PDF (`application/pdf`) |
| GET | `/orders/:id/signatures` | dispatcher, supervisor | Transiciones con firma digital |

## Estructura del reporte (ChainOfCustodyReport)

```typescript
{
  reportId: string;          // UUID generado en cada llamada
  generatedAt: string;       // ISO8601
  order: { id, orderNumber, status, custodyType, custodyTypeSlug, pickupAddress, deliveryAddress, notes, createdAt, completedAt | null }
  client: { id, name, companyName | null, rfc | null }
  team: {
    custodio: { id, name, licenseNumber | null } | null
    copiloto: { id, name, licenseNumber | null } | null
    vehicle: { id, plate, make | null, model, year } | null
  }
  valueDeclaration: {
    custodyType, declaredValue | null, insurancePolicyId | null, verifiedAt | null, verifiedBy | null
  } | null
  transitions: TransitionRecord[]   // ORDER BY created_at ASC
  alerts: AlertRecord[]
  integrity: { hash: string; algorithm: 'sha256' }
}
```

## Reglas de redacción por rol

| Campo | dispatcher / supervisor | client |
|---|---|---|
| `valueDeclaration.declaredValue` | Valor completo | `null` |
| `TransitionRecord.signatureData` | Base64 SVG | `null` |
| Acceso a PDF | ✅ | ❌ |

## Fuentes de datos (sin migración nueva)

| Tabla | Columnas usadas |
|---|---|
| `custody_orders` | id, order_number, status, custody_type_id, client_id, custodio_id, copiloto_id, pickup_address, delivery_address, notes, created_at |
| `custody_types` | name, slug |
| `clients` | id, contact_name, company_name, rfc |
| `operators` | id, user_id, license_number, vehicle_id |
| `users` | id, first_name, last_name |
| `custody_vehicles` | id, plate, make, model, year |
| `order_transitions` | id, from_status, to_status, actor_id, actor_role, location (POINT::text), notes, digital_signature, created_at |
| `value_declarations` | declared_value, custody_type_id, insurance_policy_id, verified_at, verified_by |
| `security_alerts` | id, alert_type, severity, description, resolved_at, created_at |

## Dependencias externas

- `pdfkit` (instalado en apps/api) — generación de PDF pure JS, sin binarios nativos
- `node:crypto` (built-in) — SHA-256 hash de integridad
- ADR-020: reporte on-demand + SHA-256 + pdfkit

## Cobertura de tests

- `ChainOfCustodyService`: **100% lines / 100% branches** (umbral: ≥90% / ≥85%) ✅
- Tests: `chain-of-custody.service.test.ts` — 28 casos
- jest.config.ts: compliance.repository.ts, compliance.controller.ts, compliance.routes.ts excluidos (integration-tested only)
