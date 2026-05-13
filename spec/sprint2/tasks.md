# Tasks — Sprint 2: Auth y Usuarios

> **Sprint:** 2 de 7
> **Metodología:** SDD + TDD
> **Total de tareas:** 5
> **Última actualización:** 2026-04-05

---

## Resumen ejecutivo

| ID | Título | Tipo | Agentes | Depende de | Irreversible | Estado |
|----|--------|------|---------|-----------|--------------|--------|
| AUTH-001 | Migración 023 + OTPChannelService + JWTService | FEATURE | backend | — | ⚠️ sí | ✅ |
| AUTH-002 | Endpoints POST /auth/* | FEATURE | backend | AUTH-001 | — | ✅ |
| AUTH-003 | Módulo Users: GET/PATCH /users/me | FEATURE | backend | AUTH-002 | — | ✅ |
| AUTH-004 | Payment methods: Stripe SetupIntent | FEATURE | backend | AUTH-003 | — | ✅ |
| AUTH-005 | Tests cobertura Auth + Users | QA_ONLY | qa | AUTH-002, AUTH-003, AUTH-004 | — | ⚠️ partial |

---

## Grafo de dependencias

```
AUTH-001
    ↓
AUTH-002
    ↓
AUTH-003
    ↓
AUTH-004
    ↓
AUTH-005 (qa)
```

---

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|-------|--------|-------------------|
| **Grupo 1** | AUTH-001 | Inmediato |
| **Grupo 2** | AUTH-002 | AUTH-001 completado |
| **Grupo 3** | AUTH-003 | AUTH-002 completado |
| **Grupo 4** | AUTH-004 | AUTH-003 completado |
| **Grupo 5** | AUTH-005 | AUTH-002 + AUTH-003 + AUTH-004 completados |

---

## Tareas detalladas

---

### AUTH-001 — Migración 023 + OTPChannelService + JWTService

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 2
**Depende de:** ninguna · **Irreversible:** ⚠️ SÍ

> ⚠️ **Migración 023:** Modifica `user_auth` — agrega `refresh_token_jti`, `refresh_token_exp`, `revoked_at` y elimina `refresh_token` y `password_hash`. Requiere aprobación antes de ejecutar en cualquier ambiente no local.

#### Scope incluye
- `apps/api/migrations/20240101000023_update_user_auth_for_otp.ts` — `up()` + `down()`
- `apps/api/src/modules/auth/otp/otp-channel.interface.ts` — interfaz `OTPChannel`
- `apps/api/src/modules/auth/otp/log-otp-channel.ts` — implementación dev (OTP en logs)
- `apps/api/src/modules/auth/otp/firebase-otp-channel.ts` — implementación prod (Firebase Admin SDK)
- `apps/api/src/modules/auth/jwt.service.ts` — `signAccess()`, `signRefresh()`, `verify()`
- `apps/api/src/modules/auth/user-auth.repository.ts` — `upsertJti()`, `revokeJti()`, `findByJti()`
- Actualizar `apps/api/src/config/environment.ts` con `OTP_PROVIDER`, `FIREBASE_*`, `STRIPE_SECRET_KEY`
- Actualizar `apps/api/.env.example`

#### Scope excluye
- Los endpoints de auth (eso es AUTH-002)
- Lógica de envío de OTP (solo la infraestructura)
- Redis blacklist (se usa en AUTH-002 al implementar /auth/refresh)

#### Criterios de aceptación

**Negocio:**
- [ ] En desarrollo, el OTP aparece en los logs del servidor sin llamadas externas

**Técnicos:**
- [ ] `knex migrate:latest` aplica migración 023 sin errores
- [ ] `knex migrate:rollback` revierte la migración 023 sin errores
- [ ] `OTPChannel` es una interfaz TypeScript — no una clase concreta
- [ ] `LogOTPChannel` loggea con pino: `logger.info({ phone, otp }, '[DEV] OTP code')`
- [ ] `FirebaseOTPChannel` está implementado pero solo se instancia si `OTP_PROVIDER=firebase`
- [ ] `JWTService.signRefresh()` incluye `jti: uuidv4()` en el payload
- [ ] `JWTService.verify()` lanza `BusinessError(TOKEN_INVALID)` si la firma falla
- [ ] `UserAuthRepository.upsertJti()` hace upsert por `user_id` (un solo registro por usuario)
- [ ] `environment.ts` Zod schema: `STRIPE_SECRET_KEY` requerido, `OTP_PROVIDER` enum `log|firebase` default `log`
- [ ] Cero usos de `any` en TypeScript

#### TDD — Tests a escribir en AUTH-005
```typescript
// jwt.service.test.ts
describe('JWTService')
  ✓ signAccess returns valid JWT with sub, roles, region
  ✓ signRefresh returns JWT with jti (UUID format)
  ✓ verify throws TOKEN_INVALID for tampered token
  ✓ verify throws TOKEN_EXPIRED for expired token
  ✓ access token expires in 15 minutes
  ✓ refresh token expires in 30 days

// log-otp-channel.test.ts
describe('LogOTPChannel')
  ✓ calls logger.info with phone and otp
  ✓ does not throw
```

#### SDD — Referencias
- `spec/sprint2/design.md` § 2 (migración 023)
- `spec/sprint2/design.md` § 3 (interfaces TypeScript)
- `spec/sprint2/design.md` § 5 (flujo revocación híbrida)
- ADR-015, ADR-016, ADR-018

---

### AUTH-002 — Endpoints POST /auth/*

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 2
**Depende de:** AUTH-001 · **Irreversible:** no

#### Scope incluye
- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/users/users.repository.ts` — `findByPhone()`, `create()` (reutilizable por AUTH-003)
- Rate limits específicos por endpoint (ver `steering/architecture.md`)
- Registro del módulo en `apps/api/src/app.ts`

#### Endpoints implementados
- `POST /auth/register`
- `POST /auth/verify-phone`
- `POST /auth/login`
- `POST /auth/refresh` (con lógica de blacklist híbrida)

#### Scope excluye
- GET/PATCH /users/me (eso es AUTH-003)
- Logout endpoint (sprint futuro)
- OAuth providers

#### Criterios de aceptación

**Negocio:**
- [ ] Un usuario puede registrarse con teléfono y nombre y recibir OTP (en logs en dev)
- [ ] Un usuario puede verificar el OTP y recibir tokens válidos
- [ ] Un usuario registrado puede hacer login y recibir nuevo OTP

**Técnicos:**
- [ ] `POST /auth/register` con phone duplicado retorna 409
- [ ] `POST /auth/verify-phone` con OTP incorrecto retorna 400 OTP_INVALID
- [ ] `POST /auth/verify-phone` con OTP expirado retorna 400 OTP_EXPIRED
- [ ] `POST /auth/refresh` invalida el jti anterior en Redis (TTL residual)
- [ ] `POST /auth/refresh` actualiza `refresh_token_jti` en `user_auth`
- [ ] `POST /auth/refresh` con jti en Redis blacklist retorna 401 TOKEN_INVALID
- [ ] `POST /auth/refresh` con jti revocado en PostgreSQL retorna 401 TOKEN_INVALID
- [ ] Rate limits retornan 429 al excederse
- [ ] OTP en Redis se almacena con TTL 600 segundos (`otp:{phone}`)
- [ ] OTP se invalida en Redis tras verificación exitosa

#### TDD — Tests a escribir en AUTH-005
```typescript
// auth.service.test.ts (unitario con mocks de repositorio y Redis)
describe('AuthService.register')
  ✓ creates user and sends OTP
  ✓ throws PHONE_ALREADY_REGISTERED if phone exists
  ✓ throws PHONE_BANNED if user is banned
  ✓ stores OTP in Redis with 600s TTL

describe('AuthService.verifyPhone')
  ✓ returns tokens when OTP is valid
  ✓ throws OTP_INVALID when OTP does not match
  ✓ throws OTP_EXPIRED when OTP TTL has passed
  ✓ sets phone_verified = true on first verification
  ✓ stores refresh_token_jti in user_auth

describe('AuthService.refresh')
  ✓ returns new tokens when refresh token is valid
  ✓ throws TOKEN_INVALID when jti is in Redis blacklist
  ✓ throws TOKEN_INVALID when jti not found in user_auth
  ✓ invalidates old jti in Redis after rotation
  ✓ updates user_auth with new jti

// auth.integration.test.ts (con Testcontainers)
describe('POST /auth/register')
  ✓ 200 with valid phone and name
  ✓ 409 with duplicate phone
  ✓ 422 with invalid phone format
  ✓ 429 after 5 requests in 15 minutes

describe('POST /auth/verify-phone')
  ✓ 200 returns access_token and refresh_token
  ✓ 400 OTP_INVALID with wrong OTP
  ✓ 400 OTP_EXPIRED after TTL

describe('POST /auth/refresh')
  ✓ 200 returns new token pair
  ✓ 401 TOKEN_INVALID with blacklisted jti
  ✓ 401 TOKEN_INVALID with revoked jti in DB
```

#### SDD — Referencias
- `spec/sprint2/design.md` § 4 (contratos de API)
- `spec/sprint2/design.md` § 5 (flujo revocación híbrida)
- `steering/architecture.md` § Seguridad (rate limits)
- `steering/business-rules.md` § Catálogo de BusinessErrors

---

### AUTH-003 — Módulo Users: GET/PATCH /users/me

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 2
**Depende de:** AUTH-002 · **Irreversible:** no

#### Scope incluye
- `apps/api/src/modules/users/users.routes.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.repository.ts` — completar con `findById()`, `update()`
- Registro de cambios en `audit_logs` (R-DATA-002)
- Usar middleware `authenticate` de Sprint 1

#### Scope excluye
- PATCH de campos de conductor (eso es Sprint 3)
- Eliminación de usuario
- Payment methods (eso es AUTH-004)

#### Criterios de aceptación

**Negocio:**
- [ ] Un usuario puede ver su nombre y teléfono
- [ ] Un usuario puede cambiar su nombre completo

**Técnicos:**
- [ ] `GET /users/me` sin token retorna 401
- [ ] `GET /users/me` con token válido retorna UserDTO
- [ ] `PATCH /users/me` con `full_name` vacío retorna 422
- [ ] `PATCH /users/me` registra cambio en `audit_logs` con `entity_type='user'`, `action='update'`
- [ ] `PATCH /users/me` retorna UserDTO actualizado
- [ ] Soft delete: campo `deleted_at` nunca se modifica desde este endpoint (R-DATA-001)

#### TDD — Tests a escribir en AUTH-005
```typescript
// users.service.test.ts
describe('UserService.getProfile')
  ✓ returns UserDTO for valid user_id
  ✓ throws USER_NOT_FOUND for unknown user_id

describe('UserService.updateProfile')
  ✓ updates full_name and returns updated UserDTO
  ✓ writes to audit_logs
  ✓ throws VALIDATION_ERROR for empty full_name

// users.integration.test.ts
describe('GET /users/me')
  ✓ 200 with valid token
  ✓ 401 without token
  ✓ 401 with expired token

describe('PATCH /users/me')
  ✓ 200 updates full_name
  ✓ 422 with empty full_name
  ✓ 401 without token
```

#### SDD — Referencias
- `spec/sprint2/design.md` § 3 (UserDTO)
- `spec/sprint2/design.md` § 4 (contratos GET/PATCH /users/me)
- `steering/business-rules.md` R-DATA-001, R-DATA-002

---

### AUTH-004 — Payment methods: Stripe SetupIntent

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 2
**Depende de:** AUTH-003 · **Irreversible:** no

#### Scope incluye
- `apps/api/src/modules/users/payment-methods/payment-methods.routes.ts`
- `apps/api/src/modules/users/payment-methods/payment-methods.controller.ts`
- `apps/api/src/modules/users/payment-methods/payment-methods.service.ts`
- `apps/api/src/modules/users/payment-methods/payment-methods.repository.ts`
- `StripeService.createSetupIntent()` — cliente Stripe inicializado con `STRIPE_SECRET_KEY`
- Circuit breaker para Stripe (timeout 10s, threshold 30%, reset 120s — per `steering/architecture.md`)

#### Scope excluye
- Cobro real (PaymentIntent) — eso es Sprint 5 (ADR-017)
- Webhook de Stripe para confirmar que el SetupIntent fue completado
- Eliminación de método de pago
- Método de pago por defecto

#### Criterios de aceptación

**Negocio:**
- [ ] Un pasajero puede iniciar el flujo de guardar tarjeta y recibir el `client_secret` para el frontend

**Técnicos:**
- [ ] `POST /users/me/payment-methods` retorna `{ client_secret, setup_intent_id }`
- [ ] `GET /users/me/payment-methods` retorna lista vacía `[]` si no hay métodos guardados
- [ ] Solo almacena `provider_method_id` — nunca número de tarjeta (R-PAY-003)
- [ ] Si Stripe no responde en 10s → `502 STRIPE_UNAVAILABLE` (TechnicalError, no BusinessError)
- [ ] El `StripeService` es inyectable (facilita mock en tests)

#### TDD — Tests a escribir en AUTH-005
```typescript
// payment-methods.service.test.ts (con Stripe mockeado)
describe('PaymentMethodsService.createSetupIntent')
  ✓ calls stripe.setupIntents.create with customer_id
  ✓ returns client_secret and setup_intent_id
  ✓ throws TechnicalError STRIPE_UNAVAILABLE on timeout

describe('PaymentMethodsService.listPaymentMethods')
  ✓ returns empty array when user has no payment methods
  ✓ returns PaymentMethodDTO[] when methods exist

// payment-methods.integration.test.ts
describe('POST /users/me/payment-methods')
  ✓ 200 returns client_secret (Stripe test mode)
  ✓ 401 without token

describe('GET /users/me/payment-methods')
  ✓ 200 returns empty array
  ✓ 401 without token
```

#### SDD — Referencias
- `spec/sprint2/design.md` § 3 (PaymentMethodDTO)
- `spec/sprint2/design.md` § 4 (contratos POST/GET /users/me/payment-methods)
- `spec/sprint2/design.md` § 6 (variables de entorno STRIPE_SECRET_KEY)
- ADR-006 (Stripe único procesador MVP)
- ADR-017 (SetupIntent en Sprint 2, PaymentIntent en Sprint 5)
- `steering/business-rules.md` R-PAY-003

---

### AUTH-005 — Tests cobertura Auth + Users

**Tipo:** QA_ONLY · **Agente:** qa · **Sprint:** 2
**Depende de:** AUTH-002, AUTH-003, AUTH-004 · **Irreversible:** no

#### Scope incluye
- Tests unitarios para: `JWTService`, `LogOTPChannel`, `AuthService`, `UserService`, `PaymentMethodsService`
- Tests de integración con Testcontainers para todos los endpoints
- Verificar cobertura ≥ 80% en módulos `auth/` y `users/`
- Verificar que el global no bajó del 75% (threshold configurado en Sprint 1)

#### Scope excluye
- Tests E2E con Playwright (Sprint 6)
- Tests de `FirebaseOTPChannel` (requiere credenciales reales)
- Tests de circuit breaker de Stripe (requiere infraestructura adicional)

#### Criterios de aceptación

**Negocio:**
- [ ] El módulo auth tiene cobertura verificada y documentada

**Técnicos:**
- [ ] `pnpm test:coverage` retorna verde con thresholds del módulo auth ≥ 80%
- [ ] `pnpm agent:verify:quick` pasa (type-check + tests)
- [ ] Todos los casos de error del catálogo `BusinessErrors` para auth tienen al menos un test
- [ ] El flujo de revocación híbrida (PostgreSQL + Redis) tiene tests que cubren:
  - Redis hit (token en blacklist)
  - Redis miss + PostgreSQL válido
  - Redis miss + PostgreSQL revocado
- [ ] Tests de integración usan Testcontainers (no mocks de BD)
- [ ] Los mocks de `OTPChannel` y `StripeService` se inyectan — no se parchean con `jest.mock`

#### SDD — Referencias
- `spec/sprint2/requirements.md` § RNF (cobertura ≥ 80%)
- `spec/sprint1/design.md` § 7 (thresholds globales)
- ADR-013 (Testcontainers sobre mocks de BD)

---

## Definition of Done — Sprint 2

- [ ] Los 5 endpoints de auth y 4 de users responden correctamente
- [ ] `pnpm test:coverage` verde — auth/users ≥ 80%, global ≥ 75%
- [ ] `pnpm agent:verify:quick` pasa (type-check + tests sin errores)
- [ ] Migración 023 aplicada (local) y reversible (`rollback` sin errores)
- [ ] `context/snapshots/auth.snapshot.md` actualizado
- [ ] `docs/06_memory.md` actualizado con Auth + Users como completados
- [ ] ADR-015, ADR-016, ADR-017, ADR-018 registradas en `docs/13_decisions_log.md`
- [ ] Cero usos de `any` en TypeScript en el módulo

---

## Notas por agente

**Backend:**
- Usar `@fastify/rate-limit` por endpoint con `keyGenerator` diferente para login (por phone) vs register (por IP)
- El `OTPChannelService` se instancia una vez en `app.ts` según `env.OTP_PROVIDER` y se inyecta en `AuthService`
- `UserAuthRepository.upsertJti()` debe usar `ON CONFLICT (user_id) DO UPDATE` — un solo registro por usuario
- Stripe: usar `stripe` npm package v14+, inicializar una vez como singleton

**QA:**
- Para tests de integración de auth, crear un `AuthTestHelper` que encapsule register + verify-phone
- Los tests del flujo híbrido necesitan un Redis real (Testcontainers) y un PostgreSQL real
- Mockear `OTPChannel` con una implementación de test que captura el OTP enviado para poder usarlo en el test de verify-phone
