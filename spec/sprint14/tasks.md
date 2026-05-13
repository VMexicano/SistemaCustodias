# Tasks — Sprint 14: Mobile Vertical-aware UX

**Fecha:** 2026-04-27
**Sprint:** 14
**Condición de inicio:** Sprint 13 completo (SP13-QA-001 ✅)
**Estado global:** 🔲 Pendiente

---

## Tabla resumen

| ID | Título | Tipo | Estado |
|---|---|---|---|
| MOB14-001 | CargoDeclarationScreen (pasajero) | FEATURE | 🔲 |
| MOB14-002 | TemperatureLogScreen (conductor, cold-chain) | FEATURE | 🔲 |
| MOB14-003 | CustodyEventScreen (conductor, custody) | FEATURE | 🔲 |
| MOB14-004 | Integración: PassengerStack + DriverStack + ActiveTripScreen condicional | FEATURE | 🔲 |
| SP14-QA-001 | Tests mobile: 3 screens nuevos | QA_ONLY | 🔲 |

---

## Grafo de dependencias

```
(Sprint 13 ✅)
    ├── MOB14-001 (cargo declaration) ─┐
    ├── MOB14-002 (temperature log)   ─┤──→ MOB14-004 ──→ SP14-QA-001
    └── MOB14-003 (custody events)    ─┘
```

---

## Grupos de ejecución paralela

- **Grupo 1** (esperan Sprint 13): `MOB14-001 ∥ MOB14-002 ∥ MOB14-003`
- **Grupo 2** (esperan Grupo 1): `MOB14-004`
- **Grupo 3** (espera MOB14-004): `SP14-QA-001`

---

## Tareas detalladas

---

### MOB14-001 — CargoDeclarationScreen (pasajero)

- **Tipo:** FEATURE
- **Sprint:** 14
- **Agentes:** mobile
- **Depende de:** Sprint 13 (SP13-QA-001) — necesita `POST /trips` con `metadata.cargo`
- **Irreversible:** no

**Scope incluye:**
- `CargoDeclarationScreen.tsx` con 4 campos (cargo_description requerido, declared_value, recipient_name, recipient_phone)
- Al confirmar: llama `POST /trips` con `metadata: { cargo: formData }` + navega a `ActiveTrip`
- Validación inline: campo `cargo_description` no puede estar vacío
- Estilo consistente con las pantallas existentes (colores primary900/primary600)

**Scope excluye:**
- Upload de foto de la carga (Sprint futuro)
- Integración con bases de datos de mercancías peligrosas

**Criterios de aceptación (negocio):**
- Pasajero en vertical custody puede declarar carga y confirmar el viaje
- El campo cargo_description es obligatorio — botón deshabilitado si está vacío

**Criterios de aceptación (técnico):**
- El componente renderiza sin errores con `features.cargoDeclaration = true`
- `POST /trips` se llama con `metadata.cargo.cargo_description` correcto
- Con `cargo_description = ''` → botón confirmación disabled

**TDD specs:**
```typescript
describe('CargoDeclarationScreen', () => {
  it('renders all 4 fields')
  it('disables confirm button when cargo_description is empty')
  it('enables confirm button when cargo_description is filled')
  it('calls POST /trips with metadata.cargo on confirm')
  it('navigates to ActiveTrip after successful POST /trips')
})
```

**dependencies_verified:** `useTripStore` ya expone `createTrip` ✅ — extender para aceptar `metadata` en el body

---

### MOB14-002 — TemperatureLogScreen (conductor, cold-chain)

- **Tipo:** FEATURE
- **Sprint:** 14
- **Agentes:** mobile
- **Depende de:** Sprint 13 (VERT13-004)
- **Irreversible:** no

**Scope incluye:**
- `TemperatureLogScreen.tsx` con lista de lecturas (últimas 20) y temperatura actual destacada
- `useEffect` con `setInterval` (5 min) → `POST /trips/:id/temperature` con celsius actual
- Para MVP: celsius se ingresa manualmente vía `TextInput` (sin sensor Bluetooth)
- Indicador visual: verde si dentro de setpoints, rojo si fuera de rango
- `clearInterval` en cleanup del useEffect

