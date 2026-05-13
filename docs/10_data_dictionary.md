# Data Dictionary — Diccionario de Datos

> Referencia completa de todas las entidades, campos, y reglas de negocio implícitas en los datos.
> Consultar antes de escribir queries, migraciones, o lógica que acceda a la BD.

---

## Convenciones Globales

| Convención | Detalle |
|---|---|
| Primary Key | `UUID` generado con `gen_random_uuid()` — nunca autoincremental |
| Timestamps | `TIMESTAMPTZ` — siempre con zona horaria, en UTC |
| Soft delete | `deleted_at TIMESTAMPTZ NULL` — `NULL` significa activo |
| `updated_at` | Actualizado automáticamente por trigger en cada UPDATE |
| Nombres | `snake_case` en BD, `camelCase` en TypeScript |

---

## region_config

Configuración por país/región. Permite que el sistema opere en múltiples mercados sin hardcodear valores.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `country_code` | CHAR(2) | No | Código ISO 3166-1 alpha-2. Ej: `MX`, `CO`, `BR` |
| `region_name` | VARCHAR(100) | No | Nombre legible. Ej: `Mexico` |
| `currency` | CHAR(3) | No | Código ISO 4217. Ej: `MXN`, `COP`, `BRL` |
| `tax_rate` | DECIMAL(5,4) | No | IVA en decimal. México: `0.1600` (16%) |
| `timezone` | VARCHAR(50) | No | TZ database name. Ej: `America/Mexico_City` |
| `phone_prefix` | VARCHAR(5) | No | Prefijo internacional. Ej: `+52` |
| `active` | BOOLEAN | No | Si la región está operativa. Default: `true` |

**Regla importante:** Toda entidad que varíe por país (tarifas, documentos, comisiones) tiene `region_id FK`. Nunca hardcodear valores como el IVA o la moneda — siempre consultar `region_config`.

---

## users

Identidad base de cualquier actor en el sistema. Un mismo `user` puede tener múltiples roles.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `email` | VARCHAR(255) | Sí | Único si se proporciona. Opcional en MVP |
| `phone` | VARCHAR(20) | No | Único. Formato E.164: `+521234567890` |
| `phone_verified` | BOOLEAN | No | `true` solo después de verificar OTP exitosamente |
| `full_name` | VARCHAR(255) | No | Nombre completo tal como lo proporcionó el usuario |
| `avatar_url` | TEXT | Sí | URL pública de la foto de perfil |
| `status` | VARCHAR(20) | No | Ver valores válidos abajo |
| `deleted_at` | TIMESTAMPTZ | Sí | Soft delete — `NULL` = cuenta activa |

**Valores válidos de `status`:**
| Valor | Descripción |
|---|---|
| `active` | Cuenta normal y operativa |
| `suspended` | Bloqueado temporalmente — no puede hacer login |
| `banned` | Bloqueado permanentemente — no puede crear cuenta nueva con el mismo teléfono |

---

## user_roles

Un usuario puede tener múltiples roles. Un conductor que también usa la app como pasajero tendrá dos registros aquí.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users |
| `role` | VARCHAR(20) | No | Ver valores válidos abajo |
| `active` | BOOLEAN | No | Permite desactivar un rol sin borrar el registro |

**Valores válidos de `role`:**
| Valor | Descripción |
|---|---|
| `passenger` | Puede solicitar viajes |
| `driver` | Puede aceptar y ejecutar viajes |
| `admin` | Acceso al panel de administración |

**Restricción:** `UNIQUE(user_id, role)` — un usuario no puede tener el mismo rol duplicado.

---

## user_auth

Credenciales de autenticación separadas de la identidad. Permite múltiples métodos de auth.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users. UNIQUE — un registro por usuario |
| `password_hash` | TEXT | Sí | Hash bcrypt. `NULL` si el usuario solo usa OTP |
| `provider` | VARCHAR(20) | Sí | `local`, `google`, `apple` |
| `provider_id` | TEXT | Sí | ID del proveedor OAuth externo |
| `last_login_at` | TIMESTAMPTZ | Sí | Última autenticación exitosa |
| `refresh_token` | TEXT | Sí | Token de refresh activo. `NULL` si no hay sesión |

---

## drivers

