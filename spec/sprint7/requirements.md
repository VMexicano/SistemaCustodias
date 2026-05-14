# Sprint 7 — Requirements: Módulo Notifications

**Sprint:** 7 — SistemaCustodias
**Fecha:** 2026-05-14
**Módulo:** notifications

---

## Actores

| Actor | Rol |
|---|---|
| Sistema | Dispara notificaciones en transiciones de estado de órdenes y alertas |
| `supervisor` | Recibe notificaciones de PENDING_APPROVAL, REJECTED, INCIDENT, panic |
| `dispatcher` | Recibe notificaciones de ASSIGNED, DELIVERED, INCIDENT, panic |
| `client` | Recibe notificaciones de APPROVED, EN_ROUTE, AT_PICKUP, IN_TRANSIT, AT_DELIVERY, DELIVERED |
| `custodio` | Recibe notificaciones de ASSIGNED |
| `copiloto` | Recibe notificaciones de ASSIGNED |

---

## RF-001 — Enviar notificación push (FCM)

**Actor:** Sistema (BullMQ worker)

**Criterios de aceptación:**
- [x] El worker toma jobs de la cola `notifications`
- [x] Intenta envío FCM primero (IFcmClient)
- [x] Si FCM falla → intenta SMS como fallback (ISmsClient)
- [x] Registra resultado (sent/failed/skipped) en tabla `notifications`
- [x] Notificaciones `critical` y `high` tienen reintentos con backoff exponencial (hasta 10 reintentos)
- [x] Notificaciones `normal` tienen máximo 3 reintentos

---

## RF-002 — Circuit breaker FCM

**Actor:** Sistema

**Criterios de aceptación:**
- [x] El circuit breaker tiene 3 estados: `closed` (normal), `open` (suspendido), `half-open` (probando)
- [x] Se abre cuando hay ≥ 5 fallos FCM en 60 segundos
- [x] Mientras está `open`: salta directo a SMS sin intentar FCM
- [x] Después de 5 minutos en `open`: pasa a `half-open` y prueba un envío FCM
- [x] Si el envío `half-open` tiene éxito → regresa a `closed`
- [x] Si falla → vuelve a `open` por otros 5 minutos
- [x] Estado persiste en Redis con TTL
- [x] SMS siempre disponible — el circuit breaker NO aplica a SMS

---

## RF-003 — Notificaciones por evento de orden

**Actor:** Sistema

**Tabla de routing:**

| Evento (to_status) | Destinatarios | Canal | Prioridad |
|---|---|---|---|
| PENDING_APPROVAL | supervisor | push + SMS | high |
| APPROVED | client, custodio, copiloto, dispatcher | push | normal |
| REJECTED | client, dispatcher | push + SMS | high |
| ASSIGNED | custodio, copiloto | push + SMS | high |
| CREW_CONFIRMED | dispatcher | push | normal |
| EN_ROUTE_TO_PICKUP | client | push | normal |
| AT_PICKUP | client | push | normal |
| IN_TRANSIT | client | push | high |
| AT_DELIVERY | client | push | normal |
| DELIVERED | client, dispatcher | push | high |
| COMPLETED | client | push | normal |
| INCIDENT | supervisor, dispatcher | push + SMS | critical |

**Criterios de aceptación:**
- [x] El worker tiene una tabla de routing estática para mapear to_status → destinatarios + canal + prioridad
- [x] El worker resuelve el user_id de cada destinatario desde la orden (client_id, custodio_id, copiloto_id)
- [x] Para supervisor y dispatcher: se notifica a TODOS los usuarios con ese role en el mismo tenant
- [x] Si un usuario no tiene fcm_token → skip FCM, usar solo SMS

---

## RF-004 — Notificaciones por alerta critical/high

**Actor:** Sistema

**Criterios de aceptación:**
- [x] AlertEngine enqueue a `notifications` queue después de crear alerta de tipo `panic`
- [x] El worker mapea alert `critical` → notifica a supervisor + dispatcher con push + SMS
- [x] El worker mapea alert `high` (tamper, communication_loss) → notifica a supervisor + dispatcher con push
- [x] La notificación de pánico incluye: "⚠️ ALERTA CRÍTICA: Botón de pánico activado — Orden #{order_number}"

---

## RF-005 — Registro de notificaciones

**Actor:** Sistema

**Criterios de aceptación:**
- [x] Toda notificación intentada se registra en tabla `notifications` con status `pending` antes del envío
- [x] Status se actualiza a `sent` o `failed` según resultado
- [x] Notificaciones skipped (sin token, sin teléfono) se registran como `skipped`
- [x] Los campos `order_id` y `alert_id` son nullables — solo se llenan cuando aplica

---

## Scope out (no Sprint 7)

- Email notifications
- Llamada automática para alertas panic (webhook a servicio externo)
- Panel de historial de notificaciones en mobile/web
- Firebase Admin SDK real (usar LogFcmClient que loguea sin envío real)
- Twilio/Vonage SMS real (usar LogSmsClient que loguea sin envío real)
- Endpoint HTTP GET /notifications (registro solo en BD, no expuesto en MVP)
- Notificaciones para roles `compliance`