**Scope excluye:**
- Integración con sensores Bluetooth/BLE
- Transmisión en background (expo-background-fetch) — MVP requiere pantalla montada
- Gráfica de temperatura (Sprint 15 en backoffice; mobile usa lista simple)

**Criterios de aceptación (negocio):**
- Conductor puede ingresar temperatura manualmente y se reporta automáticamente
- Lista muestra historial con timestamp y celsius

**Criterios de aceptación (técnico):**
- `GET /trips/:id/temperature?limit=20` se llama al montar
- `setInterval` crea un timer de 5min que se limpia al desmontar (sin memory leak)
- Indicador visual correcto con setpoints `{ min: 2, max: 8 }` y lectura `4.0°C` → verde
- Indicador correcto con lectura `10.0°C` → rojo

**TDD specs:**
```typescript
describe('TemperatureLogScreen', () => {
  it('fetches temperature history on mount')
  it('shows green indicator when celsius is within setpoints range')
  it('shows red indicator when celsius is outside setpoints range')
  it('shows neutral indicator when no setpoints provided')
  it('clears interval on unmount (no memory leak)')
  it('calls POST /trips/:id/temperature with celsius value')
})
```

---

### MOB14-003 — CustodyEventScreen (conductor, custody)

- **Tipo:** FEATURE
- **Sprint:** 14
- **Agentes:** mobile
- **Depende de:** Sprint 13 (VERT13-003)
- **Irreversible:** no

**Scope incluye:**
- `CustodyEventScreen.tsx` con historial de eventos (GET al montar) y formulario inline
- Selector de `event_type`: pick_up | handoff | delivery (RadioButton o segmented control)
- Botón "Foto" → `expo-image-picker` (launchCameraAsync + launchImageLibraryAsync)
- Campo de notas (TextInput multiline opcional)
- Al guardar → `POST /trips/:id/custody/events` → refresh GET
- Mostrar sequence y timestamp de cada evento en la lista

**Scope excluye:**
- Firma digital con stylus
- Geolocalización automática del evento (lat/lng se pasan como null en MVP)

**Criterios de aceptación (negocio):**
- Conductor puede registrar evento pick_up con foto y verlo en la lista actualizada
- Los eventos están en orden de secuencia (1, 2, 3...)

**Criterios de aceptación (técnico):**
- `GET /trips/:id/custody` se llama al montar y tras cada POST exitoso
- `expo-image-picker` se invoca al presionar botón "Foto"
- Con event_type no seleccionado → botón "Registrar" disabled
- Error 409 TRIP_NOT_ACTIVE → muestra mensaje de error al usuario

**TDD specs:**
```typescript
describe('CustodyEventScreen', () => {
  it('fetches custody events on mount')
  it('displays events ordered by sequence')
  it('disables submit when no event_type selected')
  it('calls POST /trips/:id/custody/events with correct payload')
  it('refreshes event list after successful POST')
  it('shows error message on 409 TRIP_NOT_ACTIVE')
  it('opens image picker on photo button press')
})
```

**dependencies_verified:**
- `expo-image-picker` debe estar en `apps/mobile-v2/package.json` — verificar antes de implementar
- Si no está: `pnpm add expo-image-picker --filter mobile-v2`

---

### MOB14-004 — Integración: PassengerStack + DriverStack + ActiveTripScreen condicional

- **Tipo:** FEATURE
- **Sprint:** 14
- **Agentes:** mobile
- **Depende de:** MOB14-001, MOB14-002, MOB14-003
- **Irreversible:** no

**Scope incluye:**
- Agregar `CargoDeclaration` a `PassengerStackParamList` y registrar en `PassengerStack.tsx`
- Agregar `CustodyEvent` y `TemperatureLog` a `DriverStackParamList` y registrar en `DriverStack.tsx`
- Modificar `EstimateScreen.tsx`: si `features.cargoDeclaration` → navegar a CargoDeclaration al confirmar
- Modificar `ActiveTripScreen.tsx` (driver): agregar botones condicionales según `features.chainOfCustody` y `features.temperatureLog`
- Verificar que vertical taxi: sin cambio visual en ninguna pantalla

