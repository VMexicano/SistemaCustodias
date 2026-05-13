# Sprint 11 — Diseño: Backoffice v2

## Arquitectura al finalizar el sprint

```
apps/web/src/
├── components/               🆕 Librería de componentes compartidos
│   ├── layout/
│   │   ├── AdminLayout.tsx   🆕 Shell: sidebar + header + outlet
│   │   ├── Sidebar.tsx       🆕 Navegación principal
│   │   └── Header.tsx        🆕 App name + vertical badge + logout
│   ├── ui/
│   │   ├── Table.tsx         🆕 Tabla genérica paginada
│   │   ├── Badge.tsx         🆕 Badge de estado con variantes
│   │   ├── Modal.tsx         🆕 Modal genérico con portal
│   │   ├── Pagination.tsx    🆕 Paginación con prev/next
│   │   ├── SearchInput.tsx   🆕 Input de búsqueda con debounce
│   │   └── ConfirmDialog.tsx 🆕 Diálogo de confirmación destructiva
├── hooks/
│   ├── useVerticalConfig.ts  🆕 Lee GET /config al montar
│   └── (existentes)
├── pages/
│   ├── LoginPage.tsx         ✅ sin cambios
│   ├── DashboardPage.tsx     ✅ migrar al nuevo layout
│   ├── ConfigPage.tsx        ✅ migrar al nuevo layout
│   ├── TripsPage.tsx         🆕
│   ├── DriversPage.tsx       🆕
│   ├── UsersPage.tsx         🆕
│   ├── CompaniesPage.tsx     🆕
│   ├── CompanyDetailPage.tsx 🆕
│   └── VerticalesPage.tsx    🆕
├── lib/
│   ├── api.ts                ✅ sin cambios
│   └── auth.ts               ✅ sin cambios
└── main.tsx                  ✅ agregar nuevas rutas
```

---

## Rutas nuevas en `main.tsx`

```typescript
/admin              → DashboardPage   (existente, nuevo layout)
/admin/trips        → TripsPage       🆕
/admin/drivers      → DriversPage     🆕
/admin/users        → UsersPage       🆕
/admin/companies    → CompaniesPage   🆕
/admin/companies/:id → CompanyDetailPage 🆕
/admin/verticals    → VerticalesPage  🆕
/admin/config       → ConfigPage      (existente, nuevo layout)
```

Todas las rutas `/admin/*` tienen `beforeLoad: requireAuth`.

---

## Diseño del Layout Shell

```
┌─────────────────────────────────────────────────────┐
│ HEADER: [≡] RideBase Admin          [● Taxi] [Salir]│
├──────────┬──────────────────────────────────────────┤
│ SIDEBAR  │  CONTENT AREA                            │
│          │                                          │
│ Dashboard│  <página activa>                         │
│ Viajes   │                                          │
│ Conductor│                                          │
│ Usuarios │                                          │
│ Empresas │                                          │
│──────────│                                          │
│ Config   │                                          │
│ Vertical │                                          │
└──────────┴──────────────────────────────────────────┘
```

**AdminLayout.tsx — interface:**
```typescript
// Wrap automático de todas las rutas /admin/*
// Sidebar con items navegables
// Header con VITE_APP_NAME y vertical badge desde useVerticalConfig
// <Outlet /> para el contenido de cada página
```

---

## Componentes compartidos — interfaces TypeScript

```typescript
// Table.tsx
interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  width?: string
}
interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

// Badge.tsx
type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray'
interface BadgeProps {
  variant: BadgeVariant
  label: string
}

// Modal.tsx
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

// Pagination.tsx
interface PaginationProps {
  page: number
  total: number
  limit: number
  onChange: (page: number) => void
}

// SearchInput.tsx
interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number  // default 300
}

// ConfirmDialog.tsx
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string  // default 'Confirmar'
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean       // botón rojo si true
}
```

---

## Hook: `useVerticalConfig`

```typescript
interface VerticalConfig {
  slug: string
  name: string
  features: {
    scheduling: boolean
    multiStop: boolean
    cargoDeclaration: boolean
    chainOfCustody: boolean
    temperatureLog: boolean
    b2bAccounts: boolean
    pricingModel: 'per_km_min' | 'per_declared_value' | 'flat_rate'
  }
}

// Hook: llama GET /config al montar, cachea con TanStack Query (staleTime: 5min)
// Retorna: { vertical: VerticalConfig | null, isLoading: boolean }
```

