# Design — Sprint 2: Auth y Usuarios

> **Sprint:** 2 de 7
> **Última actualización:** 2026-04-05

---

## 1. Arquitectura al finalizar Sprint 2

```
apps/api/src/
├── config/           ← Sprint 1 (sin cambios)
├── shared/           ← Sprint 1 (sin cambios)
└── modules/
    ├── auth/         ← NUEVO Sprint 2
    │   ├── auth.routes.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── otp/
    │   │   ├── otp-channel.interface.ts   ← Interfaz abstracta
    │   │   ├── log-otp-channel.ts         ← Dev/test: OTP en logs
    │   │   └── firebase-otp-channel.ts    ← Producción: Firebase Phone Auth
    │   ├── jwt.service.ts
    │   └── user-auth.repository.ts
    └── users/        ← NUEVO Sprint 2
        ├── users.routes.ts
        ├── users.controller.ts
        ├── users.service.ts
        ├── users.repository.ts
        └── payment-methods/
            ├── payment-methods.routes.ts
            ├── payment-methods.controller.ts
            ├── payment-methods.service.ts
            └── payment-methods.repository.ts
```

---

## 2. Migración 023 — Evolución de user_auth

```typescript
// 20240101000023_update_user_auth_for_otp.ts

// up(): agrega columnas para patrón híbrido PostgreSQL + Redis
table.text('refresh_token_jti').nullable()          // UUID del refresh token activo
table.timestamp('refresh_token_exp', { useTz: true }).nullable()  // Expiración
table.timestamp('revoked_at', { useTz: true }).nullable()         // Revocación explícita
table.dropColumn('refresh_token')                    // Eliminar columna raw (ya no usada)
table.dropColumn('password_hash')                    // OTP-only — sin passwords (ADR-015)

// down(): revierte los cambios
```

---

## 3. Interfaces TypeScript clave

### UserDTO
```typescript
interface UserDTO {
  id: string;           // UUID
  phone: string;        // E.164
  full_name: string;
  status: 'active' | 'suspended' | 'banned';
  phone_verified: boolean;
  created_at: string;   // ISO 8601
}
```

### AuthTokensDTO
```typescript
interface AuthTokensDTO {
  access_token: string;
  refresh_token: string;
  user: UserDTO;
}
```

### JWTPayload
```typescript
interface JWTPayload {
  sub: string;      // user_id
  roles: string[];  // ['passenger'] | ['driver'] | ['admin']
  region: string;   // 'MX'
  jti?: string;     // solo en refresh token
}
```

### OTPChannelService (interfaz abstracta)
```typescript
interface OTPChannel {
  send(phone: string, otp: string): Promise<void>;
}

// Implementaciones:
class LogOTPChannel implements OTPChannel {
  async send(phone: string, otp: string) {
    logger.info({ phone, otp }, 'OTP code (dev mode)');
  }
}

class FirebaseOTPChannel implements OTPChannel {
  // Usa Firebase Admin SDK para enviar SMS a través de Firebase Phone Auth
  async send(phone: string, otp: string) { ... }
}
```

### PaymentMethodDTO
```typescript
interface PaymentMethodDTO {
  id: string;
  provider: 'stripe';
  provider_method_id: string;  // pm_xxxxx
  last4: string;
  brand: string;               // 'visa' | 'mastercard' | etc
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}
```

---

## 4. Contratos de API completos

### POST /auth/register

```
Método:  POST
Path:    /auth/register
Auth:    No requerida
Rate:    5 req / 15 min por IP

Request:
{
  phone:     string   // E.164, ej: "+525512345678"
  full_name: string   // min 2 chars, max 100 chars
}

Response 202:
{
  expiresIn: 600      // segundos hasta que expira el OTP
}

Errores:
  409  { error: { code: "PHONE_ALREADY_REGISTERED", message: "...", statusCode: 409 } }
  403  { error: { code: "PHONE_BANNED",             message: "...", statusCode: 403 } }
  422  { error: { code: "VALIDATION_ERROR",          message: "...", statusCode: 422 } }
  429  { error: { code: "RATE_LIMIT_EXCEEDED",       message: "...", statusCode: 429 } }
```

### POST /auth/verify-phone

```
Método:  POST
Path:    /auth/verify-phone
Auth:    No requerida
Rate:    3 req / 10 min por phone

Request:
{
  phone: string   // E.164
  otp:   string   // 6 dígitos
}

Response 200:
{
  accessToken:  string   // JWT, TTL 15 min
  refreshToken: string   // JWT, TTL 30 días
  user: UserDTO
}

Errores:
  400  OTP_INVALID
  400  OTP_EXPIRED
  404  USER_NOT_FOUND
  429  RATE_LIMIT_EXCEEDED
```