**Scope excluye:**
- Cambios en RootNavigator (ya existe fire-and-forget de fetchConfig)
- Cambios en PassengerStack rutas existentes (Home, Estimate, ActiveTrip, SessionMenu, ScheduledTrips)

**Criterios de aceptación (negocio):**
- En vertical taxi: flujo de pasajero y conductor idéntico al previo al sprint
- En vertical custody: botón "Cadena de custodia" visible en ActiveTripScreen del conductor
- En vertical cold-chain: botón "Temperatura" visible en ActiveTripScreen del conductor (solo en IN_PROGRESS)

**Criterios de aceptación (técnico):**
- TypeScript: 0 errores en `apps/mobile-v2` tras los cambios
- `features.cargoDeclaration = false` → `EstimateScreen` navega directamente a confirmación (sin CargoDeclaration)
- `features.chainOfCustody = false` → botón custodia NO aparece en ActiveTripScreen

**TDD specs:**
```typescript
// En trip.store.test.ts o integration test
describe('PassengerStack navigation — cargo vertical', () => {
  it('navigates to CargoDeclaration when features.cargoDeclaration = true')
  it('skips CargoDeclaration when features.cargoDeclaration = false')
})

describe('DriverActiveTrip conditional buttons', () => {
  it('shows CustodyEvent button when features.chainOfCustody = true')
  it('hides CustodyEvent button when features.chainOfCustody = false')
  it('shows TemperatureLog button only when IN_PROGRESS and features.temperatureLog = true')
})
```

---

### SP14-QA-001 — Tests mobile: 3 screens nuevos

- **Tipo:** QA_ONLY
- **Sprint:** 14
- **Agentes:** qa
- **Depende de:** MOB14-004
- **Irreversible:** no

**Scope incluye:**
- `CargoDeclarationScreen.test.tsx`: 5 tests (spec MOB14-001)
- `TemperatureLogScreen.test.tsx`: 6 tests (spec MOB14-002)
- `CustodyEventScreen.test.tsx`: 7 tests (spec MOB14-003)
- Tests de integración de navegación: 4 tests (spec MOB14-004)
- Cobertura ≥ 80% por screen

**Scope excluye:**
- Tests E2E Detox (Sprint 15)
- Tests de TemperatureLog con Bluetooth real

---

## Definition of Done — Sprint 14

- [ ] `CargoDeclarationScreen` renderiza correctamente con features.cargoDeclaration = true
- [ ] `POST /trips` con metadata.cargo funcional desde el flujo pasajero
- [ ] `TemperatureLogScreen` envía POST /trips/:id/temperature y lista lecturas
- [ ] Intervalo de 5 min se limpia correctamente al desmontar
- [ ] `CustodyEventScreen` lista eventos, crea nuevos, muestra sequence
- [ ] Botones en ActiveTripScreen (conductor) condicionales según feature flags
- [ ] Vertical taxi: cero cambio en comportamiento visible
- [ ] TypeScript: 0 errores en apps/mobile-v2
- [ ] Tests: ≥ 80% cobertura en los 3 screens nuevos
- [ ] `expo-image-picker` en package.json del workspace mobile-v2

---

## Notas por agente

**mobile:**
- Usar `useVerticalFeatures()` (ya existe) para leer `cargoDeclaration`, `temperatureLog`, `chainOfCustody`
- `useTripStore` probablemente necesita un campo `createTrip(body)` que acepte `metadata` — verificar firma actual
- Para el setInterval de temperatura: calcular el tiempo restante al primer tick vs al montar (mostrar "próxima lectura en X min")
- Seguir el patrón de estilos de `HomeScreen.tsx` (colores primary900/primary600/primary50)

**qa:**
- Mockear `apiClient` con el mismo patrón de `apps/mobile-v2/src/__tests__/stores/trip.store.test.ts`
- Para expo-image-picker en tests: `jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn() }))`
- Verificar que `clearInterval` es llamado con `jest.useFakeTimers()` + `jest.runAllTimers()`