Perfil extendido de un conductor. Solo existe si el usuario tiene el rol `driver`.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users. UNIQUE |
| `license_number` | VARCHAR(50) | No | Número de licencia de conducir |
| `license_expiry` | DATE | No | Fecha de vencimiento de la licencia |
| `status` | VARCHAR(20) | No | Ver valores válidos abajo |
| `rating` | DECIMAL(3,2) | No | Promedio de calificaciones. Rango: 1.00-5.00. Default: `0.00` (sin calificaciones) |
| `total_trips` | INTEGER | No | Contador de viajes completados. Solo incrementa, nunca decrementa |
| `online` | BOOLEAN | No | Si el conductor está disponible ahora mismo. También refleja en Redis |

**Valores válidos de `status`:**
| Valor | Descripción | Puede operar |
|---|---|---|
| `pending` | Recién registrado, sin documentos | No |
| `documents_submitted` | Subió documentos, esperando revisión | No |
| `under_review` | Admin está revisando | No |
| `approved` | Todos los documentos aprobados | Sí |
| `suspended` | Bloqueado temporalmente (docs vencidos, violación) | No |
| `banned` | Bloqueado permanentemente | No |

**Regla de `online`:** Solo puede ser `true` si `status = 'approved'`. Al suspender un conductor, `online` se pone en `false` automáticamente.

---

## document_requirements

Catálogo dinámico de documentos requeridos por región. Configurable desde el panel admin sin redeploy.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `code` | VARCHAR(50) | No | Identificador único por región. Ej: `drivers_license` |
| `name` | VARCHAR(100) | No | Nombre legible. Ej: `Licencia de conducir` |
| `description` | TEXT | Sí | Instrucciones para el conductor |
| `applies_to` | VARCHAR(20) | No | `driver` o `vehicle` |
| `required` | BOOLEAN | No | Si es obligatorio para aprobar al conductor |
| `has_expiry` | BOOLEAN | No | Si el documento tiene fecha de vencimiento |
| `expiry_alert_days` | SMALLINT | Sí | Días de anticipación para alertar vencimiento. Default: `30` |
| `sort_order` | SMALLINT | No | Orden de presentación en el UI |

**Restricción:** `UNIQUE(region_id, code)`

---

## driver_documents

Documentos subidos por el conductor. Uno por cada `document_requirement` requerido.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `driver_id` | UUID | No | FK → drivers |
| `requirement_id` | UUID | No | FK → document_requirements |
| `url` | TEXT | No | URL al archivo en almacenamiento (S3, etc.) |
| `status` | VARCHAR(20) | No | Ver valores válidos abajo |
| `rejection_reason` | TEXT | Sí | Motivo de rechazo — obligatorio cuando `status = 'rejected'` |
| `expires_at` | DATE | Sí | Fecha de vencimiento del documento |
| `reviewed_at` | TIMESTAMPTZ | Sí | Cuándo fue revisado por el admin |
| `reviewed_by` | UUID | Sí | FK → users (el admin que revisó) |

**Valores válidos de `status`:**
| Valor | Descripción |
|---|---|
| `pending` | Subido, esperando revisión |
| `approved` | Aprobado por el admin |
| `rejected` | Rechazado — el conductor debe subir uno nuevo |
| `expired` | Venció — el sistema lo marca automáticamente |

**Restricción:** `UNIQUE(driver_id, requirement_id)` — un documento por requisito por conductor.

---

## vehicles

Vehículos registrados por conductores.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `driver_id` | UUID | No | FK → drivers |
| `brand` | VARCHAR(50) | No | Marca. Ej: `Toyota` |
| `model` | VARCHAR(50) | No | Modelo. Ej: `Corolla` |
| `year` | SMALLINT | No | Año de fabricación |
| `plate` | VARCHAR(20) | No | Placa. UNIQUE en toda la plataforma |
| `color` | VARCHAR(30) | No | Color del vehículo en español |
| `status` | VARCHAR(20) | No | `pending`, `approved`, `rejected` |
| `active` | BOOLEAN | No | Si es el vehículo activo del conductor. Solo uno puede ser `true` a la vez |

---

## trip_types

Categorías de servicio (Basic, Plus, Premium). Configurables por región.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `name` | VARCHAR(50) | No | Ej: `Basic`, `Plus`, `Premium` |
| `description` | TEXT | Sí | Descripción visible al pasajero |
| `base_fare` | DECIMAL(10,2) | No | Tarifa fija de arranque en MXN |
| `cost_per_km` | DECIMAL(10,4) | No | Costo adicional por kilómetro |
| `cost_per_minute` | DECIMAL(10,4) | No | Costo adicional por minuto |
| `min_fare` | DECIMAL(10,2) | No | Tarifa mínima — el precio nunca puede ser menor |
| `capacity` | SMALLINT | No | Número máximo de pasajeros. Default: `4` |
| `active` | BOOLEAN | No | Si el tipo está disponible para solicitar |

