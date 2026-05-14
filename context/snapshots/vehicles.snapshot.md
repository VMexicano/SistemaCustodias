# Snapshot: vehicles (custody_vehicles)
> Vehículos blindados/seguros para transporte de custodia.
> Última actualización: 2026-05-14 — Sprint 2 ✅

---

## Archivo(s) principal(es)

```
apps/api/src/modules/vehicles/
  vehicles.routes.ts
  vehicles.controller.ts
  vehicles.service.ts
  vehicles.repository.ts
  vehicles.types.ts
```

---

## Endpoints implementados

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/vehicles` | supervisor | Crear vehículo |
| GET | `/vehicles` | dispatcher, supervisor | Listar vehículos (filtro: active) |
| GET | `/vehicles/:id` | dispatcher, supervisor | Ver vehículo por ID |
| PATCH | `/vehicles/:id` | supervisor | Actualizar datos del vehículo |
| PATCH | `/vehicles/:id/assign/:operatorId` | supervisor | Vincular vehículo a operador |
| DELETE | `/vehicles/:id` | supervisor | Soft delete (active=false) |

---

## Schema DB

```
custody_vehicles (
  id UUID PK,
  plate VARCHAR(20) UNIQUE NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  gps_device_id VARCHAR(100),
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

---

## Cobertura (Sprint 2)

| Archivo | Tests | Cobertura |
|---|---|---|
| vehicles.service.ts | 11 tests unitarios | ≥ 80% |

---

## Dependencias entre módulos

- `operadores` — `PATCH /assign/:operatorId` actualiza `operators.vehicle_id`
- `custody-orders` — Las órdenes referencian el vehículo asignado al custodio (Sprint 4)