---

## Diseño de páginas

### TripsPage

```
Filtros: [Estado ▾] [Tipo ▾] [Desde: ____] [Hasta: ____]  [Buscar pasajero]
┌─────────────────────────────────────────────────────────────────────┐
│ ID (short) │ Pasajero     │ Conductor  │ Tipo    │ Estado  │ Fecha  │ Fare  │
│ a1b2c3     │ Juan Pérez   │ Pedro L.   │ Basic   │ ● COMP  │ 27 abr │ $85   │
│ ...        │              │            │         │         │        │       │
└─────────────────────────────────────────────────────────────────────┘
[← Anterior]  Página 1 de 12  [Siguiente →]
```

Al hacer click en fila → Modal con:
- Datos del viaje (origen, destino, distancia, duración)
- metadata del viaje (render como JSON coloreado si no está vacío)
- Historial de estados (timeline)

**Badge de estado:**
```
COMPLETED      → verde
IN_PROGRESS    → azul
SEARCHING      → amarillo parpadeante
CANCELLED_*    → rojo
SCHEDULED      → gris
```

---

### DriversPage

```
Filtros: [Estado onboarding ▾] [Buscar por nombre/tel]
┌─────────────────────────────────────────────────────────────────────┐
│ Nombre         │ Teléfono    │ Onboarding  │ Online │ Docs pendientes│ Acciones │
│ Pedro López    │ +5255...    │ ● approved  │ Sí     │ 0              │ [Suspender] │
│ Ana García     │ +5255...    │ ● review    │ No     │ 2 pendientes   │ [Ver docs]  │
└─────────────────────────────────────────────────────────────────────┘
```

Al click en "Ver docs" → Modal con lista de documentos + botones Aprobar/Rechazar por documento.

---

### CompanyDetailPage — tabs

```
← Empresas   /   Empresa Demo SA

[ Información ] [ Usuarios (3) ] [ Configuraciones (5) ]

── Tab Información ──────────────────────────────────────
Nombre:    Empresa Demo SA         Vertical: Taxi
Slug:      empresa-demo            Estado:   ● Activa
RFC:       ABC123456789
Email:     contacto@empresa.com
[Editar]                          [Desactivar empresa]

── Tab Usuarios ─────────────────────────────────────────
┌─────────────────────────────────────────────────────┐
│ Nombre     │ Teléfono    │ Rol    │ Desde  │ Acción │
│ Juan Pérez │ +5255...    │ owner  │ abr 27 │ [Quitar]│
└─────────────────────────────────────────────────────┘
[+ Vincular usuario]   (abre modal: buscar por teléfono + selector de rol)

── Tab Configuraciones ──────────────────────────────────
namespace: pricing
┌────────────────────────────────────────────────────┐
│ Key              │ Value          │ Acciones        │
│ discount_pct     │ 10             │ [Editar][Borrar] │
│ min_fare_override│ 30             │ [Editar][Borrar] │
└────────────────────────────────────────────────────┘
namespace: notifications
┌────────────────────────────────────────────────────┐
│ sms_enabled      │ false          │ [Editar][Borrar] │
└────────────────────────────────────────────────────┘
[+ Agregar configuración]
```

---

## ADR aplicable

### ADR-040 — Backoffice: Tailwind + componentes propios sobre librería externa

**Contexto:** El panel admin necesita una UI profesional. Opciones: Material UI, Ant Design, shadcn/ui, o componentes propios con Tailwind.

**Decisión:** Componentes propios con Tailwind CSS. No instalar librerías de UI adicionales. La librería interna vive en `apps/web/src/components/ui/`.

**Razón:** Stack más simple, sin conflictos de versiones, control total del styling, sin overhead de bundle que no se usa.

**Consecuencias:** Más código inicial, pero sin dependencias externas. Los componentes son reutilizables en el proyecto a largo plazo.

---

## Variables de entorno

```bash
# apps/web/.env
VITE_APP_NAME=RideBase       # ya existe
VITE_VERTICAL_SLUG=taxi      # 🆕 para el badge en header
```
