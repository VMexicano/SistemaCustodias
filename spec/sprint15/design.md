# Design — Sprint 15: Backoffice Enrichment + Clone Kit

**Fecha:** 2026-04-27
**Sprint:** 15

---

## Estructura de cambios

```
apps/web/src/
├── pages/
│   ├── TripsPage.tsx           ← modificar: agregar tabs Temperatura + Custodia al modal
│   └── VerticalesPage.tsx      ← modificar: agregar botón Editar + modal editor
└── components/ui/
    └── (sin nuevos componentes — usa Modal y Badge existentes)

docs/
└── VERTICAL_CLONE_GUIDE.md     ← nuevo

apps/api/seeds/templates/
└── vertical.template.ts        ← nuevo

.env.vertical.example           ← nuevo (raíz del monorepo)
```

---

## Trip Detail Modal — extensión de tabs

El modal existente en `TripsPage.tsx` tiene estructura de tabs. Se agregan 2 tabs condicionales.

### Lógica de tabs activos
```typescript
// Solo mostrar tab si hay datos
const [hasTemperature, setHasTemperature] = useState(false);
const [hasCustody, setHasCustody] = useState(false);

// Al abrir el modal para un viaje
useEffect(() => {
  if (!selectedTrip) return;
  // Verificación lazy: hacer ambas queries
  api.get<{ readings: unknown[] }>(`/trips/${selectedTrip.id}/temperature`)
    .then(r => setHasTemperature(r.readings.length > 0))
    .catch(() => {});
  api.get<{ events: unknown[] }>(`/trips/${selectedTrip.id}/custody`)
    .then(r => setHasCustody(r.events.length > 0))
    .catch(() => {});
}, [selectedTrip]);

// Tabs: [...existentes, hasTemperature && 'temperatura', hasCustody && 'custodia'].filter(Boolean)
```

### Tab Temperatura (Recharts)
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

// Data shape para Recharts
const chartData = readings.map(r => ({
  time: new Date(r.recorded_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  celsius: r.celsius,
}));

<LineChart width={500} height={250} data={chartData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="time" />
  <YAxis domain={['auto', 'auto']} unit="°C" />
  <Tooltip formatter={(v) => [`${v}°C`, 'Temperatura']} />
  {setpoints && <ReferenceLine y={setpoints.min_celsius} stroke="blue" strokeDasharray="3 3" label="Min" />}
  {setpoints && <ReferenceLine y={setpoints.max_celsius} stroke="red" strokeDasharray="3 3" label="Max" />}
  <Line type="monotone" dataKey="celsius" stroke="#2E75B6" dot={false} />
</LineChart>

// Summary cards
<div className="grid grid-cols-4 gap-2 mt-3">
  <SummaryCard label="Mínima" value={`${summary.min}°C`} />
  <SummaryCard label="Máxima" value={`${summary.max}°C`} />
  <SummaryCard label="Promedio" value={`${summary.avg.toFixed(1)}°C`} />
  <SummaryCard label="Fuera de rango" value={summary.out_of_range_count} variant={summary.out_of_range_count > 0 ? 'red' : 'green'} />
</div>
```

### Tab Custodia (timeline)
```typescript
// Timeline vertical de eventos
events.map((ev, i) => (
  <div key={ev.id} className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold">
        {ev.sequence}
      </div>
      {i < events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
    </div>
    <div className="pb-4">
      <div className="flex items-center gap-2">
        <Badge variant={ev.event_type === 'delivery' ? 'green' : 'blue'} label={EVENT_LABELS[ev.event_type]} />
        <span className="text-xs text-gray-400">{formatDate(ev.occurred_at)}</span>
      </div>
      <p className="text-sm text-gray-700 mt-1">{ev.actor_name}</p>
      {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
      {ev.photo_url && (
        <a href={ev.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 mt-1 block">
          📷 Ver foto
        </a>
      )}
    </div>
  </div>
))
```

---

## Vertical Editor Modal

```typescript
interface VerticalEditForm {
  name: string;
  description: string;
  features: {
    scheduling: boolean;
    multiStop: boolean;
    b2bAccounts: boolean;
    cargoDeclaration: boolean;
    temperatureLog: boolean;
    chainOfCustody: boolean;
    pricingModel: 'per_km_min' | 'fixed_rate' | 'per_weight_km';
  };
}
```

### UI del modal editor
```
┌────────────────────────────────┐
│ Editar vertical: Taxi          │
├────────────────────────────────┤
│ Nombre          [Taxi        ] │
│ Descripción     [TextArea    ] │
├────────────────────────────────┤
│ Features                       │
│ Viajes programados    [●  ]   │
│ Múltiples paradas     [○  ]   │
│ Cuentas B2B           [○  ]   │
│ Declaración de carga  [○  ]   │
│ Log de temperatura    [○  ]   │
│ Cadena de custodia    [○  ]   │
├────────────────────────────────┤
│ Modelo de pricing              │
│ [▼ Por km + minuto          ] │
├────────────────────────────────┤
│ [Cancelar]      [Guardar]     │
└────────────────────────────────┘
```

### Contrato de PATCH (ya existe en Sprint 10)
```typescript
PATCH /admin/verticals/:id
{ name?: string, description?: string, features?: Partial<VerticalFeatures> }
→ 200 { id, slug, name, description, features, updated_at }
```

---

## Clone Starter Kit — estructura de archivos

### docs/VERTICAL_CLONE_GUIDE.md (outline)
```
# Vertical Clone Guide

## Prerrequisitos
## Paso 1 — Clonar el repositorio
## Paso 2 — Configurar variables de entorno
## Paso 3 — Levantar el stack Docker
## Paso 4 — Ejecutar migraciones
## Paso 5 — Crear el seed de tu vertical
## Paso 6 — Configurar VERTICAL_SLUG
## Paso 7 — Configurar features del vertical
## Paso 8 — Requisitos de conductor específicos
## Paso 9 — Verificar GET /config
## Paso 10 — Compilar APK Android
## Referencia — Verticales existentes (taxi, custody, cold-chain)
## Checklist final de verificación
```

### apps/api/seeds/templates/vertical.template.ts (outline)
```typescript
// Plantilla comentada para crear un nuevo vertical
// 1. Copiar este archivo como seeds/09_mi_vertical.ts
// 2. Reemplazar los valores marcados con [CAMBIAR]
// 3. Ejecutar: pnpm knex seed:run --specific=09_mi_vertical.ts

export async function seed(knex: Knex): Promise<void> {
  // Insertar vertical
  // Insertar trip_types para el vertical
  // Insertar document_requirements con vertical_id
  // Insertar empresa de ejemplo
}
```

---

## Dependencias verificadas

| Librería | Workspace | Estado |
|---|---|---|
| recharts | apps/web | Verificar en package.json antes de implementar |
| @tanstack/react-query | apps/web | ✅ existe |
| Modal, Badge (ui) | apps/web/src/components/ui | ✅ creados en Sprint 11 |

Si recharts no está: `pnpm add recharts --filter web`

---

## ADRs aplicables

| ADR | Aplicación |
|---|---|
| ADR-040 | GET /trips/:id/temperature — datos de la hypertable para chart |
| ADR-041 | GET /trips/:id/custody — log append-only para timeline |
| ADR-045 | Clone Kit como documentación estática |
| ADR-036 | PATCH /admin/verticals/:id — editar features JSONB |