### POST /auth/login

```
Método:  POST
Path:    /auth/login
Auth:    No requerida
Rate:    5 req / 15 min por IP

Request:
{
  phone: string   // E.164
}

Response 202:
{
  expiresIn: 600
}

Errores:
  404  USER_NOT_FOUND
  403  USER_SUSPENDED
  429  RATE_LIMIT_EXCEEDED
```

### POST /auth/refresh

```
Método:  POST
Path:    /auth/refresh
Auth:    No requerida

Request:
{
  refreshToken: string
}

Response 200:
{
  accessToken:  string
  refreshToken: string   // nuevo token (rotación)
}

Errores:
  401  TOKEN_INVALID
  401  TOKEN_EXPIRED
```

### GET /users/me

```
Método:  GET
Path:    /users/me
Auth:    Bearer token requerido

Response 200: UserDTO

Errores:
  401  TOKEN_INVALID
```

### PATCH /users/me

```
Método:  PATCH
Path:    /users/me
Auth:    Bearer token requerido

Request (todos opcionales):
{
  full_name?: string   // min 2, max 100
}

Response 200: UserDTO

Errores:
  401  TOKEN_INVALID
  422  VALIDATION_ERROR
```

### POST /users/me/payment-methods

```
Método:  POST
Path:    /users/me/payment-methods
Auth:    Bearer token requerido

Request: {} (vacío)

Response 200:
{
  clientSecret:    string   // para completar en el frontend con Stripe.js
  setupIntentId:   string   // si_{xxxxx}
}

Errores:
  401  TOKEN_INVALID
  502  { error: { code: "STRIPE_UNAVAILABLE", statusCode: 502 } }
```

### GET /users/me/payment-methods

```
Método:  GET
Path:    /users/me/payment-methods
Auth:    Bearer token requerido

Response 200: PaymentMethodDTO[]

Errores:
  401  TOKEN_INVALID
```

---

## 5. Flujo de revocación híbrida (ADR-016)

```
LOGOUT / REFRESH:
  1. Extraer jti del refresh token (campo del JWT)
  2. Calcular TTL residual: token.exp - Date.now()
  3. PostgreSQL: UPDATE user_auth SET revoked_at = NOW() WHERE user_id = ?
  4. Redis: SET blacklist:token:{jti} "1" EX {ttl_residual}

VALIDACIÓN /auth/refresh:
  1. jwt.verify(token) → extraer { jti, sub, exp }
  2. Redis: EXISTS blacklist:token:{jti}
     → true  → TOKEN_INVALID (fast path)
     → false → continuar
  3. PostgreSQL: SELECT WHERE user_id = sub AND refresh_token_jti = jti
                          AND revoked_at IS NULL
                          AND refresh_token_exp > NOW()
     → no existe → TOKEN_INVALID
     → existe    → continuar
  4. Generar nuevos access_token + refresh_token (nuevo jti)
  5. PostgreSQL: UPDATE user_auth SET refresh_token_jti = new_jti, refresh_token_exp = new_exp
  6. Redis: SET blacklist:token:{old_jti} "1" EX {ttl_residual_del_token_anterior}
```

---

## 6. Variables de entorno nuevas

```env
# Firebase Phone Auth (producción)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# JWT (ya existen desde Sprint 1)
JWT_SECRET=
JWT_REFRESH_SECRET=
```

Agregar a `apps/api/.env.example` y al schema Zod en `environment.ts`:
- `FIREBASE_PROJECT_ID` — opcional en dev, requerido en producción
- `STRIPE_SECRET_KEY` — requerido siempre
- `OTP_PROVIDER` — `'log'` (default dev) | `'firebase'` (producción)

---

## 7. ADRs aplicables

| ADR | Decisión |
|---|---|
| ADR-001 | Monolito modular — módulos auth/ y users/ son módulos internos |
| ADR-002 | Fastify — routes con @fastify/jwt o jsonwebtoken manual |
| ADR-008 | SELECT FOR UPDATE — no aplica en auth, sí en trips |
| ADR-015 | OTP-only sin passwords |
| ADR-016 | Híbrido PostgreSQL + Redis para revocación de refresh tokens |
| ADR-017 | Stripe SetupIntent en Sprint 2, cobro (PaymentIntent) en Sprint 5 |
| ADR-018 | OTPChannelService abstracto — LogOTPChannel (dev) + FirebaseOTPChannel (prod) |
