# Sprint 9 — Requirements
> Generado: 2026-04-24 · Aprobado por: Victor Manuel Mexicano Mondragón

---

## Objetivo del sprint

Implementar la UI completa de viajes programados en la app móvil del pasajero y en el backoffice del administrador, junto con el despacho anticipado (T-30 min) que garantiza mayor probabilidad de asignar un conductor antes del horario acordado. El backend ya cuenta con los endpoints de programación desde Sprint 6; este sprint cierra la experiencia de extremo a extremo: el pasajero puede agendar, ver y cancelar sus viajes programados, el conductor recibe notificaciones específicas al aceptar uno, y el admin supervisa todos los viajes programados del sistema.

---

## Scope

| Incluye | Excluye |
|---|---|
| `ScheduledTripsScreen` — lista + cancelar (mobile pasajero) | Pre-asignación de conductor con anticipación (Opción B — Fase 2) |
| `ScheduleConfirmScreen` — date/time picker + confirmar (mobile pasajero) | Penalizaciones por cancelación tardía del conductor |
| Integración de navegación: nuevas rutas en `PassengerStack` | UI del conductor para ver viajes futuros en su app |
| Botón "Mis programados" en HomeScreen | Escalada de radio de búsqueda automática |
| CTA secundario "Programar para después" en EstimateScreen | Asignación manual de conductor desde admin |
| Migration 033: 5 nuevos campos en `scheduled_trips` para soporte futuro | Filtros avanzados en vista admin (por fecha, pasajero) |
| Scheduler: despacho a T-`dispatch_window_min` (default 30 min) | Cancelar viajes programados desde el backoffice |
| Push al conductor al aceptar viaje programado | Tests E2E Detox para el flujo de viajes programados |
| Push al pasajero a T-15 si aún en SEARCHING | Chat conductor-pasajero |
| Vista admin de viajes programados (solo lectura) | Acciones en lote desde admin |
| `GET /admin/trips?status=SCHEDULED` devuelve `scheduled_for` | Pagos o ratings en este sprint |

---

## Actores

| Actor | Interés en el sprint |
|---|---|
| Pasajero | Agendar un viaje para una fecha/hora futura, ver sus viajes programados, cancelar si cambia de planes |
| Conductor | Saber que el viaje que acepta tiene un horario comprometido y recibir recordatorio antes de la hora |
| Administrador | Supervisar todos los viajes programados del sistema con fecha/hora de salida |
| Sistema (scheduler) | Despachar la búsqueda 30 minutos antes del horario acordado y notificar al pasajero si no hay conductor a T-15 |

---

## Requerimientos funcionales

### RF-901 — Programar un viaje (pasajero mobile)
**Como** pasajero, **quiero** programar un viaje para una fecha y hora futuras desde la pantalla de estimación, **para** garantizar que tendré transporte en el horario que necesito.

**Criterios de aceptación:**
- [ ] EstimateScreen muestra un segundo CTA "Programar para después" junto a "Solicitar ahora"
- [ ] Al tocar "Programar para después", navega a `ScheduleConfirmScreen` con los datos del viaje seleccionado
- [ ] `ScheduleConfirmScreen` muestra resumen: origen, destino, tipo de servicio y tarifa estimada
- [ ] El pasajero puede seleccionar fecha y hora con un picker nativo (`@react-native-community/datetimepicker`)
- [ ] El picker no permite seleccionar fechas/horas menores a 30 minutos desde ahora (validación local + servidor)
- [ ] Al confirmar, se llama `POST /trips/schedule` con `{origin, destination, tripTypeId, scheduledFor}`
- [ ] Tras confirmar, navega a `ScheduledTripsScreen` mostrando el viaje recién creado

### RF-902 — Ver y cancelar viajes programados (pasajero mobile)
**Como** pasajero, **quiero** ver mis viajes programados y cancelar alguno si cambio de planes, **para** gestionar mi agenda de transportes.

**Criterios de aceptación:**
- [ ] HomeScreen tiene un botón/icono "Mis programados" con badge si hay viajes activos
- [ ] `ScheduledTripsScreen` muestra lista de viajes en estado SCHEDULED del pasajero
- [ ] Cada tarjeta muestra: origen → destino, fecha y hora formateada (horario MX), tipo de servicio, tarifa estimada
- [ ] Estado vacío con mensaje descriptivo si no hay viajes programados
- [ ] El pasajero puede cancelar un viaje con confirmación vía Alert (acción irreversible)
- [ ] Tras cancelar, la tarjeta desaparece de la lista sin necesidad de recargar manualmente