---

## pricing_factors

Factores que modifican el precio del viaje dinámicamente.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `code` | VARCHAR(50) | No | Identificador único. Ej: `night_service`, `rain`, `peak_hour` |
| `name` | VARCHAR(100) | No | Nombre visible. Ej: `Servicio nocturno` |
| `factor_type` | VARCHAR(20) | No | Ver tipos abajo |
| `value` | DECIMAL(8,4) | No | Valor del factor según su tipo |
| `stackable` | BOOLEAN | No | Si puede combinarse con otros factores. Default: `true` |
| `priority` | SMALLINT | No | Orden de aplicación cuando `stackable = false`. Default: `0` |
| `active` | BOOLEAN | No | Si el factor está activo ahora mismo |

**Valores válidos de `factor_type`:**
| Tipo | `value` significa | Ejemplo |
|---|---|---|
| `multiplier` | Factor de multiplicación | `1.30` → suma 30% |
| `fixed_amount` | Monto fijo a sumar en MXN | `15.00` → suma $15 |
| `percentage` | Porcentaje a sumar | `0.10` → suma 10% |

**Orden de aplicación de factores:**
1. `fixed_amount` — se suman al subtotal base
2. `percentage` — se calculan sobre el subtotal actualizado
3. `multiplier` — se aplican al resultado acumulado

---

## pricing_factor_rules

Reglas que activan automáticamente un factor según condiciones.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `factor_id` | UUID | No | FK → pricing_factors |
| `rule_type` | VARCHAR(30) | No | Ver tipos abajo |
| `conditions` | JSONB | No | Condiciones en JSON según el tipo |
| `active` | BOOLEAN | No | Si la regla está activa |

**Tipos de regla y formato de `conditions`:**

```json
// time_range — activo entre ciertos horarios
{ "from": "22:00", "to": "06:00" }

// demand_threshold — activo cuando hay alta demanda
{ "active_requests": 50, "available_drivers": 5 }

// weather_condition — activo según el clima
{ "weather": ["rain", "storm", "fog"] }

// distance_threshold — activo según distancia del viaje
{ "min_km": 30 }

// manual — activado manualmente desde el panel admin
{}
```

---

## commission_rules

Reglas de comisión de la plataforma. Configurables sin redeploy.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `trip_type_id` | UUID | Sí | FK → trip_types. `NULL` = aplica a todos los tipos |
| `rule_name` | VARCHAR(100) | No | Nombre descriptivo. Ej: `Comisión estándar México` |
| `percentage` | DECIMAL(5,4) | No | Porcentaje en decimal. Ej: `0.2000` = 20% |
| `min_amount` | DECIMAL(10,2) | Sí | Comisión mínima en MXN |
| `max_amount` | DECIMAL(10,2) | Sí | Comisión máxima en MXN (cap) |
| `valid_from` | TIMESTAMPTZ | No | Desde cuándo aplica esta regla |
| `valid_until` | TIMESTAMPTZ | Sí | `NULL` = vigente indefinidamente |
| `active` | BOOLEAN | No | Si la regla está activa |

**Cálculo de comisión:**
```
comision = tarifa_neta * percentage
comision = MAX(comision, min_amount)   # si min_amount está definido
comision = MIN(comision, max_amount)   # si max_amount está definido
```

---

## trips

