# Runbook — Procedimientos Operacionales

> Documento de referencia para incidentes en producción.
> Leer completo antes del primer lanzamiento.
>
> **Ante cualquier incidente:** mantener la calma, seguir el procedimiento, documentar lo que se hizo.

---

## Niveles de Severidad

| Nivel | Descripción | Tiempo de respuesta | Ejemplo |
|---|---|---|---|
| P1 — Crítico | Plataforma completamente caída o pérdida de dinero | Inmediato | API no responde, pagos fallando masivamente |
| P2 — Alto | Funcionalidad core degradada | < 30 min | Conductores no reciben solicitudes |
| P3 — Medio | Funcionalidad secundaria afectada | < 2 horas | Notificaciones push no llegan |
| P4 — Bajo | Problema menor sin impacto a usuarios | Siguiente día hábil | Dashboard admin lento |

---

## Escalación

```
Desarrollador de guardia
  → Si no resuelve en 15 min → Arquitecto de soluciones
    → Si no resuelve en 30 min → CTO / Lead técnico
      → Si hay pérdida de datos o dinero → Toda la dirección
```

---

## 1. API No Responde (P1)

### Síntomas
- Health check retorna error o timeout
- Usuarios reportan "no carga la app"
- Alerta: `high_error_rate` disparada

### Diagnóstico

```bash
# 1. Verificar status del servicio
curl https://api.tudominio.com/health

# 2. Ver logs recientes
# En Railway/Render: ir al dashboard → Logs → filtrar últimos 10 min

# 3. Verificar BD
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  https://api.tudominio.com/health/detailed

# 4. Verificar Redis
redis-cli -u $REDIS_URL ping
```

### Acciones

```bash
# Si el proceso se cayó → Railway/Render lo reinicia automáticamente
# Si sigue caído después de 2 min → reinicio manual

# Opción A: Reinicio desde el dashboard de Railway/Render
# Settings → Restart Service

# Opción B: Si tienes acceso al servidor
docker restart uber-api

# Verificar después del reinicio
curl https://api.tudominio.com/health
# Esperar: {"status":"ok"}
```

### Post-incident
- Revisar `system_error_logs` para identificar la causa
- Revisar si hay migraciones recientes que puedan haber causado el problema

---

## 2. Pagos Fallando Masivamente (P1)

### Síntomas
- Alerta: `payment_queue_backlog` con > 100 jobs
- Usuarios reportan "error al pagar"
- Bull Board muestra cola de pagos represada

### Diagnóstico

```bash
# 1. Verificar status de Stripe
# Abrir: https://status.stripe.com

# 2. Ver jobs fallidos en Bull Board
# Abrir: https://bull-board.tudominio.com/queues/payments

# 3. Ver errores recientes
# Query en BD:
SELECT error_code, error_message, context, created_at
FROM system_error_logs
WHERE service = 'payment'
  AND resolved = false
ORDER BY created_at DESC
LIMIT 20;
```

### Acciones según la causa

**Si Stripe está caído:**
```
1. No hacer nada — los jobs en BullMQ tienen reintentos automáticos
2. Monitorear https://status.stripe.com
3. Cuando Stripe se recupere, los jobs se procesarán automáticamente
4. Notificar a usuarios afectados si la caída es > 30 min
```

**Si Stripe está operativo pero los pagos fallan:**
```bash
# Verificar que STRIPE_SECRET_KEY es correcto en producción
# Railway/Render: Settings → Environment Variables

# Reintentar manualmente jobs fallidos desde Bull Board:
# Jobs → Failed → Retry All

# O via API admin:
curl -X POST https://api.tudominio.com/api/v1/admin/operations/failed-payments/PAYMENT_ID/retry \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Si hay jobs atascados (stuck) > 5 min:**
```bash
# Reiniciar el worker de pagos
# Esto no afecta viajes activos — el worker solo procesa cola

# En Railway/Render: reiniciar el servicio de workers
```

---

## 3. Conductor No Recibe Solicitudes de Viaje (P2)

### Síntomas
- Conductor reporta que está online pero no recibe viajes
- Pasajeros reportan "buscando conductor" sin éxito
- Alerta: `no_drivers_available` disparada

### Diagnóstico

```bash
# 1. Verificar conductores online en Redis
redis-cli -u $REDIS_URL keys "driver:*:location" | wc -l

# 2. Verificar si hay viajes en estado "searching"
SELECT COUNT(*) FROM trips WHERE status = 'searching';

# 3. Verificar logs del matching
# Buscar eventos: trip.searching.no_match en los logs

