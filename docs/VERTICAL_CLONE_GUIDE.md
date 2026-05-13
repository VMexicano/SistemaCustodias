# Guía de clonación de vertical — UBER_BASE

> Esta guía permite levantar el stack completo con un nuevo vertical de negocio (taxi, custody, cold-chain, o uno personalizado) en menos de un día hábil.

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| pnpm | 9.x |
| Docker Desktop | 4.x |
| Android Studio + SDK | API 36 (para mobile) |
| Git | 2.x |

---

## Paso 1 — Clonar el repositorio e instalar dependencias

```bash
git clone https://github.com/tu-org/UBER_BASE.git
cd UBER_BASE
pnpm install
```

**Output esperado:** `Done in Xs. pnpm lockfile is up to date.`

> Si el install falla con `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, verifica que todos los workspaces en `pnpm-workspace.yaml` coincidan con los nombres en cada `package.json`.

---

## Paso 2 — Configurar variables de entorno

```bash
# API
cp .env.vertical.example apps/api/.env

# Backoffice web
cp .env.vertical.example apps/web/.env
```

Editar `apps/api/.env` y `apps/web/.env`:

```bash
# Elegir slug del vertical a activar:
VERTICAL_SLUG=taxi          # taxi | custody | cold-chain | mi_vertical
VITE_VERTICAL_SLUG=taxi     # debe coincidir con VERTICAL_SLUG
```

Configurar la base de datos:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uber_base
REDIS_URL=redis://localhost:6379
JWT_SECRET=secreto_local_cambiar_en_prod
JWT_REFRESH_SECRET=secreto_refresh_local_cambiar_en_prod
OTP_PROVIDER=log
```

---

## Paso 3 — Levantar infraestructura Docker

```bash
docker compose up -d
```

**Output esperado:**

```
✔ Container uber_base-postgres-1  Started
✔ Container uber_base-redis-1     Started
✔ Container uber_base-grafana-1   Started
```

Verificar:

```bash
docker compose ps
# Todos los servicios deben estar en estado "running"
```

---

## Paso 4 — Correr migraciones

```bash
pnpm --filter api knex migrate:latest
```

**Output esperado:**

```
Batch 1 run: 37 migrations
```

Si hay errores de conexión: verificar que PostgreSQL del paso 3 esté corriendo.

---

## Paso 5 — Correr seeds base

```bash
pnpm --filter api knex seed:run
```

**Output esperado:**

```
Ran 10 seed files
```

Esto inserta:
- Región MX
- 3 tipos de viaje (basic, plus, premium)
- 3 verticales: taxi, custody, cold-chain
- Usuario admin: `admin` / `Admin1234!`
- Usuarios de prueba mobile: `+525500000001` (pasajero) · `+525500000002` (conductor)

---

## Paso 6 — Crear seed para tu vertical personalizado

Si quieres agregar un vertical nuevo (diferente a taxi/custody/cold-chain):

```bash
# Copiar el template
cp apps/api/seeds/templates/vertical.template.ts apps/api/seeds/11_mi_vertical.ts
```

Editar `apps/api/seeds/11_mi_vertical.ts`:

```typescript
const VERTICAL_SLUG = 'mi_vertical';
const VERTICAL_NAME = 'Mi Vertical';
const FEATURES = {
  scheduling: false,
  cargoDeclaration: true,
  chainOfCustody: true,
  temperatureLog: false,
  pricingModel: 'per_declared_value',

  // --- Extensión de cadena de custodia (ADR-046) ---
  // Define los tipos de evento que aparecen en CustodyEventScreen.
  // Si se omite, la app usa [pick_up, handoff, delivery] como fallback.
  custodyEventTypes: [
    { code: 'reception', label: 'Recepción y Registro', requiresPhoto: true, requiresSignature: false },
    { code: 'load', label: 'Preparación y Carga', requiresPhoto: true, requiresSignature: false },
    { code: 'handoff', label: 'Relevo de Responsabilidad', requiresPhoto: true, requiresSignature: true },
    { code: 'delivery', label: 'Entrega Final', requiresPhoto: true, requiresSignature: true },
  ],

  // --- Campos de declaración de carga (ADR-046) ---
  // Define los campos que el pasajero llena en CargoDeclarationScreen.
  // Si se omite, la app usa 4 campos genéricos como fallback.
  cargoFields: [
    { key: 'cargo_description', label: 'Descripción del valor', type: 'text', required: true, placeholder: 'Ej. Efectivo, documentos notariales...', multiline: true },
    { key: 'declared_value', label: 'Valor declarado (MXN)', type: 'number', required: true, placeholder: '0.00' },
    { key: 'seal_number', label: 'Número de sello de seguridad', type: 'text', required: true, placeholder: 'SELLO-XXXX' },
    { key: 'recipient_name', label: 'Destinatario', type: 'text', required: true, placeholder: 'Nombre completo' },
    { key: 'recipient_phone', label: 'Teléfono del destinatario', type: 'phone', required: false, placeholder: '+52 55 0000 0000' },
  ],

  // --- Lógica de selección de unidad (ADR-046) ---
  // El fork implementa la lógica en su propia capa de servicio.
  // 'by_declared_value': unidad blindada si declared_value > umbral
  // 'by_cargo_type': unidad según tipo de carga declarada
  // 'manual': operador asigna unidad manualmente en backoffice
  unitTypeDetermination: 'by_declared_value',
};
```

> **Nota sobre `requiresSignature`:** El campo existe como contrato pero la UI de firma (biométrica, PIN o firma digital) no está implementada en el repo base. El fork debe agregar la pantalla de firma en `CustodyEventScreen` activada por ese flag (ver ADR-046).

Correr solo el nuevo seed:

```bash
pnpm --filter api knex seed:run --specific 11_mi_vertical.ts
```

**Verificar:**

```bash
# Debe retornar el vertical recién insertado
curl -s http://localhost:3333/config | jq '.vertical.slug'
# "taxi"  ← cambia VERTICAL_SLUG en .env y reinicia la API para ver el tuyo
```

---

## Paso 7 — Configurar features del vertical vía backoffice

Una vez el stack está corriendo (paso 11), puedes editar features sin tocar la BD:

1. Abrir `http://localhost:5173/admin/verticals`
2. Click en **Editar** en la tarjeta de tu vertical
3. Activar/desactivar features con los toggles
4. Seleccionar el modelo de precio
5. Click en **Guardar** → llama `PATCH /admin/verticals/:id`

O directamente via API:

```bash
# Obtener token admin
TOKEN=$(curl -s -X POST http://localhost:3333/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234!"}' | jq -r '.accessToken')

# Obtener id del vertical
VERTICAL_ID=$(curl -s http://localhost:3333/admin/verticals \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.slug=="mi_vertical") | .id')

# Actualizar features
curl -X PATCH http://localhost:3333/admin/verticals/$VERTICAL_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"features": {"cargoDeclaration": true, "pricingModel": "fixed_rate"}}'
```

---

## Paso 8 — Configurar requisitos de conductor por vertical

Los conductores de un vertical específico pueden requerir documentos adicionales.
El seed template ya los inserta. Para agregarlos manualmente via API:

```bash
# El seed 10_vertical_document_requirements.ts es el ejemplo canónico.
# Para un vertical nuevo, insertar en document_requirements con vertical_id.
pnpm --filter api knex seed:run --specific 11_mi_vertical.ts
```

Verificar los requisitos:

```bash
curl -s http://localhost:3333/admin/drivers/requirements \
  -H "Authorization: Bearer $TOKEN" | jq '[.[] | {code, name, vertical_id}]'
```

---

## Paso 9 — Verificar GET /config retorna el vertical correcto

```bash
# Asegurarse que VERTICAL_SLUG en .env coincide con el slug deseado
# y reiniciar la API si se cambió

curl -s http://localhost:3333/config | jq '{slug: .vertical.slug, features: .vertical.features}'
```

**Output esperado (ejemplo para taxi):**

