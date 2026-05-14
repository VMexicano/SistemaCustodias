# Snapshot: clients
> Gestión de clientes — empresa o persona que contrata el servicio de custodia.
> Última actualización: 2026-05-14 — Sprint 2 ✅

---

## Archivo(s) principal(es)

```
apps/api/src/modules/clients/
  clients.routes.ts
  clients.controller.ts
  clients.service.ts
  clients.repository.ts
  clients.types.ts
```

---

## Endpoints implementados

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/clients/me` | client | Perfil del cliente autenticado |
| POST | `/clients` | dispatcher, supervisor | Crear cliente asociado al tenant |
| GET | `/clients` | dispatcher, supervisor | Listar clientes del tenant (paginado) |
| GET | `/clients/:id` | dispatcher, supervisor | Ver cliente por ID |
| PATCH | `/clients/:id` | supervisor | Actualizar datos del cliente |
| DELETE | `/clients/:id` | supervisor | Soft delete |

---

## Schema DB

```
clients (
  id UUID PK,
  user_id UUID FK→users,
  company_id UUID FK→companies (tenant),
  company_name TEXT,
  rfc VARCHAR(13),
  contact_name TEXT NOT NULL,
  credit_limit_mxn DECIMAL(12,2) DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

---

## Actor resolution

- `GET /clients/me`: `JWT.sub` = `users.id` → lookup `clients WHERE user_id = sub`
- Listados: `JWT.tenant_id` = `company_id` para filtrado por tenant

---

## Tipos TypeScript principales

```typescript
interface ClientDTO {
  id: string;
  userId: string;
  companyId: string | null;
  companyName: string | null;
  rfc: string | null;
  contactName: string;
  creditLimitMxn: number;
  createdAt: string;
}
```

---

## Cobertura (Sprint 2)

| Archivo | Tests | Cobertura |
|---|---|---|
| clients.service.ts | 10 tests unitarios | ≥ 80% |
| clients.repository.ts | Sin tests directos (mockeado) | — |

---

## Dependencias entre módulos

- `auth` — Un cliente es primero un `user` con role='client'
- `custody-orders` — Las órdenes referencian `client_id` (Sprint 4)
