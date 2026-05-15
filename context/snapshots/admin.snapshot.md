# Snapshot: admin
> Dashboard web — despachador y supervisor.
> Última actualización: 2026-05-14 — Sprint 11 completado

---

## Estado: ✅ Sprint 12 completo

## Stack web

- Vite 5 + React 19 + TanStack Router
- TanStack Query para fetching
- Tailwind CSS
- Socket.io-client para tiempo real (pendiente Sprint 12+)

---

## Páginas implementadas (Sprint 11)

```
apps/web/src/pages/custody/
  CustodyOrdersPage.tsx         ✅ Listado paginado con filtros (estado, búsqueda)
  CustodyOrderDetailPage.tsx    ✅ Detalle + timeline transiciones + alertas + PDF download + aprobar/rechazar
  CustodyApprovalsPage.tsx      ✅ Cola PENDING_APPROVAL — aprobar + rechazar modal (auto-refresh 30s)
  CustodyAlertsPage.tsx         ✅ Activas/Resueltas tabs + filtro severidad + resolver (auto-refresh 15s)
```

## Infraestructura modificada

- `apps/web/src/lib/api.ts` — `api.getBlob(path)` para descargar PDF
- `apps/web/src/components/layout/Sidebar.tsx` — sección "CUSTODIA" con NavSection[] multi-sección
- `apps/web/src/main.tsx` — 4 nuevas rutas: `/admin/custody/orders`, `/admin/custody/orders/$id`, `/admin/custody/approvals`, `/admin/custody/alerts`

---

## Rutas registradas

| Ruta | Componente | Acceso |
|---|---|---|
| `/admin/custody/orders` | CustodyOrdersPage | dispatcher, supervisor |
| `/admin/custody/orders/$id` | CustodyOrderDetailPage | dispatcher, supervisor |
| `/admin/custody/approvals` | CustodyApprovalsPage | supervisor |
| `/admin/custody/alerts` | CustodyAlertsPage | dispatcher, supervisor |

---

## API consumida

| Endpoint | Página |
|---|---|
| `GET /orders?status=X&page=N&limit=20` | CustodyOrdersPage |
| `GET /orders/:id` | CustodyOrderDetailPage |
| `GET /orders/:id/transitions` | CustodyOrderDetailPage (timeline) |
| `GET /orders/:orderId/alerts` | CustodyOrderDetailPage |
| `GET /orders/:id/chain-of-custody/pdf` | CustodyOrderDetailPage (blob download) |
| `PATCH /orders/:id/approve` | CustodyOrderDetailPage + CustodyApprovalsPage |
| `PATCH /orders/:id/reject` | CustodyOrderDetailPage + CustodyApprovalsPage |
| `GET /orders?status=PENDING_APPROVAL&limit=50` | CustodyApprovalsPage |
| `GET /alerts?resolved=false` | CustodyAlertsPage (tab activas) |
| `GET /alerts?resolved=true` | CustodyAlertsPage (tab resueltas) |
| `PATCH /alerts/:id/resolve` | CustodyAlertsPage |

---

## Patrones de TypeScript TanStack Router

```tsx
// Link a ruta dinámica — usar params prop
<Link to="/admin/custody/orders/$id" params={{ id: order.id }}>Ver</Link>

// useParams en página de detalle — strict: false
const { id } = useParams({ strict: false }) as { id: string };
```

---

## Sprint 12 — Cambios adicionales

**Backend:**
- `operadores.types.ts`: `OperatorDTO` incluye `firstName?: string; lastName?: string`
- `operadores.repository.ts`: `findAvailable` JOIN `users` → devuelve nombres
- `operadores.service.ts`: `toDTO` propaga `firstName`/`lastName`

**Frontend:**
- `CustodyOrderDetailPage`: modal "Asignar equipo" (status APPROVED) + modal "Reasignar equipo" (status ASSIGNED/REASSIGNED)
  - Selects filtrados por `operatorType` (custodio/copiloto)
  - Validación: ambos seleccionados + no pueden ser el mismo operador
  - `PATCH /orders/:id/assign` y `PATCH /orders/:id/reassign`
- `useCustodyAlertCount`: hook con refetch 30s para alertas activas
- `Sidebar`: badge rojo sobre "Alertas" cuando hay alertas activas custody

**API nuevas consumidas:**
- `GET /operadores/available` — lazy (solo cuando el modal está abierto)

## Pendiente (Sprint 13+)

- Mapa Mapbox en tiempo real (WebSocket /tracking)
- Gestión de operadores custody (OperadoresPage)
- Gestión de clientes custody (ClientsPage)

---

## TypeScript

- 0 errores (web + api)
- No hay tests unitarios (web app sin Jest setup — UI verificada por inspección)
