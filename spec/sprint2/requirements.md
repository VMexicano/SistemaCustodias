# Requirements — Sprint 2: Auth y Usuarios

> **Sprint:** 2 de 7
> **Última actualización:** 2026-04-05
> **Depende de:** Sprint 1 completado

---

## Objetivo del sprint

Implementar el ciclo completo de autenticación basado en teléfono + OTP y la gestión del perfil de usuario, incluyendo el almacenamiento de métodos de pago vía Stripe. Al finalizar este sprint, un pasajero puede registrarse, verificar su teléfono, iniciar sesión y guardar una tarjeta — todo lo necesario para solicitar un viaje en Sprint 4.

---

## Scope

| Incluye | Excluye |
|---|---|
| Registro de usuarios vía teléfono + OTP | Registro de conductores (Sprint 3) |
| Verificación de teléfono (OTP 6 dígitos) | OAuth (Google, Apple) — sprint futuro |
| Login / logout con JWT | Passwords — no aplica (OTP-only) |
| Rotación automática de refresh tokens | Admin panel de usuarios |
| Perfil del usuario autenticado (GET/PATCH) | Historial de viajes |
| Almacenamiento de método de pago (Stripe SetupIntent) | Cobro real (Sprint 5) |
| Abstracción OTPChannelService (dev: logs, prod: Firebase) | Twilio SMS |
| Migración 023: evolución de tabla user_auth | Nuevas tablas |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| Pasajero | Registrarse y poder iniciar sesión para solicitar viajes |
| Administrador | Ver usuarios registrados (no implementado aquí, pero los datos deben existir) |
| Sistema de pagos (Stripe) | Guardar método de pago para cobrar en Sprint 5 |
| Sprint 4 (Trips) | Requiere `passenger_id` autenticado y método de pago activo |

---

## Requerimientos funcionales

### RF-001 — Registro de pasajero

**Como** pasajero nuevo, **quiero** registrarme con mi número de teléfono y nombre, **para** poder usar la plataforma.

- [ ] `POST /auth/register` acepta `phone` (E.164) y `full_name` (min 2 chars)
- [ ] Si el teléfono ya existe → `409 PHONE_ALREADY_REGISTERED`
- [ ] Si el teléfono está baneado → `403 PHONE_BANNED`
- [ ] Se genera OTP de 6 dígitos y se almacena en Redis con TTL 10 min (`otp:{phone}`)
- [ ] Se envía el OTP vía `OTPChannelService` (log en dev, Firebase en prod)
- [ ] Response: `{ message: 'OTP sent', expires_in: 600 }`
- [ ] Rate limit: 5 req / 15 min por IP

### RF-002 — Verificación de teléfono

**Como** pasajero recién registrado, **quiero** ingresar el OTP recibido, **para** activar mi cuenta y obtener acceso.

- [ ] `POST /auth/verify-phone` acepta `phone` y `otp`
- [ ] OTP inválido → `400 OTP_INVALID`
- [ ] OTP expirado → `400 OTP_EXPIRED`
- [ ] OTP válido → invalida el OTP en Redis, activa `phone_verified = true`
- [ ] Retorna `{ access_token, refresh_token, user: UserDTO }`
- [ ] Access token: JWT firmado, TTL 15 min, payload `{ sub, roles, region }`
- [ ] Refresh token: JWT firmado, TTL 30 días, `jti` almacenado en `user_auth`
- [ ] Rate limit: 3 req / 10 min por phone

### RF-003 — Login de usuario existente

**Como** pasajero registrado, **quiero** iniciar sesión con mi teléfono, **para** obtener nuevos tokens de acceso.

- [ ] `POST /auth/login` acepta `phone`
- [ ] Teléfono no registrado → `404 USER_NOT_FOUND`
- [ ] Usuario suspendido → `403 USER_SUSPENDED`
- [ ] Envía nuevo OTP vía `OTPChannelService`
- [ ] El login se completa con `POST /auth/verify-phone` (mismo endpoint)
- [ ] Rate limit: 5 req / 15 min por IP