# 4. Verificar que el conductor específico está en Redis
redis-cli -u $REDIS_URL hgetall "driver:DRIVER_ID:location"
```

### Acciones

**Si el conductor está en Redis pero no recibe viajes:**
```bash
# Posible problema con Socket.io — verificar conexión del conductor
# Logs del namespace /driver en el servidor

# Solución: pedir al conductor que:
# 1. Cierre la app completamente
# 2. Espere 30 segundos
# 3. Abra la app y vuelva a ponerse online
```

**Si el conductor NO está en Redis:**
```bash
# Su posición no se está registrando
# Solución: pedir al conductor que se ponga offline y luego online de nuevo
# Si persiste, revisar logs del endpoint PATCH /drivers/me/location
```

**Si hay 0 conductores online en la zona:**
```bash
# Problema de oferta — no hay conductores disponibles
# Comunicar al equipo de operaciones para activar conductores de respaldo
```

---

## 4. Viaje "Colgado" en un Estado (P2)

### Síntomas
- Admin reporta un viaje que lleva horas en el mismo estado sin avanzar
- El pasajero o conductor reportan que la app no avanza

### Diagnóstico

```bash
# Ver el historial completo del viaje
curl https://api.tudominio.com/api/v1/admin/trips/TRIP_ID/full-timeline \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Ver estado actual en Redis
redis-cli -u $REDIS_URL hgetall "trip:TRIP_ID:state"
```

### Acciones

```bash
# Intervención manual desde el panel admin:
# Trips → [ID del viaje] → Acciones manuales → Forzar cancelación

# O via API:
curl -X POST https://api.tudominio.com/api/v1/admin/trips/TRIP_ID/force-cancel \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Cancelación manual por soporte - viaje colgado"}'

# Limpiar estado en Redis
redis-cli -u $REDIS_URL del "trip:TRIP_ID:state"

# Si hay que reembolsar al pasajero:
curl -X POST https://api.tudominio.com/api/v1/admin/trips/TRIP_ID/refund \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 5. Redis Caído (P1)

### Síntomas
- Alerta: `redis_unavailable`
- Los conductores aparecen "congelados" en el mapa
- Bull Board no responde
- Logs muestran errores de conexión a Redis

### Impacto mientras Redis está caído
- Los conductores no pueden ponerse online
- El tracking GPS no se actualiza en tiempo real
- Los jobs de BullMQ no se procesan (pero no se pierden)
- **Los viajes activos continúan** — el estado se lee de PostgreSQL

### Acciones

**Si es Railway/Render Managed Redis:**
```
1. Abrir el dashboard de Railway/Render
2. Verificar status del servicio Redis
3. Si está caído: reiniciar el servicio de Redis
4. Esperar reconexión automática (la app reintenta automáticamente)
```

**Verificar recuperación:**
```bash
redis-cli -u $REDIS_URL ping
# Debe retornar: PONG

curl -H "Authorization: Bearer ADMIN_TOKEN" \
  https://api.tudominio.com/health/detailed
# Debe mostrar redis: "ok"
```

**Después de recuperar Redis:**
```bash
# Los conductores deben reconectarse manualmente
# Pedir a los conductores que cierren y abran la app

# Los jobs de BullMQ se procesan automáticamente al reconectar
# Monitorear Bull Board para verificar que la cola se vacía
```

---

## 6. PostgreSQL Lento o Sin Conexiones (P1/P2)

### Síntomas
- API lenta (P99 > 5 segundos)
- Alerta: `database_connections` > 80%
- Errores: `too many connections`

### Diagnóstico

```sql
-- Conexiones activas por estado
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state
ORDER BY count DESC;

-- Queries lentas activas (> 5 segundos)
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 seconds';

-- Locks bloqueados
SELECT blocked_locks.pid, blocked_activity.query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_locks.pid
WHERE NOT blocked_locks.granted;
```

### Acciones

```sql
-- Terminar una query específica bloqueada
SELECT pg_terminate_backend(PID);

-- Terminar todas las conexiones idle > 10 min (cuidado)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND now() - state_change > interval '10 minutes';
```

```bash
# Si el pool de conexiones está saturado:
# Reiniciar el servicio API reduce las conexiones activas

# Si persiste, aumentar el límite en las variables de entorno:
DATABASE_POOL_MAX=20  # aumentar de 10 a 20
```

---

## 7. Hacer Rollback de un Deploy (P1/P2)

### Cuándo hacer rollback
- El nuevo deploy causa errores no presentes antes
- La tasa de errores HTTP subió significativamente después del deploy
- Una funcionalidad crítica dejó de funcionar

### Procedimiento

