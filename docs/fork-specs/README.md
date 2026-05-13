# Fork Specs — Guía de uso

Este directorio contiene los archivos de contexto listos para cada fork vertical.
Cuando hagas `git clone` del fork correspondiente, ejecuta los pasos de esta guía
para que cualquier agente pueda iniciar sin contexto previo.

---

## Forks disponibles

| Directorio | Vertical | Slug | Mercado |
|---|---|---|---|
| `taxi/` | Taxi CDMX | `taxi` | B2C pasajeros urbanos |
| `custody/` | Custodia de Valores | `custody` | B2B empresas de seguridad |

---

## Documentos de referencia — cuál usar para qué

| Documento | Estado | Usar para |
|---|---|---|
| `docs/VERTICAL_CLONE_GUIDE.md` | ✅ Actualizado (Sprint 15) | Setup completo: Docker, DB, seeds, APK |
| `docs/12_environment_setup.md` | ⚠️ Desactualizado | **No usar** — usa `npm` en vez de `pnpm`, puerto 3000 en vez de 3333, Google Maps en vez de Mapbox |
| `.env.vertical.example` | ✅ Actualizado | Template de variables de entorno para el fork |
| `apps/api/.env.example` | ✅ Actualizado | Template canónico de la API con credenciales correctas |

---

## Setup del entorno de desarrollo (Docker + BD + seeds)

> Seguir `docs/VERTICAL_CLONE_GUIDE.md` Pasos 1–5. A continuación el resumen ejecutivo.

### Prerequisitos

```
Node.js 20 LTS · pnpm 9.x · Docker Desktop 4.x · Android Studio SDK API 36 (solo para mobile)
```

### Comandos en orden

```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.vertical.example apps/api/.env
# Editar apps/api/.env: cambiar VERTICAL_SLUG=taxi o custody

# 3. Infraestructura Docker (PostgreSQL 15+TimescaleDB, Redis, Grafana, Bull Board, Jaeger)
docker compose up -d
docker compose ps   # todos deben estar en estado "running"

# 4. Migraciones (38 migraciones al Sprint 17)
pnpm --filter api knex migrate:latest
# Output esperado: "Batch 1 run: 38 migrations"

# 5. Seeds base
pnpm --filter api knex seed:run
# Output esperado: "Ran 11 seed files"
# Crea: región MX, 3 trip_types, 3 verticales, empresa-demo, admin user,
#       usuarios de prueba mobile, requiresApproval en custody y cold-chain

# 6. Levantar el stack completo
pnpm dev
# API: http://localhost:3333 · Backoffice: http://localhost:5173 · Metro: http://localhost:8081
```

### Credenciales de desarrollo

| Servicio | URL | Usuario / Credencial |
|---|---|---|
| API | http://localhost:3333 | — |
| Backoffice | http://localhost:5173 | `admin` / `Admin1234!` |
| PostgreSQL | localhost:5432 | `ridebase_user` / `ridebase_pass` / db: `ridebase_dev` |
| Redis | localhost:6379 | sin auth |
| Grafana | http://localhost:3000 | `admin` / `admin` |
| Bull Board | http://localhost:3001 | — |
| Jaeger | http://localhost:16686 | — |

Usuarios mobile de prueba (seeds):

| Rol | Teléfono | OTP (con `OTP_PROVIDER=log`) |
|---|---|---|
| Pasajero | `+525500000001` | aparece en logs de la API |
| Conductor | `+525500000002` | aparece en logs de la API |

### Variables de entorno mínimas

Copiar `.env.vertical.example` → `apps/api/.env` y ajustar:

