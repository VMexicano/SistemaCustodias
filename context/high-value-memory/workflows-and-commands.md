# Workflows and Commands — Memorias de Alto Valor

Comandos CLI validados y flujos de trabajo probados.

---

## Arrancar el stack local completo

```bash
# 1. Infraestructura (PostgreSQL + TimescaleDB + Redis + Bull Board)
docker compose up -d

# 2. Migraciones y seeds
pnpm --filter @custodias/api knex migrate:latest
pnpm --filter @custodias/api knex seed:run

# 3. API backend (puerto 3333)
pnpm --filter @custodias/api dev

# 4. Web admin (puerto 3002) — en otra terminal
pnpm --filter @custodias/web dev

# 5. App mobile (puerto 8081) — en otra terminal
pnpm --filter @custodias/mobile start
```

---

## Verificación rápida de salud

```bash
# Verificar TypeScript sin compilar
pnpm --filter @custodias/api exec tsc --noEmit 2>&1 | head -10

# Correr tests de un módulo
pnpm --filter @custodias/api test -- --testPathPattern=custody-orders 2>&1 | grep -E "^(Tests|PASS|FAIL)"

# Ver estado de la cola BullMQ
open http://localhost:3001   # Bull Board
```

---

## Git push con SSL corporativo

```bash
# El certificado SSL de la red puede bloquear el push — usar:
git -c http.sslVerify=false push origin main
```

---

## Matar proceso en puerto ocupado (EADDRINUSE)

```bash
# Windows
netstat -ano | findstr :3333
taskkill /PID {pid} /F

# O con npx (cross-platform)
npx kill-port 3333
```

---

## Variables de entorno mínimas para desarrollo

```bash
# Copiar el template y ajustar
cp .env.vertical.example .env.development

# Variables críticas a configurar:
VERTICAL_SLUG=custody
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/custodias
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-only
```
