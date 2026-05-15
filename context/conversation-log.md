# Conversation Log — SistemaCustodias

> Historial cronológico de sesiones de trabajo.
> Al inicio de cada sesión: leer las últimas 2 entradas para retomar contexto.
> Al finalizar: ejecutar /session-end para agregar la entrada automáticamente.

---

## Sesiones

### [2026-05-15] — Debug setup mobile: AddressPickerField + fix roles + fix Android MapboxGL

**Agentes usados:** ninguno (sesión de implementación directa)
**Módulos tocados:** mobile (LoginScreen, NewCustodyOrderScreen, CustodyActiveOrderScreen, custody.store, auth.store), componente AddressPickerField
**Tipo de contexto:** [MOBILE]

#### Qué se hizo

- **Fix crítico LoginScreen**: el mapeo de rol en `handleVerifyOtp` siempre resolvía a `'driver'` o `'passenger'` — los actores custodio/copiloto/client nunca llegaban a su stack correcto. Se agregó `resolveRole(roles[])` con prioridad custodio > copiloto > client > dispatcher > supervisor > driver > passenger
- **Panel DEV extendido**: panel de acceso rápido ahora tiene 7 actores (cliente 0099, supervisor 0098, dispatcher 0097, custodio 0096, copiloto 0095, pasajero 0001, conductor 0002) con color por rol y scroll horizontal
- **UserRole ampliado**: `auth.store.ts` agrega `dispatcher | supervisor` al tipo union (necesarios para el panel DEV y acceso web)
- **Reactotron instrumentado**: `tlog`/`tlogError` en `CustodyActiveOrderScreen` — loguea carga de orden, carga de ruta, y cada transición de estado (inicio + éxito + error)
- **AddressPickerField** (`src/components/`): componente nuevo reutilizable con: autocomplete Mapbox debounceado 380ms + biased por GPS, botón GPS (expo-location + reverseGeocode), modal mapa full-screen con crosshair pan-to-select, parseo de `place_name` en `{street, city, state, lat, lng}`, hint de coordenadas visible tras selección
- **NewCustodyOrderScreen refactorizado**: reemplaza 6 `TextInput` independientes por 2 `AddressPickerField`, envía `lat/lng` al API (ya aceptados por `addressSchema`), botón Continuar deshabilitado hasta que ambas direcciones tengan `street`
- **custody.store.ts**: `AddressValue { street, city, state, lat?, lng? }` reemplaza los 6 campos planos `pickup/deliveryStreet/City/State`
- **Fix bug Android Modal + MapboxGL**: cuando dos `AddressPickerField` están en pantalla, sus `MapboxGL.MapView` coexistían en el árbol nativo (Android no desmonta hijos de Modal cuando `visible=false`). `onRegionDidChange` de un mapa contaminaba el `mapCenterRef` del otro → ambos campos resolvían las mismas coordenadas. Fix: `{mapVisible && <MapboxGL.MapView>}` dentro del Modal + `animationDuration={0}` en Camera

#### Estado resultante

| Módulo | Estado antes | Estado después |
|---|---|---|
| Mobile LoginScreen | Bug: todos los roles → passenger/driver | ✅ Roles custody mapeados correctamente |
| Mobile NewCustodyOrderScreen | 6 TextInput sin coordenadas | ✅ AddressPickerField × 2 con lat/lng |
| Mobile AddressPickerField | No existía | ✅ Autocomplete + GPS + mapa |
| custody.store | Campos planos sin coordenadas | ✅ AddressValue con lat/lng |
| Reactotron | Solo configurado | ✅ Instrumentado en pantallas clave |

#### Decisiones tomadas

- **Android Modal + MapboxGL**: siempre usar `{modalVisible && <MapboxGL.MapView>}` dentro de un `Modal` para evitar doble instancia nativa. Esto aplica a cualquier componente que use MapboxGL dentro de un Modal en este proyecto.
- **resolveRole prioridad**: custodio > copiloto > client > dispatcher > supervisor > driver > passenger — el primer rol de mayor prioridad gana (un usuario puede tener múltiples roles en el array)
- `animationDuration={0}` en `MapboxGL.Camera` dentro de modales: evita re-animaciones en re-renders que disparan `onRegionDidChange` espurios

#### Próximo paso

Debug end-to-end: correr el flujo completo con los actores de seed (cliente crea orden → dispatcher aprueba y asigna → custodio+copiloto confirman → transiciones hasta DELIVERED). Verificar con Reactotron que los logs sean correctos en cada transición.

#### Bloqueos

