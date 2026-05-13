# Sprint 12 — Tasks: Mobile Vertical-aware

## Resumen

| ID | Título | Tipo | Agentes | Depende de | Irreversible |
|---|---|---|---|---|---|
| MOB-001 | vertical.store + useVerticalFeatures + inicialización | FEATURE | mobile | Sprint 10 API | — |
| MOB-002 | Pantallas condicionales según features.scheduling | FEATURE | mobile | MOB-001 | — |
| MOB-003 | Rebuild APK + smoke test en emulador | FEATURE | mobile | MOB-002 | — |
| SP12-QA-001 | QA: tests store + regresión mobile | QA_ONLY | qa | MOB-001, MOB-002 | — |

## Grafo de dependencias

```
MOB-001 → MOB-002 → MOB-003
MOB-001 ─────────────────────→ SP12-QA-001
MOB-002 ─────────────────────→ SP12-QA-001
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| G1 | MOB-001 | Sprint 10 API corriendo (GET /config disponible) |
| G2 | MOB-002 ∥ SP12-QA-001 | MOB-001 ✅ |
| G3 | MOB-003 | MOB-002 ✅ + SP12-QA-001 ✅ |

---

## Detalle de tareas

---

### MOB-001 — `vertical.store.ts` + `useVerticalFeatures` + inicialización en RootNavigator

- **Tipo:** FEATURE
- **Sprint:** 12
- **Agentes:** mobile
- **Depende de:** Sprint 10 API (GET /config disponible)
- **Irreversible:** no

**Scope incluye:**
- Crear `apps/mobile-v2/src/stores/vertical.store.ts` (ver design.md para implementación completa)
- Crear `apps/mobile-v2/src/hooks/useVerticalFeatures.ts`
- Actualizar `apps/mobile-v2/src/config/env.ts`: agregar `verticalSlug: extra.verticalSlug ?? 'taxi'`
- Actualizar `apps/mobile-v2/app.json extra`: agregar `"verticalSlug": "taxi"`
- Actualizar `apps/mobile-v2/src/navigation/RootNavigator.tsx`: llamar `fetchConfig()` en `useEffect([], [])`

**Scope excluye:** cambios a pantallas (MOB-002), rebuild APK (MOB-003)

**Criterios de aceptación:**
- [ ] `useVerticalStore.getState().fetchConfig()` llama `GET /config` y actualiza el store
- [ ] Si la API no responde, el store mantiene el valor cacheado de MMKV
- [ ] Si no hay caché ni API, usa `DEFAULT_FEATURES` con `scheduling: true` (backward compatible)
- [ ] `ENV.verticalSlug` disponible como fallback de último recurso
- [ ] TypeScript strict: 0 errores

**schema_verified:** `GET /config` disponible desde Sprint 10
**dependencies_verified:** Zustand + MMKV + `createJSONStorage` ya instalados (patrón de auth.store)
**actor_resolution:** `GET /config` no requiere auth — llamar sin token

---

### MOB-002 — Pantallas condicionales según `features.scheduling`

- **Tipo:** FEATURE
- **Sprint:** 12
- **Agentes:** mobile
- **Depende de:** MOB-001

**Scope incluye:**
- `EstimateScreen.tsx`: renderizar CTA "Programar para después" solo si `features.scheduling === true`
- `HomeScreen.tsx`: renderizar botón "Mis programados" solo si `features.scheduling === true`
- Usar `useVerticalFeatures()` en ambas pantallas

**Scope excluye:** otras features (multiStop, cargoDeclaration, etc.) — se implementan cuando sus pantallas existan, condicionales adicionales para otros verticales

**Criterios de aceptación:**
- [ ] Vertical `taxi` (`scheduling: true`): ambos botones visibles — comportamiento idéntico al actual
- [ ] Vertical hipotético con `scheduling: false`: ambos botones ausentes del árbol React
- [ ] Sin regresiones en el flujo principal de viaje inmediato
- [ ] TypeScript strict: 0 errores

---

### MOB-003 — Rebuild APK + smoke test en emulador

- **Tipo:** FEATURE
- **Sprint:** 12
- **Agentes:** mobile
- **Depende de:** MOB-002 + SP12-QA-001

**Scope incluye:**
- Rebuild APK en emulador `Medium_Phone_API_36.0`
- Verificar `BUILD SUCCESSFUL` con los cambios del sprint
- Smoke test manual en emulador:
  - Login como pasajero (DEV ACCESO RÁPIDO)
  - HomeScreen: "Mis programados" visible (vertical taxi)
  - EstimateScreen: precios cargados + "Programar para después" visible
  - Confirmar que no hay errores en Metro ni en la app

**Scope excluye:** Detox E2E automático (validación manual es suficiente para este sprint)

**Criterios de aceptación:**
- [ ] `BUILD SUCCESSFUL` en el log de Gradle
- [ ] App abre sin crash en emulador
- [ ] Flujo taxi completo funciona (login → home → estimate)
- [ ] "Programar para después" visible en EstimateScreen
- [ ] No hay errores JS en Metro durante el smoke test

**Comandos de referencia:**
```bash
# Build (desde Junction C:\u\apps\mobile-v2\android):
./gradlew assembleDebug