```bash
VERTICAL_SLUG=taxi          # taxi | custody
DATABASE_URL=postgresql://ridebase_user:ridebase_pass@localhost:5432/ridebase_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_cambiar_en_prod_64_chars_minimo
JWT_REFRESH_SECRET=dev_refresh_secret_diferente_al_anterior_64_chars
OTP_PROVIDER=log            # log en dev (OTP aparece en consola), firebase en prod
STRIPE_SECRET_KEY=sk_test_reemplazar_con_clave_real_de_stripe_test
PORT=3333
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

```bash
# apps/web/.env
VITE_VERTICAL_SLUG=taxi     # debe coincidir con VERTICAL_SLUG de la API
```

### Verificación rápida

```bash
curl -s http://localhost:3333/config | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('slug'), d.get('name'))"
# Esperado: taxi  Taxi  (o: custody  Custodia de Valores)
```

---

## Pasos al crear el fork

### 1. Fork del repositorio base

```bash
# En GitHub: Fork de UBER_BASE → nombre del nuevo repo (ej. TAXI_CDMX o CUSTODY_MX)
git clone https://github.com/tu-org/TAXI_CDMX.git
cd TAXI_CDMX
```

### 2. Copiar el vertical-spec al lugar correcto

```bash
# Para el fork taxi:
cp docs/fork-specs/taxi/vertical-spec.md context/vertical-spec.md

# Para el fork custody:
cp docs/fork-specs/custody/vertical-spec.md context/vertical-spec.md
```

### 3. Actualizar CLAUDE.md — añadir al bloque "Siempre en contexto"

Encontrar esta sección en `CLAUDE.md`:

```markdown
**Siempre en contexto (automático):**
- `context/project-index.md` — **leer primero** — schema, módulos, reglas, ADRs, patrones en un archivo
- `context/session.md` — estado de la sesión actual
```

Reemplazarla con:

```markdown
**Siempre en contexto (automático):**
- `context/project-index.md` — **leer primero** — schema, módulos, reglas, ADRs, patrones en un archivo
- `context/vertical-spec.md` — **leer segundo** — identidad del vertical, diferencias vs base, roadmap
- `context/session.md` — estado de la sesión actual
```

### 4. Añadir sección "Fork" al inicio de CLAUDE.md

Justo después del título `# CLAUDE.md — UBER_BASE`, añadir:

**Para taxi:**
```markdown
## Fork: Taxi CDMX
> Fork de UBER_BASE Sprint 17 (2026-05-07). Vertical activo: `taxi`. B2C pasajeros urbanos México.
> Lee `context/vertical-spec.md` para el roadmap y diferencias vs el base.
```

**Para custody:**
```markdown
## Fork: Custodia de Valores
> Fork de UBER_BASE Sprint 17 (2026-05-07). Vertical activo: `custody`. B2B empresas de seguridad México.
> Lee `context/vertical-spec.md` para el roadmap y diferencias vs el base.
```

### 5. Añadir sección "Vertical activo" al inicio de context/project-index.md

Justo después de la primera línea (`> Referencia densa...`), añadir:

**Para taxi:**
```markdown
## Vertical activo — Taxi CDMX
| slug | pricingModel | requiresApproval | B2B | Base sprint |
|------|-------------|-----------------|-----|-------------|
| `taxi` | `per_km_min` | `false` | no | Sprint 17 (2026-05-07) |
> Para roadmap y diferencias vs UBER_BASE → `context/vertical-spec.md`
```

**Para custody:**
```markdown
## Vertical activo — Custodia de Valores
| slug | pricingModel | requiresApproval | B2B | Base sprint |
|------|-------------|-----------------|-----|-------------|
| `custody` | `per_declared_value` | `true` | sí | Sprint 17 (2026-05-07) |
> Para roadmap y diferencias vs UBER_BASE → `context/vertical-spec.md`
```

### 6. Configurar la variable de entorno del vertical

```bash
# apps/api/.env
VERTICAL_SLUG=taxi       # o custody

# apps/web/.env
VITE_VERTICAL_SLUG=taxi  # debe coincidir
```

### 7. Limpiar el directorio docs/fork-specs (opcional)

Una vez copiado el vertical-spec, el directorio `docs/fork-specs/` puede eliminarse del fork
para no confundir a futuros agentes:

```bash
rm -rf docs/fork-specs/
git add -A && git commit -m "chore: initialize taxi fork from UBER_BASE Sprint 17"
```

---

## Verificación final — el agente puede iniciar cuando

```
□ context/vertical-spec.md existe
□ CLAUDE.md referencia vertical-spec.md en "Siempre en contexto"
□ context/project-index.md tiene sección "Vertical activo" al inicio
□ VERTICAL_SLUG en .env coincide con el slug del vertical
□ GET /config retorna el slug correcto tras pnpm dev
```