```bash
# En Railway/Render:
# Deployments → [último deploy exitoso] → Redeploy

# Verificar que el rollback fue exitoso:
curl https://api.tudominio.com/health
# Verificar la versión:
curl https://api.tudominio.com/health/detailed | grep version
```

### Si el rollback incluye migraciones de BD

```bash
# ⚠️ CUIDADO: Los rollbacks de migraciones son destructivos
# Solo ejecutar si estás SEGURO de lo que hace el down()

# Verificar qué migración hacer rollback
npm run db:migrate:status

# Hacer rollback de la última migración
npm run db:rollback

# Verificar el estado después
npm run db:migrate:status
```

---

## 8. Ejecutar Migración de Emergencia en Producción

### Procedimiento seguro

```bash
# 1. SIEMPRE hacer backup antes
pg_dump $DATABASE_URL | gzip > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql.gz

# 2. Verificar qué migraciones están pendientes
npm run db:migrate:status

# 3. Ejecutar en staging primero
npm run db:migrate:staging

# 4. Verificar que staging funciona correctamente (5-10 min)

# 5. Ejecutar en producción
npm run db:migrate:production

# 6. Verificar health check inmediatamente después
curl https://api.tudominio.com/health/detailed
```

---

## 9. Recuperar Datos de Backup (P1)

### Solo en caso de pérdida de datos — acción extrema

```bash
# 1. Identificar el backup más reciente antes del problema
aws s3 ls s3://uber-backups/postgres/ | sort | tail -10

# 2. Descargar el backup
aws s3 cp s3://uber-backups/postgres/uber_backup_YYYYMMDD.sql.gz .

# 3. Descomprimir
gunzip uber_backup_YYYYMMDD.sql.gz

# 4. Restaurar en una BD temporal primero para verificar
psql $TEMP_DATABASE_URL < uber_backup_YYYYMMDD.sql

# 5. Verificar que los datos son correctos
# Consultar algunas tablas críticas: trips, payments, users

# 6. Si todo está bien → restaurar en producción
# ⚠️ ESTO SOBREESCRIBE DATOS ACTUALES
psql $DATABASE_URL < uber_backup_YYYYMMDD.sql
```

---

## 10. Acceder a Logs en Producción

```bash
# Railway/Render: Dashboard → Logs → Filtrar por servicio

# Buscar errores en los últimos 30 minutos:
# Filtro: level=error

# Buscar logs de un viaje específico:
# Filtro: tripId=TRIP_ID

# Buscar logs de un usuario:
# Filtro: userId=USER_ID

# Ver logs de un request específico:
# Filtro: requestId=REQUEST_ID
# (el requestId se retorna en todos los responses de error como "request_id")
```

---

## 11. Verificar Estado General del Sistema

Ejecutar este checklist cuando hay dudas sobre el estado del sistema:

```bash
#!/bin/bash
echo "=== Health Check ==="
curl -s https://api.tudominio.com/health

echo "\n=== BD Connections ==="
psql $DATABASE_URL -c "
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

echo "\n=== Redis ==="
redis-cli -u $REDIS_URL ping

echo "\n=== Conductores online ==="
redis-cli -u $REDIS_URL keys "driver:*:location" | wc -l

echo "\n=== Viajes activos ==="
psql $DATABASE_URL -c "
  SELECT status, count(*) FROM trips
  WHERE status NOT IN ('completed','cancelled_by_passenger',
    'cancelled_by_driver','cancelled_no_driver','no_show')
  GROUP BY status;"

echo "\n=== Errores no resueltos ==="
psql $DATABASE_URL -c "
  SELECT service, error_code, count(*) FROM system_error_logs
  WHERE resolved = false
  GROUP BY service, error_code
  ORDER BY count DESC;"

echo "\n=== Jobs en cola ==="
# Verificar en Bull Board: http://bull-board.tudominio.com
```

---

## Post-Incident Report

Después de cualquier incidente P1 o P2, documentar:

```markdown
## Incident Report — [FECHA]

**Severidad:** P1 / P2
**Duración:** X minutos
**Usuarios afectados:** estimado

### ¿Qué pasó?
Descripción del problema.

### ¿Cómo se detectó?
Alerta automática / reporte de usuario / monitoreo manual

### Línea de tiempo
- HH:MM — Detección del problema
- HH:MM — Primera acción tomada
- HH:MM — Causa identificada
- HH:MM — Solución aplicada
- HH:MM — Verificación de recuperación

### Causa raíz
Descripción técnica de qué causó el problema.

### Solución aplicada
Qué se hizo para resolverlo.

### Acciones preventivas
Qué se va a hacer para que no vuelva a ocurrir.
```

Guardar el reporte en: `incidents/YYYY-MM-DD-descripcion.md`