### RF-004 — Renovación de tokens

**Como** usuario autenticado, **quiero** renovar mi access token sin re-autenticarme, **para** mantener mi sesión activa.

- [ ] `POST /auth/refresh` acepta `{ refresh_token }`
- [ ] Verifica firma JWT
- [ ] Verifica Redis: `EXISTS blacklist:token:{jti}` → `401 TOKEN_INVALID`
- [ ] Si Redis miss → verifica PostgreSQL: `jti` existe en `user_auth` y `revoked_at IS NULL`
- [ ] Rota el refresh token: nuevo `jti`, nuevo `exp`, actualiza `user_auth`
- [ ] Invalida el `jti` anterior en Redis con TTL residual
- [ ] Retorna nuevos `access_token` y `refresh_token`
- [ ] Token inválido/expirado → `401 TOKEN_INVALID | TOKEN_EXPIRED`

### RF-005 — Perfil del usuario

**Como** usuario autenticado, **quiero** ver y editar mi perfil, **para** mantener mis datos actualizados.

- [ ] `GET /users/me` retorna `UserDTO` del usuario autenticado
- [ ] `PATCH /users/me` acepta `{ full_name? }` (campos opcionales)
- [ ] Solo puede modificar su propio perfil (autenticación requerida)
- [ ] Registra cambio en `audit_logs` (R-DATA-002)
- [ ] Soft delete: nunca elimina el usuario (R-DATA-001)

### RF-006 — Método de pago (Stripe SetupIntent)

**Como** pasajero, **quiero** guardar mi tarjeta de crédito/débito, **para** poder pagar viajes sin ingresar mis datos cada vez.

- [ ] `POST /users/me/payment-methods` crea un Stripe SetupIntent
- [ ] Retorna `{ client_secret, setup_intent_id }` para que el frontend complete el flujo
- [ ] `GET /users/me/payment-methods` lista los métodos guardados del usuario
- [ ] Solo almacena `provider_method_id` (pm_xxxxx) — nunca números de tarjeta (R-PAY-003)
- [ ] Si Stripe no está disponible → `502` con `TechnicalError`

---

## Requerimientos no funcionales

| RNF | Valor |
|---|---|
| Latencia p95 `/auth/verify-phone` | < 200ms (excluyendo llamada a Firebase) |
| Latencia p95 `/auth/refresh` | < 50ms (Redis hit) / < 100ms (PostgreSQL fallback) |
| TTL OTP en Redis | 10 minutos |
| TTL access token | 15 minutos |
| TTL refresh token | 30 días |
| Rate limit `/auth/login` | 5 req / 15 min por IP |
| Rate limit `/auth/verify-phone` | 3 req / 10 min por phone |
| Cobertura tests módulo auth | ≥ 80% lines/branches |

---

## Restricciones técnicas inamovibles

- JWT con `jsonwebtoken` — ya instalado en Sprint 1
- Redis con `ioredis` — ya configurado en Sprint 1
- Knex para acceso a BD — no Prisma (ADR-001)
- Sin passwords almacenados — OTP-only (ADR-015)
- Fuente de verdad de revocación: PostgreSQL (ADR-016)
- Solo Stripe para pagos MVP — no MercadoPago (ADR-006)
- `jti` en refresh token debe ser UUID v4
- Patrón de módulo: `routes → controller → service → repository`

---

## Decisiones pendientes (no bloquean Sprint 2)

| Decisión | Impacto | Urgencia |
|---|---|---|
| ¿Cuántos dispositivos simultáneos por usuario? | Número de refresh tokens activos por `user_id` | Antes de Sprint 4 |
| ¿Logout de todos los dispositivos? | Endpoint `/auth/logout-all` | Sprint 3+ |
| ¿OTP por WhatsApp en producción? | Migrar `FirebaseOTPChannel` → `WhatsAppOTPChannel` | Cuando Firebase supere 10k/mes |
| ¿Verificación de conductor por teléfono o email? | Flujo de onboarding | Sprint 3 |
