# Snapshot: operadores
> Custodios y copilotos — onboarding, documentos, disponibilidad, asignación.
> Última actualización: 2026-05-14 — Sprint 2 ✅

---

## Archivo(s) principal(es)

```
apps/api/src/modules/operadores/
  operadores.routes.ts
  operadores.controller.ts
  operadores.service.ts
  operadores.repository.ts
  operadores.schemas.ts
  operadores.types.ts
```

---

## Tipos de operador

| Tipo | Código | Rol en la orden |
|---|---|---|
| Custodio | `custodio` | Conductor de la unidad, responsable principal |
| Copiloto | `copiloto` | Acompañante de seguridad, confirmación obligatoria |

**Regla dos-personas:** No se puede activar una orden sin ambos roles asignados y confirmados.

---

## Estados del operador

```
available   → El operador puede recibir órdenes
busy        → Tiene una orden activa (ASSIGNED hasta DELIVERED)
offline     → Desconectado / fuera de turno
suspended   → Suspendido por el supervisor (no recibe órdenes)
```

---

## Documentos requeridos para onboarding

| Documento | Obligatorio | Notas |
|---|---|---|
| INE / Identificación oficial | ✅ | Foto frontal y reverso |
| Licencia de conducir | ✅ Custodio | Vigente — tipo A o B |
| Certificado de capacitación en seguridad | ✅ | Emitido por empresa certificadora |
| Carta de no antecedentes penales | ✅ | Vigencia máx 3 meses |
| Comprobante de domicilio | ✅ | Vigencia máx 3 meses |
| Examen médico | ✅ | Aptitud física para el cargo |
| Foto de perfil | ✅ | Para app y credencial |

Todos los documentos se guardan como URLs en `certifications JSONB`.

---

## Endpoints

| Método | Ruta | Actor | Descripción |
|---|---|---|---|
| POST | `/operadores` | supervisor | Crear operador |
| GET | `/operadores` | dispatcher, supervisor | Listar con filtros (tipo, estado, disponibilidad) |
| GET | `/operadores/:id` | dispatcher, supervisor | Ver perfil completo |
| GET | `/operadores/available` | dispatcher | Listar disponibles por tipo y zona |
| PATCH | `/operadores/:id` | supervisor | Actualizar datos |
| PATCH | `/operadores/:id/status` | dispatcher, supervisor | Cambiar estado |
| PATCH | `/operadores/:id/suspend` | supervisor | Suspender operador |
| DELETE | `/operadores/:id` | supervisor | Soft delete |
| POST | `/operadores/:id/documents` | operador, supervisor | Subir documento |
| GET | `/operadores/:id/orders` | dispatcher, supervisor | Historial de órdenes |

---

## Schema principal

```typescript
interface Operator {
  id: string;
  user_id: string;
  operator_type: 'custodio' | 'copiloto';
  license_number?: string;      // solo custodio
  certifications: {
    ine_url?: string;
    license_url?: string;
    security_cert_url?: string;
    background_check_url?: string;
    address_proof_url?: string;
    medical_exam_url?: string;
    profile_photo_url?: string;
    [key: string]: string | undefined;   // extensible
  };
  vehicle_id?: string;
  status: 'available' | 'busy' | 'offline' | 'suspended';
  deleted_at?: Date;
  created_at: Date;
}
```

---

## Reglas de asignación

1. El despachador solo puede asignar operadores con `status = 'available'`
2. Al asignar, el status cambia a `busy` inmediatamente
3. Al DELIVERED/COMPLETED/CANCELLED, el status vuelve a `available`
4. No se puede suspender a un operador con una orden activa (ASSIGNED..IN_TRANSIT)
5. El copiloto también confirma la orden — si no confirma en X minutos, el despachador puede reasignar

---

## Endpoints implementados (Sprint 2)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/operadores/available` | dispatcher, supervisor | Operadores con status='available' (filtro: operator_type) |
| POST | `/operadores` | supervisor | Crear operador |
| GET | `/operadores` | dispatcher, supervisor | Listar operadores del tenant (filtros: operator_type, status) |
| GET | `/operadores/:id` | dispatcher, supervisor | Ver operador por ID |
| PATCH | `/operadores/:id/status` | dispatcher, supervisor | Cambiar status (available/busy/offline) |
| PATCH | `/operadores/:id/suspend` | supervisor | Suspender operador |
| DELETE | `/operadores/:id` | supervisor | Soft delete |

## Cobertura (Sprint 2)

| Archivo | Tests | Cobertura |
|---|---|---|
| operadores.service.ts | 13 tests unitarios | ≥ 80% |

## Dependencias entre módulos

- `auth` — Todo operador es primero un `user` con role custodio/copiloto
- `vehicles` — `operators.vehicle_id` FK→custody_vehicles ← asignado desde PATCH /vehicles/:id/assign/:operatorId
- `custody-orders` — Las órdenes referencian `custodio_id` y `copiloto_id` (Sprint 4)
- `tracking` — Las lecturas GPS incluyen `operator_id` (Sprint 7)
- `alerts` — Las alertas de pánico se originan desde un operador (Sprint 8)
