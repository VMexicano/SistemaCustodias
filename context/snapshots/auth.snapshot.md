# Snapshot: auth
> Autenticación de todos los actores — OTP, JWT, refresh token.
> Última actualización: 2026-05-13 — Sprint 0

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

- **Access token:** JWT, expira en 15 minutos, firmado con RS256
- **Refresh token:** Opaco, almacenado en Redis, expira en 30 días
- **Payload del JWT:**
  ```json
  { "sub": "uuid", "role": "custodio", "iat": 0, "exp": 0 }
  ```

---

## Middleware de autenticación

```typescript
// Aplicar a todas las rutas protegidas
fastify.addHook('preHandler', authenticate);
fastify.addHook('preHandler', authorize(['supervisor', 'dispatcher']));
```

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