**Entidad central del sistema.** Representa un viaje desde su solicitud hasta su conclusión.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `region_id` | UUID | No | FK → region_config |
| `trip_type_id` | UUID | No | FK → trip_types |
| `passenger_id` | UUID | No | FK → users |
| `driver_id` | UUID | Sí | FK → drivers. `NULL` hasta que un conductor acepta |
| `vehicle_id` | UUID | Sí | FK → vehicles. `NULL` hasta asignación |
| `status` | VARCHAR(30) | No | Ver valores válidos abajo |
| `origin_address` | TEXT | No | Dirección de origen legible |
| `origin_lat` | DECIMAL(10,7) | No | Latitud de origen — 7 decimales para precisión de ~1cm |
| `origin_lng` | DECIMAL(10,7) | No | Longitud de origen |
| `dest_address` | TEXT | No | Dirección de destino legible |
| `dest_lat` | DECIMAL(10,7) | No | Latitud del destino |
| `dest_lng` | DECIMAL(10,7) | No | Longitud del destino |
| `estimated_distance` | DECIMAL(10,3) | Sí | Distancia estimada en km al solicitar |
| `estimated_duration` | INTEGER | Sí | Duración estimada en segundos al solicitar |
| `estimated_fare` | DECIMAL(10,2) | Sí | Precio estimado al solicitar |
| `actual_distance` | DECIMAL(10,3) | Sí | Distancia real recorrida en km. Solo al completarse |
| `actual_duration` | INTEGER | Sí | Duración real en segundos. Solo al completarse |
| `actual_fare` | DECIMAL(10,2) | Sí | Precio final cobrado. Solo al completarse |
| `base_fare` | DECIMAL(10,2) | Sí | Componente de tarifa base del precio final |
| `distance_fare` | DECIMAL(10,2) | Sí | Componente de distancia del precio final |
| `time_fare` | DECIMAL(10,2) | Sí | Componente de tiempo del precio final |
| `tax_amount` | DECIMAL(10,2) | Sí | IVA cobrado |
| `pricing_snapshot` | JSONB | Sí | **Inmutable.** Desglose completo del precio con factores aplicados. Se escribe una sola vez al completarse y nunca se modifica |
| `scheduled_at` | TIMESTAMPTZ | Sí | `NULL` = viaje inmediato. Fecha futura = viaje programado |
| `notes` | TEXT | Sí | Instrucciones del pasajero al conductor |
| `accepted_at` | TIMESTAMPTZ | Sí | Timestamp de cada cambio de estado |
| `driver_arrived_at` | TIMESTAMPTZ | Sí | |
| `started_at` | TIMESTAMPTZ | Sí | |
| `completed_at` | TIMESTAMPTZ | Sí | |
| `cancelled_at` | TIMESTAMPTZ | Sí | |
| `cancelled_by` | UUID | Sí | FK → users. Quién canceló |
| `cancellation_reason` | TEXT | Sí | Motivo de cancelación |

**Valores válidos de `status`:**
| Valor | Descripción |
|---|---|
| `requested` | Creado por el pasajero |
| `searching` | Buscando conductor disponible |
| `accepted` | Conductor asignado, aún no sale |
| `driver_en_route` | Conductor en camino al origen |
| `driver_arrived` | Conductor esperando en el origen |
| `in_progress` | Pasajero a bordo, en camino al destino |
| `completed` | Llegaron al destino, pago procesado |
| `cancelled_by_passenger` | Cancelado por el pasajero |
| `cancelled_by_driver` | Cancelado por el conductor |
| `cancelled_no_driver` | Sin conductor disponible (timeout) |
| `no_show` | El pasajero no abordó (timeout de espera) |

**Regla crítica de `pricing_snapshot`:** Este campo se escribe **una sola vez** cuando el viaje pasa a `completed`. Contiene el desglose exacto de cómo se calculó el precio en ese momento. Nunca debe modificarse aunque cambien los factores de precio después.

---

## trip_status_history

Historial completo e inmutable de todas las transiciones de estado de cada viaje.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `trip_id` | UUID | No | FK → trips |
| `from_status` | VARCHAR(30) | Sí | Estado anterior. `NULL` para el primer registro |
| `to_status` | VARCHAR(30) | No | Estado nuevo |
| `actor_type` | VARCHAR(20) | No | `passenger`, `driver`, `system`, `admin` |
| `actor_id` | UUID | Sí | FK → users. `NULL` si actor es `system` |
| `reason` | TEXT | Sí | Motivo — requerido en cancelaciones |
| `metadata` | JSONB | Sí | Datos adicionales de contexto |

**Regla:** Este registro nunca se modifica ni elimina. Es la fuente de verdad para auditoría de un viaje.

---

## trip_locations

Puntos GPS del conductor durante el viaje. Tabla TimescaleDB.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `time` | TIMESTAMPTZ | No | PK (parte). Timestamp del punto GPS |
| `trip_id` | UUID | No | PK (parte) |
| `driver_id` | UUID | No | ID del conductor |
| `lat` | DECIMAL(10,7) | No | Latitud |
| `lng` | DECIMAL(10,7) | No | Longitud |
| `speed` | DECIMAL(6,2) | Sí | Velocidad en km/h |
| `heading` | DECIMAL(5,2) | Sí | Dirección en grados (0-360) |
| `accuracy` | DECIMAL(6,2) | Sí | Precisión GPS en metros |
| `source` | VARCHAR(10) | No | `gps` o `network`. Default: `gps` |

