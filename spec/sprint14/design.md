# Design — Sprint 14: Mobile Vertical-aware UX

**Fecha:** 2026-04-27
**Sprint:** 14

---

## Estructura de directorios nuevos

```
apps/mobile-v2/src/
├── screens/
│   ├── passenger/
│   │   └── CargoDeclarationScreen.tsx       ← nuevo
│   └── driver/
│       ├── CustodyEventScreen.tsx            ← nuevo
│       └── TemperatureLogScreen.tsx          ← nuevo
├── hooks/
│   └── useVerticalFeatures.ts               ← ya existe
├── stores/
│   └── vertical.store.ts                    ← ya existe (flags nuevos en Sprint 13 seed)
└── navigation/
    ├── PassengerStack.tsx                   ← modificar: agregar CargoDeclaration ruta
    └── DriverStack.tsx                      ← modificar: agregar CustodyEvent + TemperatureLog rutas
```

---

## Flujos de navegación

### Pasajero — vertical con cargoDeclaration = true
```
HomeScreen → EstimateScreen → [seleccionar tipo] → CargoDeclarationScreen → confirmación → POST /trips
                                                     ↑
                                         features.cargoDeclaration = true
```

### Pasajero — vertical taxi (sin cambio)
```
HomeScreen → EstimateScreen → [seleccionar tipo] → confirmación → POST /trips
```

### Conductor — vertical custody
```
ActiveTripScreen → botón "Cadena de custodia" → CustodyEventScreen
                   (visible si features.chainOfCustody = true)
```

### Conductor — vertical cold-chain
```
ActiveTripScreen → botón "Temperatura" → TemperatureLogScreen
                   (visible si features.temperatureLog = true)
                   (transmisión automática cada 5 min cuando IN_PROGRESS)
```

---

## Interfaces TypeScript

### CargoDeclarationScreen
```typescript
// Params de navegación
type CargoDeclarationParams = {
  tripTypeId: string;
  originLat: number;
  originLng: number;
  originAddress: string;
  stops: Array<{ lat: number; lng: number; address: string }>;
  estimatedFare: number;
};

// Datos del formulario (guardados en trips.metadata.cargo)
interface CargoData {
  cargo_description: string;       // requerido
  declared_value?: number;
  recipient_name?: string;
  recipient_phone?: string;
}
```

### CustodyEventScreen
```typescript
type CustodyEventParams = {
  tripId: string;
};

interface CustodyEventForm {
  event_type: 'pick_up' | 'handoff' | 'delivery';
  photo_uri?: string;              // URI local en MVP
  notes?: string;
}
```

### TemperatureLogScreen
```typescript
type TemperatureLogParams = {
  tripId: string;
  setpoints?: { min_celsius: number; max_celsius: number };
};

interface TemperatureReading {
  celsius: number;
  recorded_at: string;
  sensor_id: string | null;
}
```

---

## Componentes clave

### CargoDeclarationScreen
```
┌─────────────────────────────┐
│ ← Declaración de carga      │
├─────────────────────────────┤
│ Descripción *               │
│ [TextInput]                 │
├─────────────────────────────┤
│ Valor declarado (MXN)       │
│ [TextInput numeric]         │
├─────────────────────────────┤
│ Nombre del destinatario     │
│ [TextInput]                 │
├─────────────────────────────┤
│ Teléfono del destinatario   │
│ [TextInput phone]           │
├─────────────────────────────┤
│     [Confirmar y solicitar] │
└─────────────────────────────┘
```

Al presionar "Confirmar": llama `POST /trips` con `metadata: { cargo: formData }` y navega a `ActiveTrip`.

### TemperatureLogScreen
```
┌─────────────────────────────┐
│ ← Monitoreo de temperatura  │
│ ● EN VIVO  Próx. lectura: 3m│
├─────────────────────────────┤
│ Temperatura actual          │
│      ◉ 4.2°C               │
│   ✅ Dentro del rango (2-8°C)│
├─────────────────────────────┤
│ Historial                   │
│ 14:30 — 4.2°C               │
│ 14:25 — 4.1°C               │
│ 14:20 — 4.3°C               │
│ ...                         │
└─────────────────────────────┘
```

- `useEffect` con `setInterval(5 * 60 * 1000)` → llama `POST /trips/:id/temperature`
- Cleanup: `clearInterval` al desmontar
- Carga historial con `GET /trips/:id/temperature?limit=20` al montar

### CustodyEventScreen
```
┌─────────────────────────────┐
│ ← Cadena de custodia        │
├─────────────────────────────┤
│ Evento 1 — Recogida  14:00  │
│ Evento 2 — En tránsito 14:05│
├─────────────────────────────┤
│ [+ Agregar evento]          │
│  ○ Recogida  ○ Traspaso  ○ Entrega
│ Foto: [📷 Tomar foto]       │
│ Notas: [TextInput]          │
│ [Registrar]                 │
└─────────────────────────────┘
```

- Carga historial con `GET /trips/:id/custody` al montar y tras cada POST exitoso
- Foto via `expo-image-picker` (ImagePicker.launchCameraAsync)

---

## Cambios en PassengerStack.tsx

```typescript
// Nuevas rutas a registrar
type PassengerStackParamList = {
  Home: undefined;
  Estimate: EstimateParams;
  CargoDeclaration: CargoDeclarationParams;   // ← nuevo
  ActiveTrip: undefined;
  SessionMenu: undefined;
  ScheduledTrips: undefined;
  ScheduleConfirm: ScheduleConfirmParams;
};
```

### Navegación condicional desde EstimateScreen
```typescript
const features = useVerticalFeatures();

const handleConfirm = () => {
  if (features.cargoDeclaration) {
    navigation.navigate('CargoDeclaration', { tripTypeId, originLat, ... });
  } else {
    void createTrip({ ... });  // flujo existente
  }
};
```

---

## Cambios en DriverStack.tsx

```typescript
type DriverStackParamList = {
  Online: undefined;
  TripRequest: TripRequestParams;
  ActiveTrip: undefined;
  CustodyEvent: CustodyEventParams;     // ← nuevo
  TemperatureLog: TemperatureLogParams; // ← nuevo
  SessionMenu: undefined;
};
```

### Botones condicionales en ActiveTripScreen (conductor)
```typescript
const features = useVerticalFeatures();

{features.chainOfCustody && tripStatus !== 'COMPLETED' && (
  <TouchableOpacity onPress={() => navigation.navigate('CustodyEvent', { tripId })}>
    <Text>Cadena de custodia</Text>
  </TouchableOpacity>
)}

{features.temperatureLog && tripStatus === 'IN_PROGRESS' && (
  <TouchableOpacity onPress={() => navigation.navigate('TemperatureLog', { tripId, setpoints: trip.metadata?.setpoints })}>
    <Text>Temperatura</Text>
  </TouchableOpacity>
)}
```

---

## ADRs aplicables

| ADR | Aplicación |
|---|---|
| ADR-036 | verticals.features como feature flags — se agregan cargoDeclaration, temperatureLog, chainOfCustody |
| ADR-044 | UX mobile vía feature flags — implementación directa de este sprint |
| ADR-041 | custody_events append-only — la pantalla nunca ofrece editar o eliminar eventos |

---

## Variables de entorno nuevas

Ninguna — usa las mismas variables del Sprint 12.

---

## Dependencias nuevas requeridas (verificar en package.json)

```json
// apps/mobile-v2/package.json
"expo-image-picker": "~15.0.7"   // para foto en CustodyEventScreen
```

Si no está instalada: `pnpm add expo-image-picker --filter mobile-v2`
