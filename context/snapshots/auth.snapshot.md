# Snapshot: auth
> Autenticación de todos los actores — OTP, JWT, refresh token.
> Última actualización: 2026-05-14 — Sprint 1 ✅

---

## Archivo(s) principal(es)

```
apps/api/src/modules/auth/
  auth.routes.ts
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  auth.schemas.ts
  auth.types.ts
  jwt.utils.ts
  otp.utils.ts
```

---

## Actores y sus roles JWT

| Actor | Role claim | Accesos |
|---|---|---|
| `client` | `client` | Crear órdenes, ver sus propias órdenes, firmar |
| `custodio` | `custodio` | Ver órdenes asignadas, transiciones de operador |
| `copiloto` | `copiloto` | Ver órdenes asignadas, confirmar asignación |
| `dispatcher` | `dispatcher` | Crear, asignar y gestionar órdenes |
| `supervisor` | `supervisor` | Aprobar, rechazar, gestionar incidentes, ver todo |

---

## Flujo de autenticación

```
1. POST /auth/request-otp   { phone }  → envía OTP por SMS
2. POST /auth/verify-otp    { phone, otp }  → devuelve { access_token, refresh_token, user }
3. POST /auth/refresh        { refresh_token }  → devuelve nuevo access_token
4. POST /auth/logout         { refresh_token }  → invalida el refresh token
```

---

## Endpoints

| Método | Ruta | Autenticación | Descripción |
|---|---|---|---|
| POST | `/auth/request-otp` | Pública | Solicita OTP por SMS |
| POST | `/auth/verify-otp` | Pública | Verifica OTP y emite tokens |
| POST | `/auth/refresh` | Pública | Renueva access token |
| POST | `/auth/logout` | Bearer JWT | Invalida refresh token |
| GET | `/auth/me` | Bearer JWT | Perfil del usuario autenticado |

---

## Tokens

- **Access token:** JWT, expira en 15 minutos, firmado con `JWT_SECRET`
- **Refresh token:** Opaco con JTI, almacenado en Redis + PostgreSQL, expira en 30 días
- **Payload del JWT (Sprint 1+):**
  ```json
  {
    "sub": "uuid",
    "roles": ["custodio"],
    "region": "MX",
    "tenant_id": "company-uuid-o-null",
    "iat": 0,
    "exp": 0
  }
  ```
- `tenant_id` es `undefined` si el usuario no pertenece a ninguna empresa todavía.

---

## Middleware de autenticación

```typescript
// Autenticación base — todas las rutas protegidas
fastify.addHook('preHandler', authenticate);

// Autorización por rol
fastify.addHook('preHandler', authorize(['supervisor', 'dispatcher']));

// Tenant guard — rutas de dominio custodia (/custody, /orders, /clients, /operators)
fastify.addHook('preHandler', tenantGuard);
```

## Roles disponibles (Sprint 1+)

```typescript
type UserRole =
  | 'client'      // custodia: solicita órdenes
  | 'custodio'    // custodia: ejecuta transporte
  | 'copiloto'    // custodia: acompaña al custodio
  | 'dispatcher'  // custodia: asigna y coordina
  | 'supervisor'  // custodia: aprueba y gestiona
  | 'passenger'   // legacy ride-hailing
  | 'driver'      // legacy ride-hailing
  | 'admin';      // sistema
```

## Estado de implementación (Sprint 1)

| Archivo | Estado |
|---|---|
| `auth.service.ts` | ✅ `register(role)`, `verifyPhone` + `refresh` con `tenant_id` |
| `jwt.service.ts` | ✅ `tenant_id?` en `AccessTokenPayload` y `VerifiedToken` |
| `authenticate.ts` | ✅ `JWTPayload` con `tenant_id?` |
| `tenant.middleware.ts` | ✅ `tenantGuard` — 403 en rutas custodia sin tenant |
| `auth.service.test.ts` | ✅ 28 tests (incluyendo 8 nuevos para roles + tenant_id) |
| `tenant.middleware.test.ts` | ✅ 8 tests |

---

## Reglas

1. El OTP expira en 5 minutos
2. Máximo 3 intentos fallidos antes de bloquear 15 minutos (Redis counter)
3. El refresh token se invalida al hacer logout
4. El role del usuario viene de `users.role` en BD — no se puede cambiar sin intervención de supervisor
5. Los endpoints públicos son solo `/auth/*` — todo lo demás requiere JWT válido

---

## Dependencias entre módulos

- `clients` — Un `client` es primero un `user` con role='client'
- `operadores` — Un `custodio`/`copiloto` es primero un `user` con role correspondiente