**Retención:** 90 días. Los puntos más antiguos se eliminan automáticamente por la política de TimescaleDB.

**Hypertable:** Particionada por día. El índice `(trip_id, time DESC)` optimiza consultas de ruta de un viaje específico.

---

## scheduled_trips

Control del proceso de notificaciones para viajes programados.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `trip_id` | UUID | No | FK → trips. UNIQUE |
| `scheduled_at` | TIMESTAMPTZ | No | Momento en que debe iniciar el viaje |
| `timezone` | VARCHAR(50) | No | Zona horaria del pasajero |
| `status` | VARCHAR(20) | No | `pending`, `notified`, `started`, `cancelled` |
| `first_notice_at` | TIMESTAMPTZ | Sí | Cuándo enviar primer aviso (24h antes) |
| `first_notice_sent` | BOOLEAN | No | Si ya se envió. Default: `false` |
| `reminder_at` | TIMESTAMPTZ | Sí | Cuándo enviar recordatorio (1h antes) |
| `reminder_sent` | BOOLEAN | No | Default: `false` |
| `final_notice_at` | TIMESTAMPTZ | Sí | Cuándo enviar aviso final (15min antes) |
| `final_notice_sent` | BOOLEAN | No | Default: `false` |

**Mecánica:** El cron job consulta registros donde `*_sent = false` y el timestamp ya pasó. Esto garantiza que si el cron falla, los avisos se envían al recuperarse.

---

## payments

Registro de cobros por viaje.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `trip_id` | UUID | No | FK → trips |
| `passenger_id` | UUID | No | FK → users |
| `driver_id` | UUID | No | FK → drivers |
| `amount` | DECIMAL(10,2) | No | Monto total cobrado al pasajero (incluye IVA) |
| `tax_amount` | DECIMAL(10,2) | No | IVA incluido en `amount` |
| `platform_fee` | DECIMAL(10,2) | No | Comisión de la plataforma |
| `driver_earnings` | DECIMAL(10,2) | No | `amount - tax_amount - platform_fee` |
| `currency` | CHAR(3) | No | Código ISO 4217. Default: `MXN` |
| `method` | VARCHAR(20) | No | `card` (MVP). Futuro: `cash` |
| `status` | VARCHAR(20) | No | Ver valores válidos abajo |
| `provider` | VARCHAR(20) | Sí | `stripe` |
| `provider_payment_id` | TEXT | Sí | ID del charge en Stripe: `ch_xxxxx` |
| `provider_response` | JSONB | Sí | Respuesta completa de Stripe para auditoría |

**Valores válidos de `status`:**
| Valor | Descripción |
|---|---|
| `pending` | Cobro iniciado, esperando confirmación |
| `completed` | Cobro exitoso |
| `failed` | Cobro fallido |
| `refunded` | Reembolsado total o parcialmente |

**Relación:** `amount = driver_earnings + platform_fee + tax_amount`

---

## passenger_payment_methods

Métodos de pago guardados por el pasajero vía Stripe.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users |
| `provider` | VARCHAR(20) | No | `stripe` |
| `provider_customer_id` | TEXT | No | ID del customer en Stripe: `cus_xxxxx` |
| `provider_method_id` | TEXT | No | ID del payment method en Stripe: `pm_xxxxx` |
| `last_four` | CHAR(4) | Sí | Últimos 4 dígitos de la tarjeta |
| `brand` | VARCHAR(20) | Sí | `visa`, `mastercard`, `amex` |
| `exp_month` | SMALLINT | Sí | Mes de vencimiento (1-12) |
| `exp_year` | SMALLINT | Sí | Año de vencimiento (YYYY) |
| `is_default` | BOOLEAN | No | Solo uno puede ser `true` por usuario |

**Regla:** Nunca se almacenan números de tarjeta completos — solo el `provider_method_id` de Stripe. El cobro siempre se hace a través de Stripe con este ID.

---

## trip_applied_factors

