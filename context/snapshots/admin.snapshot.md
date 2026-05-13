# Snapshot: admin
> Dashboard web — despachador y supervisor.
> Última actualización: 2026-05-13 — Sprint 0

---

## Stack web

- Vite 5 + React 19 + TanStack Router
- TanStack Query para fetching
- Tailwind CSS
- Socket.io-client para tiempo real

---

## Páginas principales

```
apps/web/src/pages/
  DashboardPage.tsx          (resumen: órdenes activas, alertas, mapa)
  OrdersPage.tsx             (listado de órdenes con filtros)
  OrderDetailPage.tsx        (detalle + historial de transiciones + firmas)
  PendingApprovalsPage.tsx   (órdenes esperando aprobación del supervisor)
  OperadoresPage.tsx         (gestión de custodios y copilotos)
  ClientsPage.tsx            (gestión de clientes)
  AlertsPage.tsx             (alertas activas y resueltas)
  ConfigPage.tsx             (tipos de custodia, precios, config del sistema)
  ReportsPage.tsx            (cadena de custodia, reportes regulatorios)
```

---

## Pantalla crítica: Dashboard

El dashboard del despachador/supervisor muestra en tiempo real:
- Mapa con ubicación de todas las unidades activas
- Listado de alertas activas (con badge de severidad)
- Órdenes en PENDING_APPROVAL esperando acción
- KPIs del día: órdenes completadas, en tránsito, tiempo promedio

---

## Flujos principales por actor

### Despachador
1. Ve órdenes aprobadas → selecciona custodio + copiloto → asigna
2. Monitorea mapa en tiempo real
3. Responde a alertas de nivel `medium`
4. Puede crear órdenes en nombre del cliente

### Supervisor
1. Ve cola de PENDING_APPROVAL → aprueba o rechaza (con motivo)
2. Responde a alertas `critical` y `high`
3. Puede suspender operadores
4. Descarga reportes de cadena de custodia
5. Configura tipos de custodia y precios

---

## WebSocket en dashboard

- Se conecta al namespace `/tracking` y recibe eventos `location:updated`
- Se conecta al namespace `/alerts` y recibe `alert:created`, `alert:resolved`
- Se conecta al namespace `/orders` y recibe `order:status_changed`
- Todos los eventos actualizan el estado de React Query sin refetch completo

---

## Reglas

1. La PendingApprovalsPage es solo para supervisores — los despachadores no tienen acceso
2. El mapa en tiempo real usa Mapbox GL JS (no rnmapbox — es la versión web)
3. No usar `<a href>` para navegación — siempre TanStack Router `<Link>`
4. Toda acción destructiva (cancelar orden, suspender operador) requiere confirmación modal

---

## Dependencias entre módulos

- `custody-orders` — Todas las páginas consumen datos de órdenes
- `operadores` — OperadoresPage y asignación en OrderDetailPage
- `alerts` — AlertsPage y dashboard
- `tracking` — Mapa en tiempo real del dashboard
- `compliance` — ReportsPage y cadena de custodia