### RF-903 — Despacho anticipado (sistema)
**Como** sistema, **quiero** iniciar la búsqueda de conductor 30 minutos antes del horario acordado, **para** maximizar la probabilidad de que el pasajero tenga conductor asignado a tiempo.

**Criterios de aceptación:**
- [ ] El scheduler evalúa `scheduled_for - dispatch_window_min <= NOW()` (no `scheduled_for <= NOW`)
- [ ] Al despachar, `search_started_at` se registra con la timestamp exacta
- [ ] Si a T-15 min antes de `scheduled_for` el viaje sigue en SEARCHING, el pasajero recibe push: "Estamos buscando tu conductor, mantente pendiente"
- [ ] `passenger_notified_searching_at` se marca para no enviar la notificación dos veces
- [ ] Viajes despachados en ventana correcta no se re-despachan en el siguiente tick del cron

### RF-904 — Notificación al conductor (sistema)
**Como** conductor, **quiero** recibir una notificación especial al aceptar un viaje programado con la hora acordada de salida, **para** planificar mi tiempo y llegar puntualmente.

**Criterios de aceptación:**
- [ ] Al transicionar `SEARCHING → ACCEPTED`, si el trip tiene registro en `scheduled_trips`, se encola push al conductor
- [ ] El texto del push incluye la hora de salida formateada: `"Viaje agendado — el pasajero debe salir a las HH:MM. Llega a tiempo"`
- [ ] El push de recordatorio a T-15 min antes de `scheduled_for` (campo `notif_15m_sent` ya existente) también se envía al conductor, no solo al pasajero
- [ ] Si el trip no tiene registro en `scheduled_trips`, el flujo de aceptación no cambia

### RF-905 — Vista admin de viajes programados (backoffice web)
**Como** administrador, **quiero** ver todos los viajes programados del sistema con su fecha y hora de salida, **para** supervisar la carga futura y detectar posibles problemas operativos.

**Criterios de aceptación:**
- [ ] El dashboard del backoffice tiene una sección/tab "Programados"
- [ ] La tabla muestra: nombre del pasajero, origen → destino, fecha y hora programada, tipo de servicio, tarifa estimada
- [ ] La fecha se formatea en zona horaria de México (America/Mexico_City)
- [ ] La vista es solo lectura (no hay acciones de cancelar o reasignar)
- [ ] La lista se actualiza al navegar a la sección (no requiere refresh manual)

---

## Requerimientos no funcionales

| RNF | Descripción |
|---|---|
| RNF-901 | El scheduler no debe despachar el mismo viaje dos veces — condición: `search_started_at IS NULL` antes de despachar |
| RNF-902 | `dispatch_window_min` almacenado por viaje — no hardcodeado en el scheduler — permite valores distintos por región o tipo de servicio en el futuro |
| RNF-903 | TypeScript strict en todas las pantallas y modificaciones de backend — sin `any` |
| RNF-904 | El picker de fecha no debe permitir seleccionar el pasado ni fechas con menos de 30 minutos de anticipación (validación en cliente) |
| RNF-905 | La vista admin de programados debe funcionar con el parámetro `?status=SCHEDULED` en el endpoint existente |

---

## Restricciones técnicas inamovibles

```
✓ React Native bare (no Expo managed) — architecture.md
✓ @react-native-community/datetimepicker para selección de fecha/hora nativa — ADR-034
✓ dispatch_window_min configurable por viaje (DEFAULT 30) — no hardcodeado — ADR-035
✓ Soft delete siempre (deleted_at) — NUNCA DELETE directo — business-rules.md
✓ Notificaciones push vía BullMQ notificationQueue — nunca llamada directa a FCM
✓ El campo pricing_snapshot es inmutable — no tocar en este sprint
✓ Knex para todas las queries — sin raw SQL salvo que sea estrictamente necesario
```

---

## Decisiones pendientes (no bloquean este sprint)

| Decisión | Para cuándo |
|---|---|
| Opción B: pre-asignación de conductor con anticipación | Fase 2 — requiere UI conductor + lógica de penalización |
| Escalada de radio de búsqueda si T-10 sin conductor | Fase 2 |
| Penalización al conductor por cancelar un viaje programado aceptado | Fase 2 |
| ¿Mostrar `scheduled_for` en el detalle de viaje del admin? | Sprint 10 (cuando se implemente detalle de viaje) |
| Viajes programados en iOS (require `pod install`) | Cuando se active el build iOS |
