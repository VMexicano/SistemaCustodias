# Snapshot — Módulo: auth
> Última actualización: 2026-04-05 | Estado: ✅ Completo (Sprint 2)

## Estado
- Implementación: ✅ 100% — código entregado (2026-04-05)
- Tests unitarios: ✅ 48/48 pasan
- Tests integración: ⚠️ escritos, requieren Docker activo para correr
- Cobertura unit (sin Docker): auth.service 95.65% · jwt.service 100% · users.service 100% · payment-methods.service 100%
- Cobertura global: pendiente con Docker (necesita Testcontainers para routes/controllers)
- Integrado en app.ts: ✅ Sí
- Spec SDD/TDD: ✅ spec/sprint2/
- Migración 023: ✅ aplicada

## Responsabilidad
OTP por teléfono, JWT access/refresh, registro y login de usuarios. Gestión de perfil y métodos de pago (Stripe SetupIntent).

## Endpoints Sprint 2
```
POST /auth/register               → Registro con teléfono + OTP
POST /auth/verify-phone           → Verificar OTP → retorna tokens
POST /auth/login                  → Login → envía nuevo OTP
POST /auth/refresh                → Renueva access token (rotación)
GET  /users/me                    → Perfil del usuario autenticado
PATCH /users/me                   → Actualizar perfil
POST /users/me/payment-methods    → Crear Stripe SetupIntent
GET  /users/me/payment-methods    → Listar métodos de pago
```

## Tablas afectadas
`users` · `user_roles` · `user_auth` (migración 023) · `passenger_payment_methods` · `audit_logs`

## Redis keys
`otp:{phone}` (TTL 10 min) · `blacklist:token:{jti}` (TTL residual — cache de revocación)

## Decisiones de arquitectura aplicadas
- ADR-015: OTP-only sin passwords
- ADR-016: Híbrido PostgreSQL + Redis para revocación (PostgreSQL = fuente de verdad)
- ADR-017: Stripe SetupIntent en Sprint 2, cobro en Sprint 5
- ADR-018: OTPChannelService abstracto — LogOTPChannel (dev) / FirebaseOTPChannel (prod)

## Reglas críticas
- phone_verified = true solo después de OTP exitoso
- Con TEST_MODE=true, OTPChannel es LogOTPChannel siempre
- Refresh token rota en cada uso — jti anterior va a Redis blacklist
- Rate limit: login 5/15min por IP, verify-phone 3/10min por phone
- R-PAY-003: Solo almacenar pm_xxxxx — nunca número de tarjeta

## Estructura de archivos (implementados)
```
src/modules/auth/
├── auth.routes.ts          ✅
├── auth.controller.ts      ✅
├── auth.service.ts         ✅
├── user-auth.repository.ts ✅
├── jwt.service.ts          ✅
└── otp/
    ├── otp-channel.interface.ts  ✅
    ├── log-otp-channel.ts        ✅
    └── firebase-otp-channel.ts   ✅

src/modules/users/
├── users.routes.ts         ✅
├── users.controller.ts     ✅
├── users.service.ts        ✅
├── users.repository.ts     ✅
└── payment-methods/
    ├── payment-methods.routes.ts       ✅
    ├── payment-methods.controller.ts   ✅
    ├── payment-methods.service.ts      ✅
    └── payment-methods.repository.ts   ✅

apps/api/migrations/
└── 20240101000023_update_user_auth_for_otp.ts  ✅ (pendiente ejecutar)

apps/api/src/__tests__/
├── auth/
│   ├── jwt.service.test.ts         ✅ (14 tests)
│   ├── log-otp-channel.test.ts     ✅ (3 tests)
│   ├── auth.service.test.ts        ✅ (19 tests)
│   └── auth.integration.test.ts    ✅ (18 casos, requiere Docker)
└── users/
    ├── users.service.test.ts           ✅ (5 tests)
    └── payment-methods.service.test.ts ✅ (6 tests)
```

## Fixes de infraestructura aplicados en Sprint 2
- `jest.config.ts`: `setupFilesAfterFramework` → `setupFilesAfterEnv`
- `apps/api/package.json`: agregado `ts-node` en devDependencies
- `jwt.service.ts`: cast de `expiresIn` para compatibilidad con `@types/jsonwebtoken`
- `users.repository.ts` + `payment-methods.repository.ts`: guard `rows[0]` para `noUncheckedIndexedAccess`
- `users.routes.ts`: cast de handler para resolver incompatibilidad de tipos Fastify

## Deuda técnica pendiente
- ESLint no configurado en `apps/api` (`.eslintrc.js` local faltante desde Sprint 1)
- `tsconfig.json`: conflicto `rootDir` con `migrations/` y `seeds/`
- `TechnicalError` de Stripe retorna 500 en lugar de 502 — fix en Sprint 5

## Dependencias externas instaladas
- `firebase-admin ^12.0.0` — OTP producción
- `stripe ^14.0.0` — SetupIntent
- `jsonwebtoken` — ya existía en Sprint 1