Auditoría de qué factores de precio se aplicaron a cada viaje y cuánto impactaron. Se registra una vez al completarse el viaje, junto con el `pricing_snapshot`.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `trip_id` | UUID | No | FK → trips |
| `factor_id` | UUID | No | FK → pricing_factors |
| `factor_value` | DECIMAL(8,4) | No | Valor del factor **en el momento de aplicarse** — no el valor actual de `pricing_factors` |
| `impact_amount` | DECIMAL(10,2) | No | Cuánto sumó o multiplicó este factor al precio final en MXN |
| `created_at` | TIMESTAMPTZ | No | Momento en que se registró |

**Regla crítica:** `factor_value` guarda el valor vigente al momento del viaje, no una FK al valor actual. Esto garantiza que aunque el admin cambie el valor del factor después, el historial del viaje refleja lo que realmente se aplicó.

**Relación con `pricing_snapshot`:** Ambos registran el precio final, pero desde ángulos distintos. `trip_applied_factors` permite queries analíticos (¿cuántos viajes se cobraron con el factor lluvia este mes?), mientras que `pricing_snapshot` en `trips` da el desglose completo en un solo campo JSONB para mostrar en el recibo.

---

## ratings

Calificaciones entre actores del viaje. Bidireccional: el pasajero califica al conductor y viceversa.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `trip_id` | UUID | No | FK → trips |
| `from_user_id` | UUID | No | FK → users. Quién califica |
| `to_user_id` | UUID | No | FK → users. A quién califica |
| `role` | VARCHAR(20) | No | Rol del `to_user_id`: `passenger` o `driver` |
| `score` | SMALLINT | No | Calificación de 1 a 5. `CHECK (score BETWEEN 1 AND 5)` |
| `comment` | TEXT | Sí | Comentario opcional |

**Restricción:** `UNIQUE(trip_id, from_user_id)` — cada actor califica una sola vez por viaje.

---

## audit_logs

Registro inmutable de todos los cambios en entidades de negocio.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `entity_type` | VARCHAR(50) | No | Qué entidad cambió: `trip`, `driver`, `payment`, etc. |
| `entity_id` | UUID | No | ID de la entidad que cambió |
| `action` | VARCHAR(50) | No | Qué pasó: `created`, `status_changed`, `document_approved`, etc. |
| `actor_type` | VARCHAR(20) | No | Quién lo hizo: `user`, `driver`, `admin`, `system` |
| `actor_id` | UUID | Sí | ID del actor. `NULL` si es el sistema |
| `old_value` | JSONB | Sí | Estado anterior |
| `new_value` | JSONB | Sí | Estado nuevo |
| `ip_address` | INET | Sí | IP de origen de la acción |
| `user_agent` | TEXT | Sí | User agent del cliente |
| `metadata` | JSONB | Sí | Contexto adicional |

**Regla:** Este registro nunca se modifica ni elimina. Es append-only.

---

## system_error_logs

Errores críticos del sistema que requieren atención.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | UUID | No | PK |
| `service` | VARCHAR(50) | No | Módulo donde ocurrió: `payment`, `tracking`, `notification` |
| `error_code` | VARCHAR(50) | No | Código del error |
| `error_message` | TEXT | No | Descripción del error |
| `stack_trace` | TEXT | Sí | Stack trace completo |
| `context` | JSONB | Sí | Datos relevantes al error |
| `trip_id` | UUID | Sí | FK → trips. Si aplica |
| `user_id` | UUID | Sí | FK → users. Si aplica |
| `resolved` | BOOLEAN | No | Si fue resuelto. Default: `false` |
| `resolved_at` | TIMESTAMPTZ | Sí | Cuándo fue resuelto |
| `resolved_by` | UUID | Sí | FK → users. Admin que lo resolvió |

---

## Índices Importantes

```sql
-- Búsquedas frecuentes de viajes
CREATE INDEX idx_trips_passenger  ON trips(passenger_id);
CREATE INDEX idx_trips_driver     ON trips(driver_id);
CREATE INDEX idx_trips_status     ON trips(status);
CREATE INDEX idx_trips_created_at ON trips(created_at DESC);
CREATE INDEX idx_trips_scheduled  ON trips(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Historial de estados
CREATE INDEX idx_trip_status_history_trip
  ON trip_status_history(trip_id, created_at DESC);

-- GPS tracking (TimescaleDB)
CREATE INDEX idx_trip_locations
  ON trip_locations(trip_id, time DESC);

-- Auditoría
CREATE INDEX idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id, created_at DESC);

-- Errores no resueltos
CREATE INDEX idx_error_logs_unresolved
  ON system_error_logs(resolved, created_at DESC)
  WHERE resolved = false;
```