# Instalar:
adb install app/build/outputs/apk/debug/app-debug.apk

# Conectar Metro:
cd apps/mobile-v2 && pnpm start

# Reverse ports:
adb reverse tcp:3333 tcp:3333
adb reverse tcp:8081 tcp:8081
```

---

### SP12-QA-001 — QA: tests store + regresión mobile

- **Tipo:** QA_ONLY
- **Sprint:** 12
- **Agentes:** qa
- **Depende de:** MOB-001, MOB-002

**Scope incluye:**
- `vertical.store.test.ts`: 4 casos (ver design.md)
- Casos adicionales en `EstimateScreen.test.ts`: scheduling true/false
- Correr suite mobile completa: `npx jest --testPathPattern=mobile-v2`
- Verificar cobertura: `vertical.store` ≥80%, cobertura mobile global no baja del 90%

**Criterios de aceptación:**
- [ ] `vertical.store.test.ts`: 4/4 tests pasan
- [ ] EstimateScreen tests de scheduling: 2 nuevos casos pasan
- [ ] Suite mobile completa: 0 fallos
- [ ] Cobertura global mobile ≥90% (era 90.2% antes del sprint)

---

## Definition of Done — Sprint 12

- [ ] `vertical.store.ts` implementado con persistencia MMKV y fallback offline
- [ ] EstimateScreen y HomeScreen ocultan scheduling si `features.scheduling === false`
- [ ] APK rebuild exitoso (`BUILD SUCCESSFUL`)
- [ ] Smoke test manual en emulador: flujo taxi funciona sin regresiones
- [ ] Tests: suite mobile 0 fallos, vertical.store ≥80%
- [ ] TypeScript strict: 0 errores en `apps/mobile-v2`
- [ ] Snapshot actualizado: `context/snapshots/trips.snapshot.md` (metadata), nuevo `context/snapshots/verticals.snapshot.md`

## Notas por agente

**Mobile:**
- `fetchConfig()` debe ser fire-and-forget en RootNavigator — nunca bloquear el render con await
- El patrón MMKV storage de Zustand ya existe en `auth.store.ts` — copiar el patrón exacto
- Para testear `features.scheduling=false`, mockear el store con `useVerticalStore.setState({ features: { ...DEFAULT_FEATURES, scheduling: false } })`

**QA:**
- Mock de `apiClient.get` para simular éxito, fallo de red, y respuesta inesperada
- Para el test de EstimateScreen con scheduling=false, usar `renderWithProviders` si existe en el proyecto, o wrappear con el store mockeado
