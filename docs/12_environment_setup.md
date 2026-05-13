# Environment Setup — Configuración del Entorno de Desarrollo

> Tiempo estimado para un entorno nuevo: 30-45 minutos.
> Si algo falla, ver la sección [Problemas Conocidos](#problemas-conocidos).

---

## Prerequisitos

Instalar exactamente estas versiones para evitar incompatibilidades:

| Herramienta | Versión | Verificar con |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| npm | 10.x | `npm --version` |
| Docker Desktop | 4.x+ | `docker --version` |
| Docker Compose | 2.x (incluido en Docker Desktop) | `docker compose version` |
| Git | 2.x+ | `git --version` |

### Instalación de Node.js (recomendado con nvm)

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recargar shell
source ~/.bashrc  # o ~/.zshrc

# Instalar Node 20
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node --version   # debe mostrar v20.x.x
```

---

## Clonar el Repositorio

```bash
git clone https://github.com/tu-org/uber-platform.git
cd uber-platform
```

---

## Variables de Entorno

```bash
# Copiar la plantilla
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local

# Abrir y completar los valores
# Los valores de desarrollo están documentados abajo
```

### Valores para desarrollo local

Estos valores funcionan con el `docker-compose.yml` incluido:

```bash
# apps/api/.env.local

NODE_ENV=development
PORT=3000
APP_VERSION=1.0.0
SERVICE_NAME=api

# Base de datos — valores del docker-compose
DATABASE_URL=postgresql://uber_user:uber_pass@localhost:5432/uber_dev
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis — valores del docker-compose
REDIS_URL=redis://localhost:6379

# JWT — puedes usar estos en desarrollo
JWT_SECRET=dev_secret_key_minimo_64_caracteres_para_que_sea_valido_en_jwt_ok
JWT_REFRESH_SECRET=dev_refresh_secret_key_diferente_al_access_token_para_seguridad
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# Stripe — usar claves de TEST (no afectan dinero real)
# Obtener en: https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Google Maps
# Obtener en: https://console.cloud.google.com/apis/credentials
# Activar: Maps JavaScript API, Directions API, Distance Matrix API
GOOGLE_MAPS_API_KEY=AIza...

# Notificaciones — pueden dejarse vacías en desarrollo inicial
FCM_SERVER_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_FROM=

# Observabilidad
JAEGER_ENDPOINT=http://localhost:4318/v1/traces
LOG_LEVEL=debug

# Scheduler
SCHEDULER_CRON_INTERVAL=* * * * *

# Modo test — habilitar en desarrollo
# OTP siempre acepta "123456" cuando es true
TEST_MODE=true
```

---

## Levantar el Entorno

### Paso 1 — Instalar dependencias

```bash
# Desde la raíz del monorepo
npm install
```

### Paso 2 — Levantar servicios de infraestructura

```bash
docker compose up -d

# Verificar que todos los servicios estén corriendo
docker compose ps
```

Debes ver estos servicios con estado `running`:

```
NAME              STATUS
postgres          running (healthy)
redis             running (healthy)
bull-board        running
prometheus        running
grafana           running
jaeger            running
```

### Paso 3 — Preparar la base de datos

```bash
# Correr migraciones
npm run db:migrate

# Poblar con datos de prueba
npm run db:seed
```

Los seeds crean:
- Región México con configuración base
- 3 tipos de viaje: Basic, Plus, Premium
- 8 factores de precio configurados
- 1 usuario admin: `admin@tudominio.com` / `Admin1234!`
- 2 usuarios de prueba: pasajero y conductor aprobado

### Paso 4 — Levantar la aplicación

```bash
# Opción A: todo junto (recomendado)
npm run dev

# Opción B: servicios por separado
npm run dev:api    # API en puerto 3000
npm run dev:web    # Panel admin en puerto 3001
```

### Paso 5 — Verificar que todo funciona

```bash
# Health check de la API
curl http://localhost:3000/health
# Debe retornar: {"status":"ok","timestamp":"..."}

# Health check detallado (requiere auth)
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/health/detailed
```

---

## URLs del Entorno Local

| Servicio | URL | Credenciales |
|---|---|---|
| API | http://localhost:3000 | — |
| Panel Admin | http://localhost:3001 | admin@tudominio.com / Admin1234! |
| Bull Board (colas) | http://localhost:3002 | — |
| Grafana (métricas) | http://localhost:3003 | admin / admin |
| Jaeger (trazas) | http://localhost:16686 | — |
| Prometheus | http://localhost:9090 | — |
| PostgreSQL | localhost:5432 | uber_user / uber_pass / uber_dev |
| Redis | localhost:6379 | — |

---

## Configuración de Servicios Externos

### Stripe (pagos)

1. Crear cuenta en https://stripe.com (si no tienes)
2. Ir a Dashboard → Developers → API keys
3. Copiar la **Test Secret Key** (`sk_test_...`) en `.env.local`
4. Para webhooks locales, instalar Stripe CLI:

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Escuchar webhooks en desarrollo
stripe listen --forward-to localhost:3000/webhooks/stripe
# Esto genera el STRIPE_WEBHOOK_SECRET para .env.local
```

### Google Maps

1. Ir a https://console.cloud.google.com
2. Crear proyecto o usar uno existente
3. Habilitar estas APIs:
   - Maps JavaScript API
   - Directions API
   - Distance Matrix API
   - Geocoding API
4. Crear API Key en Credentials
5. Copiar en `.env.local`

> **Nota:** En desarrollo, Google Maps tiene un crédito gratuito de $200/mes. No se cobra en desarrollo normal.

### Twilio (SMS — opcional para desarrollo)

Solo necesario para probar OTP real. Con `TEST_MODE=true`, el OTP siempre es `123456`.

Si quieres probar SMS reales:
1. Crear cuenta en https://twilio.com
2. Obtener un número de teléfono de prueba
3. Copiar `Account SID`, `Auth Token` y el número en `.env.local`

### FCM (Push Notifications — opcional para desarrollo)

Solo necesario para probar notificaciones push reales en dispositivo físico.

1. Crear proyecto en https://console.firebase.google.com
2. Ir a Project Settings → Cloud Messaging
3. Copiar el Server Key en `.env.local`

---

## Configuración del Editor (VS Code)

### Extensiones recomendadas

Crear `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-azuretools.vscode-docker",
    "eamodio.gitlens",
    "streetsidesoftware.code-spell-checker-spanish"
  ]
}
```

### Configuración del workspace

Crear `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.updateImportsOnFileMove.enabled": "always"
}
```

---

## Comandos de Uso Frecuente

```bash
# ── Desarrollo ─────────────────────────────────────────────────────
npm run dev                     # Levantar todo en modo desarrollo
npm run dev:api                 # Solo la API
npm run dev:web                 # Solo el panel admin

# ── Base de datos ───────────────────────────────────────────────────
npm run db:migrate              # Correr migraciones pendientes
npm run db:migrate:test         # Migraciones en BD de test
npm run db:rollback             # Revertir última migración
npm run db:seed                 # Poblar con datos de prueba
npm run db:reset                # Borrar todo y volver a migrar + seed (¡DESTRUCTIVO!)
npm run db:studio               # Abrir Knex studio (si está disponible)

# ── Testing ─────────────────────────────────────────────────────────
npm run test                    # Unit tests
npm run test:watch              # Watch mode
npm run test:integration        # Integration tests (requiere Docker corriendo)
npm run test:coverage           # Con reporte HTML de cobertura
npm run e2e                     # E2E completo con Playwright
npm run e2e:headed              # E2E con browser visible
npm run e2e:debug               # E2E en modo debug
npm run agent:verify:quick      # Unit tests + smoke E2E (< 30 seg)
npm run agent:verify            # Verificación completa antes de PR

# ── Infraestructura ─────────────────────────────────────────────────
docker compose up -d            # Levantar servicios
docker compose down             # Detener servicios
docker compose down -v          # Detener y borrar volúmenes (¡DESTRUCTIVO!)
docker compose logs -f api      # Ver logs de un servicio

# ── Utilidades ──────────────────────────────────────────────────────
npm run lint                    # Verificar estilo de código
npm run lint:fix                # Corregir automáticamente
npm run type-check              # Verificar tipos TypeScript
npm run build                   # Build de producción
```

---

## Verificación Final del Entorno

Ejecutar este checklist para confirmar que todo está bien:

```bash
# 1. Docker corriendo
docker compose ps | grep "running"
# Debe listar: postgres, redis, bull-board, prometheus, grafana, jaeger

# 2. API responde
curl http://localhost:3000/health
# Debe retornar: {"status":"ok"}

# 3. BD con datos de seed
curl http://localhost:3000/api/v1/catalog/trip-types
# Debe retornar 3 tipos de viaje: Basic, Plus, Premium

# 4. Tests pasan
npm run test
# Debe terminar con: Tests: X passed

# 5. Sin errores de TypeScript
npm run type-check
# Debe terminar sin output (sin errores)
```

Si todos pasan — el entorno está listo para desarrollar.

---

## Problemas Conocidos

### Puerto 5432 ocupado (PostgreSQL ya instalado localmente)

```bash
# Opción A: cambiar el puerto en docker-compose.yml
ports:
  - "5433:5432"   # usar 5433 en el host

# Actualizar DATABASE_URL en .env.local
DATABASE_URL=postgresql://uber_user:uber_pass@localhost:5433/uber_dev

# Opción B: detener el PostgreSQL local
sudo systemctl stop postgresql   # Linux
brew services stop postgresql    # macOS
```

### Error "Cannot find module" al correr tests

```bash
# Limpiar la caché de Node y reinstalar
rm -rf node_modules
npm install
```

### Docker compose up falla con "network not found"

```bash
docker network prune
docker compose up -d
```

### La migración falla con "relation already exists"

```bash
# Verificar estado de migraciones
npm run db:migrate:status

# Si hay inconsistencia, resetear la BD de desarrollo
npm run db:reset
```

### OTP no llega por SMS en desarrollo

Verificar que `TEST_MODE=true` está en `.env.local`. Con esto, el OTP siempre es `123456` sin necesitar Twilio.

### Google Maps retorna error 403

La API Key no tiene habilitadas las APIs correctas. Verificar en Google Cloud Console que estén activas: Maps JavaScript API, Directions API, Distance Matrix API, Geocoding API.

### TimescaleDB — Error "extension timescaledb not found"

```bash
# Verificar que se está usando la imagen correcta
docker compose down -v
docker compose up -d
# La imagen timescale/timescaledb:latest-pg15 incluye la extensión
```

---

## Setup para CI/CD (GitHub Actions)

Los siguientes secrets deben configurarse en el repositorio de GitHub:

**Settings → Secrets and variables → Actions**

| Secret | Descripción |
|---|---|
| `STAGING_DEPLOY_HOOK` | URL del webhook de deploy en Railway/Render staging |
| `STAGING_TOKEN` | Token de autenticación para staging |
| `PROD_DEPLOY_HOOK` | URL del webhook de deploy en producción |
| `PROD_TOKEN` | Token de autenticación para producción |
| `REGISTRY_USER` | Usuario del Docker registry |
| `REGISTRY_PASSWORD` | Password del Docker registry |
| `MAPBOX_SECRET_ACCESS_TOKEN` | Token secreto de Mapbox (`sk.xxx`) — requerido para compilar el APK Android |

Los tests en CI usan sus propias instancias de PostgreSQL y Redis definidas en los workflows — no dependen del entorno local.

---

## E2E con Maestro — `apps/mobile-v2`

### Prerequisitos locales

| Herramienta | Instalación | Verificar |
|---|---|---|
| Maestro CLI | `curl -Ls "https://get.maestro.mobile.dev" \| bash` | `maestro --version` |
| Android SDK + adb | Android Studio / SDK Manager | `adb devices` |
| Emulador Android | AVD Manager → API 33, pixel_6 | aparece en `adb devices` |

### Setup antes de correr E2E

```bash
# 1. Backend corriendo
docker compose up -d
cd apps/api && pnpm dev

# 2. En nueva terminal — redirigir puertos al emulador
adb reverse tcp:3333 tcp:3333

# 3. Compilar e instalar APK (primera vez o cuando haya cambios nativos)
cd apps/mobile-v2/android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

> **Nota Windows:** Usar `gradlew.bat assembleDebug` en lugar de `./gradlew assembleDebug`.

### Correr los flows

```bash
# Todos los flows
pnpm --filter mobile-v2 test:e2e

# Flow individual
pnpm --filter mobile-v2 test:e2e:auth
pnpm --filter mobile-v2 test:e2e:passenger
pnpm --filter mobile-v2 test:e2e:driver

# O directamente con Maestro
maestro test apps/mobile-v2/e2e/flows/auth.yaml
```

### Usuarios de prueba (seeds)

| Rol | Teléfono | OTP |
|---|---|---|
| Pasajero | `+525500000001` | `123456` |
| Conductor (approved) | `+525500000002` | `123456` |

El bypass de OTP requiere `TEST_OTP_BYPASS=true` y `TEST_OTP_CODE=123456` en `.env` de la API.

### Flujos cubiertos

| Flow | Archivo | Escenarios |
|---|---|---|
| Auth | `e2e/flows/auth.yaml` | OTP incorrecto → error; OTP correcto → Home |
| Pasajero | `e2e/flows/passenger.yaml` | Login → Home → Estimate → ActiveTrip → Cancelar |
| Conductor | `e2e/flows/driver.yaml` | Login → Online → Offline |

### Troubleshooting

| Problema | Solución |
|---|---|
| `Connection refused :3333` | Verificar que `adb reverse` esté activo y la API corriendo |
| Emulador no aparece | `adb kill-server && adb start-server` |
| `home-map` no visible después de login | El mapa de Mapbox tarda ~2-3s; Maestro reintenta automáticamente |
| Flow falla en `estimate-card-0` | Verificar que el seed de trip_types esté aplicado: `pnpm --filter api exec knex seed:run` |

---

## EAS Build — Distribución en la nube

EAS (Expo Application Services) genera los binarios Android/iOS sin necesitar Xcode ni Android Studio localmente.

### Prerequisitos

```bash
npm install -g eas-cli       # instalar CLI global
eas login                     # autenticar con cuenta Expo
eas build:configure           # primer setup (solo una vez)
```

### Profiles disponibles (`apps/mobile-v2/eas.json`)

| Profile | Plataforma | Tipo | Uso |
|---|---|---|---|
| `development` | Android / iOS | APK / Dev Build | Desarrollo con expo-dev-client |
| `preview` | Android / iOS | APK / Ad-hoc IPA | QA interno, testers |
| `production` | Android / iOS | AAB / IPA | Google Play + App Store / TestFlight |

### Comandos por etapa

```bash
# Dev Build (Android APK con expo-dev-client)
eas build --profile development --platform android --non-interactive

# Preview (APK para QA — no requiere firma de producción)
eas build --profile preview --platform android --non-interactive

# Producción Android (AAB → Google Play)
eas build --profile production --platform android --non-interactive

# Producción iOS (IPA → App Store / TestFlight)
eas build --profile production --platform ios --non-interactive

# Build para ambas plataformas simultáneamente
eas build --profile production --platform all --non-interactive
```

> Todos los comandos se ejecutan desde `apps/mobile-v2/` o con `--root-dir apps/mobile-v2` desde la raíz del monorepo.

### Submit (subir a las tiendas)

```bash
# Subir iOS a TestFlight (requiere Apple credentials configuradas en EAS)
eas submit --platform ios --profile production --latest

# Subir Android a Google Play Internal Testing
eas submit --platform android --profile production --latest
```

### Variables de entorno en EAS

Las variables de `apps/mobile-v2/app.config.ts` se pasan vía `extra`. Para builds de CI, configurar en el dashboard de Expo (expo.dev) o via `eas secret`:

```bash
eas secret:create --name MAPBOX_PUBLIC_TOKEN --value "pk.eyJ1..." --scope project
eas secret:create --name API_URL --value "https://api.uberbase.mx" --scope project
```

### Tiempo estimado de build (plan gratuito con cola)

| Plataforma | Tiempo |
|---|---|
| Android (APK) | 5–10 min |
| iOS (IPA) | 15–25 min |

Para builds más rápidos en desarrollo, usar build local:

```bash
# Build local Android (requiere Android SDK instalado)
eas build --profile development --platform android --local
```