Ninguno. TypeScript: 0 errores. No se corrieron tests en esta sesión (cambios fueron de UI/UX).

---

### [2026-05-14] — Sprint 3 + Sprint 4: custody-orders completo + value-declaration + CustodyClientStack mobile

**Agentes usados:** orchestrator, planner, architect, backend, mobile, qa
**Módulos tocados:** custody-orders, value-declaration, mobile (CustodyClientStack)
**Tipo de contexto:** [ORDERS] [VALUE_DECL] [MOBILE]

#### Qué se hizo

**Sprint 3 (verificación al inicio):**
- Verificados 105/105 tests + 0 errores TypeScript — Sprint 3 ya estaba completo

**Sprint 4 (implementación completa):**
- `GET /custody-types` — lista tipos activos con JSON Schema para el form mobile
- `POST /orders/:id/value-declaration` — upsert con validación Ajv dinámica desde JSONB schema del tipo
- `GET /orders/:id/value-declaration` — consulta declaración existente
- `DECLARABLE_STATUSES` guard: solo DRAFT y PENDING_APPROVAL permiten declarar
- Seed 13: client (+525500000099) + supervisor (+525500000098) usuarios test para E2E
- E2E smoke test: create order → declare values → submit → PENDING_APPROVAL
- Mobile `custody.store.ts`: Zustand con `NewOrderDraft`, `setDraft`, `clearDraft`
- `SelectCustodyTypeScreen`: FlatList de tipos, seleccionar llena el draft
- `NewCustodyOrderScreen`: formulario pickup + delivery address
- `ValueDeclarationScreen`: form dinámico generado desde JSON Schema, coerciones de tipo, submit doble (POST + PATCH)
- `auth.store.ts`: `UserRole` extendido con `client | custodio | copiloto`
- `RootNavigator`: ruteo `role === 'client'` → `CustodyClientStack`

#### Estado resultante

| Módulo | Estado antes | Estado después |
|---|---|---|
| `custody-orders` | ✅ Sprint 3 | ✅ Sprint 3 (sin cambios) |
| `value-declaration` | ⬜ Pendiente | ✅ Sprint 4 |
| Mobile CustodyClientStack | ⬜ Pendiente | ✅ Sprint 4 (3 pantallas) |

#### Decisiones tomadas

- Ajv instalado como dependencia directa (no confiar en el Ajv interno de Fastify) — necesario para validación en service layer
- Column `declared_value` (singular) — la migración real difiere del spec del sprint que decía `declared_values`
- `trx` en tests de Knex debe ser `jest.fn().mockImplementation((table) => chain)` — no un objeto plano
- Factory explícita en `jest.mock()` para `api.client` — auto-mock falla en React Native por carga de axios

#### Próximo paso

Sprint 5 — módulo `tracking`: PATCH /orders/:id/location (GPS), GET /orders/:id/track, WebSocket live, TimescaleDB hypertable `location_readings` (M-047 ya existe).

#### Bloqueos

Ninguno. 22/22 tests nuevos pasando. Integration tests preexistentes (requieren Docker) no afectados.

---

## 2026-05-13 — Sprint 0: Setup de infraestructura de IA

**Tipo de tarea:** [PLANNING]
**Agentes usados:** ninguno (sesión de setup manual)
**Módulos tocados:** todos (infraestructura global)

**Decisiones tomadas:**
- Repositorio SistemaCustodias creado como fork clean de UBER_BASE
- 5 actores definidos: client, custodio, copiloto, dispatcher, supervisor
- 4 tipos de custodia iniciales (escalables via JSONB): cash_transport, high_value_package, confidential_docs, vip_escort
- CustodyStateMachine diseñada con 16 estados y transiciones explícitas
- Aprobación obligatoria (ADR-005) y regla dos-personas (ADR-006) confirmadas
- Nuevo agente `compliance` agregado al equipo
- App mobile con dos flujos: cliente y operador

**Archivos creados/actualizados:**
- CLAUDE.md (reescrito para dominio de custodias)
- context/project-index.md (nuevo — schema, actores, ADRs)
- context/router.md (19 rutas de contexto)
- context/session.md (reset a Sprint 0)
- AGENTS.md (6 agentes: architect, backend, qa, mobile, devops, compliance)
- .claude/settings.json (proyecto SistemaCustodias)
- steering/coding-standards.md, testing-standards.md, architecture.md, product.md
- context/snapshots/: custody-orders, operadores, alerts, mobile, compliance, auth, tracking, admin, notifications

**Estado resultante:**
- Infraestructura de IA lista para Sprint 1
- Próximo: definir Sprint 1 (auth + clients + schema inicial de BD)
