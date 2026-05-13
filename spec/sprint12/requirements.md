# Sprint 12 — Requisitos: Mobile Vertical-aware

## Objetivo

Integrar el sistema de verticales en la app mobile. Al terminar este sprint, la app lee la
configuración del vertical activo al arrancar y adapta su navegación y features en consecuencia.
La app funciona offline usando el vertical cacheado en MMKV. El APK se reconstruye y valida
en emulador.

---

## Scope

| Incluye | Excluye |
|---|---|
| `vertical.store.ts` con Zustand + MMKV | Pantallas específicas de custody/cold-chain |
| Fetch `GET /config` al arrancar app | Rebuild APK para iOS |
| Navegación condicional según features del vertical | Multi-tenant auth (login por empresa) |
| Fallback offline desde `app.json extra.verticalSlug` | Push notifications por vertical |
| Tests unitarios del store | E2E Detox completo (validar con Metro en emulador) |
| Rebuild APK Android + smoke test en emulador | |
| Smoke test E2E: flujo completo taxi (login → cotizar → programar si `scheduling:true`) | |

---

## Actores

| Actor | Interés en el sprint |
|---|---|
| Pasajero (app mobile) | La app muestra solo las opciones relevantes para el vertical activo |
| Dev/QA | El APK buildea limpio; el flujo taxi sigue funcionando tras los cambios |

---

## Requerimientos funcionales

### RF-1201 — Carga de vertical config al arrancar
**Como** usuario de la app mobile,
**quiero** que la app sepa qué vertical está activo,
**para** ver solo las opciones y flujos relevantes para ese vertical.

Criterios de aceptación:
- [ ] Al abrir la app, se llama `GET /config` y el resultado se almacena en `vertical.store`
- [ ] Si `GET /config` falla (sin red), se usa el último valor cacheado en MMKV
- [ ] Si no hay caché y no hay red, se usa `ENV.verticalSlug` de `app.json extra` como fallback final

### RF-1202 — Navegación condicional por features
**Como** usuario de la app mobile en vertical `taxi`,
**quiero** que el botón "Programar para después" sea visible,
**para** poder agendar un viaje futuro.

**Como** usuario de la app mobile en un vertical sin `scheduling`,
**quiero** que el botón de programar no aparezca,
**para** no ver opciones que no aplican a mi servicio.

Criterios de aceptación:
- [ ] `features.scheduling === false` → ocultar "Programar para después" en EstimateScreen y HomeScreen
- [ ] `features.scheduling === true` → mostrar normalmente (comportamiento actual del vertical taxi)
- [ ] El cambio es reactivo: si el store cambia (nueva sesión), la UI refleja el nuevo estado

### RF-1203 — Validación en emulador
**Como** QA,
**quiero** verificar el flujo completo en el emulador Android,
**para** confirmar que el APK funciona correctamente con los cambios del sprint.

Criterios de aceptación:
- [ ] APK buildea sin errores (`BUILD SUCCESSFUL`)
- [ ] Login como pasajero → HomeScreen → EstimateScreen → "Programar para después" visible (vertical taxi)
- [ ] El vertical badge correcto aparece en la pantalla de login o home (si `ENV.appName` del vertical está disponible)

---

## Requerimientos no funcionales

- El fetch de `/config` no debe bloquear el arranque de la app — carga en background
- MMKV como storage (ya disponible en el proyecto)
- TypeScript strict: 0 errores en `apps/mobile-v2`
- Tests del store: ≥80% cobertura

---

## Restricciones técnicas inamovibles

- Zustand 4 + MMKV (patrón ya establecido en `auth.store.ts`)
- `ENV.verticalSlug` leído desde `Constants.expoConfig.extra.verticalSlug` (agregar al `app.json`)
- No se puede leer variables de entorno en runtime en Expo Bare — todo config viene de `app.json extra` o del API
