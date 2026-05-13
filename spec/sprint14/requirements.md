# Requirements — Sprint 14: Mobile Vertical-aware UX

**Fecha:** 2026-04-27
**Sprint:** 14
**Tipo:** FEATURE
**Depende de:** Sprint 13 completo (APIs custody + temperature disponibles)

---

## Objetivo

Entregar las pantallas mobile que permiten a pasajeros y conductores de los verticales de custodia y cadena de frío operar el servicio completo desde la app: declarar la carga antes de solicitar, registrar eventos de cadena de custodia con foto, y monitorear temperatura activa durante el viaje — todo habilitado/deshabilitado por feature flags sin afectar el vertical de taxi.

---

## Scope

| Incluye | Excluye |
|---|---|
| CargoDeclarationScreen (pasajero — custody + cold-chain) | App iOS (solo Android en MVP) |
| TemperatureLogScreen (conductor — cold-chain) | Alertas en tiempo real de temperatura (Sprint futuro) |
| CustodyEventScreen (conductor — custody) | Firma digital criptográfica |
| Integración en PassengerStack + DriverStack con rutas condicionales | Mapa de ruta de la cadena de custodia |
| Unit tests de los 3 screens nuevos | Tests E2E Detox (Sprint 15) |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| Pasajero (custody/cold-chain) | Declarar la carga (descripción, valor, destinatario) antes de confirmar el viaje |
| Conductor (custody) | Registrar cada evento (recogida, entrega) con foto y notas desde la app |
| Conductor (cold-chain) | Ver lecturas de temperatura actuales y enviarlas al servidor automáticamente |
| Administrador | Confirmar que los flujos no afectan a usuarios del vertical taxi |

---

## Requerimientos funcionales

### RF-1401 — Declaración de carga antes de solicitar viaje

**Como** cliente del vertical de custodia o cadena de frío,  
**quiero** declarar la carga antes de confirmar el viaje (descripción, valor declarado, destinatario),  
**para** que el conductor y la empresa tengan la información necesaria para el servicio.

**Criterios de aceptación:**
- [ ] `CargoDeclarationScreen` solo aparece cuando `features.cargoDeclaration = true`
- [ ] La pantalla se navega después de seleccionar el tipo de viaje en `EstimateScreen` y antes de confirmar
- [ ] Campos: `cargo_description` (texto requerido), `declared_value` (número opcional), `recipient_name` (texto opcional), `recipient_phone` (texto opcional)
- [ ] El formulario guarda los datos en `trips.metadata.cargo` al crear el viaje vía `POST /trips`
- [ ] Con `features.cargoDeclaration = false` (taxi), el flujo EstimateScreen → confirmación no cambia

### RF-1402 — Monitoreo de temperatura (conductor cold-chain)

**Como** conductor de cadena de frío,  
**quiero** ver las lecturas de temperatura del compartimento y que se reporten automáticamente,  
**para** que el cliente pueda verificar que la cadena de frío se mantuvo.

**Criterios de aceptación:**
- [ ] `TemperatureLogScreen` solo es accesible cuando `features.temperatureLog = true`
- [ ] Se accede desde `ActiveTripScreen` (conductor) mediante un botón visible durante `IN_PROGRESS`
- [ ] La pantalla muestra las últimas 20 lecturas en orden cronológico descendente
- [ ] Envía `POST /trips/:id/temperature` cada 5 minutos automáticamente mientras el viaje está en `IN_PROGRESS`
- [ ] Muestra alerta visual si la lectura más reciente está fuera de los setpoints de `trips.metadata.setpoints`
- [ ] La transmisión automática se detiene cuando el viaje sale de `IN_PROGRESS`

### RF-1403 — Cadena de custodia (conductor custody)

**Como** conductor de custodia de valores,  
**quiero** registrar cada evento de la cadena (recogida, traspaso, entrega) con foto desde la app,  
**para** mantener un registro auditable del manejo del bien custodiado.

**Criterios de aceptación:**
- [ ] `CustodyEventScreen` solo es accesible cuando `features.chainOfCustody = true`
- [ ] Se accede desde `ActiveTripScreen` (conductor) durante `ACCEPTED` o `IN_PROGRESS`
- [ ] La pantalla muestra el historial de eventos (secuencia) del viaje actual
- [ ] El conductor puede agregar un evento seleccionando `event_type` + tomando foto opcional + escribiendo notas
- [ ] Al guardar se llama `POST /trips/:id/custody/events` y se refresca la lista
- [ ] La foto se toma con `expo-image-picker` y la URL se incluye en el evento

### RF-1404 — Integración vertical-aware en navegación

**Como** sistema,  
**quiero** que PassengerStack y DriverStack registren las nuevas pantallas pero solo naveguen a ellas según feature flags,  
**para** que el bundle contenga todas las pantallas sin afectar la UX del vertical taxi.

**Criterios de aceptación:**
- [ ] `PassengerStack` incluye ruta `CargoDeclaration` registrada (sin romper rutas existentes)
- [ ] `DriverStack` incluye rutas `CustodyEvent` y `TemperatureLog` registradas
- [ ] En vertical taxi: flujo de pasajero y conductor es idéntico al Sprint 13 (sin cambio visual)
- [ ] En vertical custody: botón "Cadena de custodia" visible en `ActiveTripScreen` del conductor
- [ ] En vertical cold-chain: botón "Temperatura" visible en `ActiveTripScreen` del conductor

---

## Requerimientos no funcionales

- La transmisión automática de temperatura usa `setInterval` (no expo-background-fetch para simplificar MVP) — se detiene al desmontarse el componente via `clearInterval` en `useEffect` cleanup
- Las fotos se seleccionan desde la galería o cámara; se asume URL ya subida (el MVP no implementa upload — se pasa la URI local como placeholder hasta tener storage en Sprint futuro)
- Cobertura de unit tests: ≥ 80% por screen nuevo

---

## Restricciones técnicas

- `expo-image-picker` debe ser dependencia directa en `apps/mobile-v2/package.json` (regla Sprint 9: verificar deps en package.json del workspace)
- El bundle size no debe superar 80MB con las nuevas pantallas incluidas (ADR-044)
- No se implementa la lógica de subida de imágenes a storage — la `photo_url` en el MVP es la URI local del dispositivo
- La transmisión de temperatura en background requiere que la pantalla esté montada (limitación aceptada para MVP)

---

## Decisiones pendientes (no bloquean)

- Upload de imágenes a S3/Cloudflare R2 para foto en custody events (Sprint futuro)
- Transmisión de temperatura en segundo plano cuando la app está minimizada (requiere expo-background-fetch + permisos adicionales)
- Visualización de mapa de ruta con puntos de custodia (Sprint futuro)
