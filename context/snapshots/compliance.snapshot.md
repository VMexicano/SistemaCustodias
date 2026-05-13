# Snapshot: compliance
> Cadena de custodia, firma digital, documentación regulatoria.
> Última actualización: 2026-05-13 — Sprint 0

---

## Archivo(s) principal(es)

```
apps/api/src/modules/compliance/
  compliance.routes.ts
  compliance.controller.ts
  compliance.service.ts
  compliance.repository.ts
  chain-of-custody.ts       ← generación de reportes
  compliance.types.ts
```

---

## Responsabilidades del módulo

1. **Cadena de custodia** — Reporte completo de toda la orden: cada actor, cada transición, timestamp y GPS
2. **Firma digital** — Captura, validación y almacenamiento de firmas en puntos críticos
3. **Documentación regulatoria** — Generación de documentos para auditorías
4. **Verificación de valor declarado** — Supervisor verifica que la declaración sea correcta antes de aprobar

---

## Puntos de firma digital obligatorios

| Transición | Quién firma | Descripción |
|---|---|---|
| `AT_PICKUP → IN_TRANSIT` | Cliente o representante | Confirma entrega del cargo al equipo |
| `AT_DELIVERY → DELIVERED` | Receptor designado | Confirma recepción del cargo |

Las firmas se almacenan en `order_transitions.digital_signature` como Base64 SVG.

---

## Reporte de cadena de custodia

Se genera automáticamente cuando la orden llega a `COMPLETED`.

**Contenido del reporte:**

```
1. Datos de la orden (número, tipo, fechas)
2. Datos del cliente
3. Datos del equipo (custodio + copiloto + vehículo)
4. Valor declarado
5. Cronología completa de transiciones:
   - DRAFT → PENDING_APPROVAL (quién, cuándo)
   - PENDING_APPROVAL → APPROVED (supervisor, cuándo, geolocalización)
   - ... (cada transición)
   - DELIVERED → COMPLETED (quién, cuándo)
6. Firmas digitales (imagen Base64)
7. Alertas registradas (si las hubo)
8. Hash SHA-256 del reporte completo (integridad)
```

---

## Endpoints

| Método | Ruta | Actor | Descripción |
|---|---|---|---|
| GET | `/orders/:id/chain-of-custody` | dispatcher, supervisor, client | Reporte de cadena de custodia |
| GET | `/orders/:id/chain-of-custody/pdf` | dispatcher, supervisor | Descargar PDF |
| POST | `/orders/:id/signatures` | custodio (actúa en nombre del cliente/receptor) | Guardar firma digital |
| GET | `/orders/:id/signatures` | dispatcher, supervisor | Ver firmas de la orden |

---

## Reglas críticas

1. Los registros de `order_transitions` son **inmutables** — nunca UPDATE, solo INSERT
2. El reporte de cadena de custodia incluye un hash SHA-256 para verificar integridad
3. Las firmas se validan antes de aceptar la transición (no nulas, mínimo N bytes)
4. Solo el supervisor puede ver los reportes PDF completos con valor declarado
5. Los clientes pueden ver su propio reporte pero sin el valor exacto declarado de otros

---

## Dependencias entre módulos

- `custody-orders` — Lee todas las transiciones de `order_transitions`
- `value-declaration` — Incluye la declaración de valores en el reporte
- `operadores` — Datos del equipo asignado
- `clients` — Datos del cliente en el reporte
