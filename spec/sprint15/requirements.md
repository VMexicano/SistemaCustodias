# Requirements — Sprint 15: Monitor Engine

## Objetivo

Implementar el Monitor Engine de SistemaCustodias: el componente que verifica la autenticidad de cada CustodyEvent registrado. Al recibir un evento, el sistema obtiene un timestamp independiente del proveedor GPS (canal separado al de la app), lo compara contra el timestamp de la app, re-verifica el hash de integridad y detecta GPS falso — emitiendo alertas automáticas al supervisor cuando detecta anomalías.

---

## Scope

| Incluye | Excluye |
|---|---|
| `IGpsProvider` interface TypeScript | WinlogAdapter real (requiere contrato con Winlog) |
| `MockGpsAdapter` para MVP | Integración HTTP con proveedor GPS externo |
| `MonitorRepository` con CAS en `auto_timestamp` | Endpoints REST del Monitor Engine |
| `MonitorEngine` service con 4 checks | WebSocket broadcast de alertas de fraude |
| BullMQ queue `monitor-engine` + worker | Suspensión automática del operador |
| Wiring en `CustodyEventService.createEvent()` | Reportes regulatorios a SSP/Aseguradora |
| Alertas de fraude vía AlertEngine existente | Cron de barrido periódico (ADR-025) |
| Tests MonitorEngine 100% cobertura | Tests de MonitorRepository/worker (integration) |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| **Supervisor** | Recibe alertas automáticas cuando se detecta fraude o manipulación |
| **Sistema (Monitor Engine)** | Verifica autenticidad de cada evento sin intervención humana |
| **Custodio / Copiloto** | Sus eventos son verificados transparentemente; comportamiento legítimo no afectado |
| **Cliente corporativo** | Confianza en que la cadena de custodia es verificada automáticamente |

---

## Requerimientos funcionales

### RF-001 — Auto-timestamp por GPS Provider
**Como** sistema, **quiero** obtener un timestamp independiente del GPS Provider para cada evento registrado, **para** poder compararlo contra el timestamp de la app y detectar manipulación.

**Criterios de aceptación:**
- [ ] `IGpsProvider.getAutoTimestamp(orderId, vehicleId)` retorna `Promise<Date>`
- [ ] `MockGpsAdapter` implementa `IGpsProvider` devolviendo un timestamp simulado (0–120s de offset respecto a `app_timestamp`)
- [ ] `MonitorRepository.updateAutoTimestamp(eventId, ts)` usa patrón CAS: `UPDATE WHERE auto_timestamp IS NULL AND id = ?`
- [ ] Si `auto_timestamp` ya tiene valor, el UPDATE no lo sobreescribe
- [ ] `order_event.auto_timestamp` queda poblado tras el procesamiento del job

### RF-002 — Detección de manipulación de timestamp
**Como** supervisor, **quiero** recibir una alerta cuando el timestamp de la app difiere más de 3 minutos del timestamp del GPS, **para** detectar intentos de falsificar el momento de un evento.

**Criterios de aceptación:**
- [ ] Si `|auto_timestamp - app_timestamp| > 3 minutos` → se crea alerta `type: 'tamper'` vía AlertEngine
- [ ] Si el delta es ≤ 3 minutos → no se crea alerta
- [ ] La alerta incluye `orderId`, `actorId`, descripción con el delta exacto en segundos

### RF-003 — Verificación de integridad del hash
**Como** sistema, **quiero** re-verificar el `integrity_hash` de cada evento usando la misma clave HMAC, **para** detectar si el payload fue alterado después de ser enviado.

**Criterios de aceptación:**
- [ ] MonitorEngine recalcula HMAC-SHA256 del evento usando `CUSTODY_EVENT_HMAC_SECRET`
- [ ] Si el hash calculado difiere del almacenado → alerta `type: 'tamper'` con descripción `integrity_hash_mismatch`
- [ ] Si el hash coincide → no se crea alerta

### RF-004 — Detección de GPS simulado
**Como** supervisor, **quiero** recibir una alerta cuando la app reporta que la ubicación es simulada (mock GPS), **para** detectar custodios que falsifican su posición.

**Criterios de aceptación:**
- [ ] Si `event.device.mock_location_detected === true` → alerta `type: 'custom'` con descripción `mock_location_detected`
- [ ] Si `mock_location_detected === false` → no se crea alerta

### RF-005 — Activación automática por evento
**Como** sistema, **quiero** que la verificación se active automáticamente en cada evento registrado, **para** que no requiera intervención manual ni cron periódico.

**Criterios de aceptación:**
- [ ] `CustodyEventService.createEvent()` encola job `{ eventId, orderId }` en `monitor-engine` queue FUERA de la transacción
- [ ] El worker procesa el job llamando `monitorEngine.processEvent(eventId)`
- [ ] Si el GPS Provider falla, el error se registra pero NO bloquea ni revierte el evento

---

## Requerimientos no funcionales

- **Latencia:** El job de monitoreo se encola inmediatamente post-commit; su procesamiento puede ser asíncrono (no bloquea la respuesta HTTP del POST /events)
- **Resiliencia:** Errores del GPS Provider son no-fatales — el job se completa con log de error, no retry infinito
- **Testabilidad:** `IGpsProvider` permite sustituir el MockAdapter por cualquier implementación real sin cambios en MonitorEngine

---

## Restricciones técnicas

- `order_event.auto_timestamp` usa patrón CAS: solo se escribe si es NULL (ADR-024)
- MonitorEngine es event-driven, no cron (ADR-025)
- Side-effects (alertas) fuera de transacciones (ADR-003)
- `alert_type` usa valores existentes: `'tamper'` para timestamp/hash, `'custom'` para mock GPS — sin migración de ENUM
- `CUSTODY_EVENT_HMAC_SECRET` ya existe en env — se reutiliza para re-verificación

---

## Decisiones pendientes (no bloquean este sprint)

| Decisión | Impacto |
|---|---|
| Contrato API de Winlog para `getAutoTimestamp` | Definir cuándo se implemente WinlogAdapter real |
| Umbral configurable de delta (actualmente hardcoded 3 min) | Podría ser config por tenant en el futuro |
| Política de suspensión automática del operador tras N alertas de fraude | Sprint posterior |