```json
{
  "slug": "taxi",
  "features": {
    "scheduling": true,
    "multiStop": false,
    "cargoDeclaration": false,
    "chainOfCustody": false,
    "temperatureLog": false,
    "b2bAccounts": false,
    "pricingModel": "per_km_min"
  }
}
```

Si el slug no coincide: verificar `VERTICAL_SLUG` en `apps/api/.env` y reiniciar con `pnpm --filter api dev`.

---

## Paso 10 — Compilar APK para Android (opcional)

> Requiere Android Studio, SDK API 36, y Ninja 1.12.1.

```bash
cd apps/mobile-v2

# Instalar dependencias nativas
pnpm install --ignore-workspace

# Compilar APK debug (con bundle JS embebido — sin Metro)
cd android
./gradlew assembleDebug

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

**Instalar en emulador o dispositivo:**

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

La app leerá `VERTICAL_SLUG` via `GET /config` al iniciar y activará/desactivará features automáticamente.

---

## Paso 11 — Levantar el stack completo en modo desarrollo

```bash
# Desde la raíz del monorepo
pnpm dev
```

Esto levanta en paralelo:
- API Fastify en `http://localhost:3333`
- Backoffice web en `http://localhost:5173`
- Metro bundler (mobile) en `http://localhost:8081`

Servicios de observabilidad (Docker):
- Grafana: `http://localhost:3000`
- Bull Board: `http://localhost:3001`
- Jaeger: `http://localhost:16686`

---

## Paso 12 — Checklist final de verificación

```
□ GET /config retorna el slug correcto con las features del vertical
□ POST /auth/register funciona con OTP_PROVIDER=log (OTP en consola de la API)
□ POST /trips/estimate retorna tarifa usando el pricingModel del vertical
□ Admin puede login en http://localhost:5173 (admin / Admin1234!)
□ VerticalesPage muestra las tarjetas con features del vertical
□ Editar vertical → toggle + Guardar → GET /config refleja el cambio
□ (si cargoDeclaration=true) Mobile muestra formulario de carga al solicitar viaje
□ (si chainOfCustody=true) Driver ve botón "Cadena de custodia" en viaje activo
□ (si temperatureLog=true) Driver puede registrar temperatura + admin ve gráfica
□ APK instalada en emulador conecta a la API correctamente
```

---

## Referencia de verticales existentes

| Slug | Nombre | pricingModel | Features activas |
|---|---|---|---|
| `taxi` | Taxi | per_km_min | scheduling |
| `custody` | Custodia de Valores | per_declared_value | scheduling, multiStop, cargoDeclaration, chainOfCustody, b2bAccounts |
| `cold-chain` | Cadena de Frío | per_declared_value | scheduling, multiStop, cargoDeclaration, chainOfCustody, temperatureLog, b2bAccounts |

### Modelos de tarifa disponibles

| pricingModel | Fórmula | Caso de uso |
|---|---|---|
| `per_km_min` | `base_fare + cost_per_km × km + cost_per_minute × min` | Taxi urbano |
| `fixed_rate` | `base_fare` (fijo, sin variables) | Rutas fijas, mensajería |
| `per_weight_km` | `base_fare + cost_per_km × km × weight_kg` | Carga refrigerada |
| `per_declared_value` | Porcentaje sobre `metadata.cargo.declared_value` | Valores, custodia |

---

## Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | AVD con poco espacio | Aumentar Internal Storage a 6 GB en Android Studio |
| `ON CONFLICT` falla en seed | Índice único faltante en migración | Correr `pnpm --filter api knex migrate:latest` primero |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | Nombre de workspace incorrecto | Verificar nombre en `package.json` vs `pnpm-workspace.yaml` |
| OTP no llega al teléfono | `OTP_PROVIDER=log` en dev | Buscar el OTP en los logs de la API (`pnpm --filter api dev`) |
| GET /config retorna vertical incorrecto | VERTICAL_SLUG desactualizado | Reiniciar API tras cambiar `.env` |
| Metro bundle error en Detox | `debuggableVariants` no vacío | Asegurarse que `debuggableVariants = []` en `android/app/build.gradle` |
