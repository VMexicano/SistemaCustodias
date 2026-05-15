# Decisions Log — Architecture Decision Records (ADR)
> Registro de decisiones de arquitectura y producto del SistemaCustodias.
> Formato: contexto → opciones consideradas → decisión → consecuencias.
> Cuándo agregar: toda decisión que no sea trivialmente reversible.

---

## ADR-001: Monolito modular (no microservicios en MVP)

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
El sistema de custodias necesita manejar transacciones con garantías ACID (estado de órdenes, audit log, pagos). En MVP la velocidad de iteración es crítica.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Microservicios | Escalabilidad independiente | Complejidad operacional alta, transacciones distribuidas difíciles |
| Monolito modular | ACID nativo, un solo deploy, iteración rápida | Escala vertical solo; coupling potencial si no se disciplina |
| Serverless | Sin infra que gestionar | Latencia fría, estado difícil, WebSocket imposible |

**Decisión:** Monolito modular con Fastify 4. Módulos autocontenidos (routes+controller+service+repository) sin importaciones cruzadas de repositories.

**Consecuencias:**
- Un solo proceso que desplegar
- Transacciones ACID simples entre módulos
- Si necesitamos escalar horizontalmente: stateless por diseño (JWT + Redis) → load balancer listo
- Para extraer un módulo a microservicio en el futuro: la disciplina de módulos lo facilita

---

## ADR-002: TimescaleDB para tracking GPS (no InfluxDB, no MongoDB)

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
El tracking GPS genera miles de lecturas por hora durante órdenes activas. Necesitamos queries eficientes por rango de tiempo y por orden.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| InfluxDB | Diseñado para time-series | Otra BD que operar, no SQL, joins difíciles |
| MongoDB | Flexible, bueno para documentos | Sin ACID, queries geo menos ergonómicas |
| TimescaleDB | SQL estándar + extensión time-series, misma BD | Extensión de PostgreSQL — misma infra |
| PostgreSQL puro | Familiar | Queries de rango lentos sin particionamiento |

**Decisión:** TimescaleDB como extensión de PostgreSQL. La tabla `location_readings` es una hypertable. Misma conexión, mismo ORM, cero infraestructura adicional.

**Consecuencias:**
- Una sola conexión de BD para todo
- Compresión automática de datos > 7 días
- Retención configurable (default: 90 días)
- `CREATE INDEX ON location_readings (order_id, time DESC)` para queries de orden activa

---

## ADR-003: BullMQ para efectos secundarios fuera de transacción

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
Las transiciones de estado de órdenes deben ser atómicas en BD, pero disparan efectos secundarios (notificaciones FCM, alertas WebSocket, verificación de geocerca) que pueden fallar.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Llamada directa dentro de transacción | Simple | Si FCM falla → transacción hace rollback → inconsistencia |
| Llamada directa fuera de transacción | Más simple | Si el proceso muere → efecto secundario perdido |
| BullMQ (Redis-backed queue) | Persistente, reintentos, monitoreable | Redis requerido (ya lo tenemos) |
| Outbox pattern | Muy robusto | Complejidad alta para MVP |

**Decisión:** BullMQ. Los efectos secundarios siempre se encolan DESPUÉS de que la transacción hace commit. Si el job falla → BullMQ reintenta automáticamente.

**Consecuencias:**
- Redis es requerido para BullMQ (ya lo usamos para JWT y OTP)
- Bull Board en puerto 3001 para monitoreo
- Regla en `steering/coding-standards.md`: nunca efectos secundarios dentro de `db.transaction()`

---

## ADR-004: Tipos de custodia extensibles vía JSONB schema

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
El sistema necesita soportar múltiples tipos de custodia (efectivo, paquetería, documentos, escolta) con campos específicos por tipo, y agregar nuevos tipos sin cambios de código.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Tabla por tipo (STI) | Type-safe | Migración por tipo nuevo, acoplamiento fuerte |
| Herencia de tablas (CTI) | Normalizado | Complejidad de queries, migraciones por tipo |
| JSONB con JSON Schema | Extensible sin código | Validación en runtime, no compile-time |
| EAV (Entity-Attribute-Value) | Muy flexible | Queries complejas, sin tipos |

**Decisión:** JSONB con JSON Schema. La tabla `custody_types` tiene columna `value_declaration_schema` (JSON Schema draft-07). Cada `value_declaration` se valida contra ese schema en el service layer.

**Consecuencias:**
- Agregar nuevo tipo = INSERT en `custody_types`, cero código
- Validación en runtime en el service layer (no en BD)
- El schema JSON debe mantenerse actualizado en `custody_types`

---

## ADR-005: Aprobación de supervisor obligatoria para toda orden

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente — no configurable

**Contexto:**
El transporte de valores en México tiene requisitos regulatorios. Se planteó si la aprobación podría ser opcional para clientes de confianza.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Aprobación siempre obligatoria | Cumplimiento regulatorio garantizado | Fricción en el flujo |
| Aprobación configurable por cliente | Flexibilidad | Riesgo regulatorio, complejidad |
| Sin aprobación (directo a ASSIGNED) | Flujo más rápido | Incumplimiento normativo |

**Decisión:** Aprobación SIEMPRE obligatoria. No hay flag `skip_approval`. Esta decisión es de cumplimiento regulatorio, no de UX.

**Consecuencias:**
- Toda orden pasa por `PENDING_APPROVAL` — sin excepciones
- La aprobación automática (bots) no está descartada para el futuro, pero sería un supervisor automatizado — no eliminar la transición
- Agregar `PENDING_APPROVAL` como estado obligatorio en la CustodyStateMachine

---

## ADR-006: Regla dos-personas — custodio + copiloto siempre

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
Estándares de seguridad para transporte de valores establecen que ninguna persona puede operar sola. Se discutió si el copiloto debería ser opcional para custodias de bajo valor.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Dos personas siempre obligatorio | Seguridad uniforme | Mayor costo operativo |
| Copiloto opcional por tipo de custodia | Flexible | Complejidad, riesgo de seguridad |
| Copiloto opcional por valor declarado | Adaptativo | Complejidad, riesgo |

**Decisión:** Dos personas siempre. `ASSIGNED` requiere `custodio_id` Y `copiloto_id`. `CREW_CONFIRMED` requiere confirmación de ambos.

**Consecuencias:**
- La asignación siempre incluye dos operadores
- El endpoint `PATCH /orders/:id/assign` valida ambos IDs obligatorios
- `CREW_CONFIRMED` necesita tracking de quién confirmó (dos registros en `order_transitions`)

---

## ADR-007: Snapshots inmutables (custody_snapshot + pricing_snapshot)

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
Una vez que se inicia el transporte, los datos de la orden (equipo asignado, valor declarado, precio) deben quedar congelados como evidencia.

**Decisión:**
- `pricing_snapshot`: se genera al entrar a `APPROVED`. Congela precio acordado.
- `custody_snapshot`: se genera al entrar a `IN_TRANSIT`. Congela equipo, cargo, vehículo.

Ambos son columnas JSONB en `custody_orders`. Una vez escritos, nunca se reescriben.

**Consecuencias:**
- Evidencia legal inmutable del estado acordado
- Si hay error en el snapshot → insertar nueva orden, no corregir el snapshot
- En el código: verificar que la columna sea null antes de escribir; si ya tiene valor → error

---

## ADR-008: Soft delete universal

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
El historial de órdenes, operadores y clientes debe mantenerse para auditorías. Eliminar registros crearía huecos en la cadena de custodia.

**Decisión:** Toda tabla tiene columna `deleted_at TIMESTAMPTZ`. Toda operación de "eliminar" es `UPDATE SET deleted_at = NOW()`. Toda query filtra `WHERE deleted_at IS NULL`.

**Consecuencias:**
- Nunca `DELETE FROM` en ninguna tabla de negocio
- Las migraciones de datos de prueba pueden usar DELETE (solo en seeds de test)
- Monitorear tamaño de tablas — considerar particionamiento si crecen mucho

---

## ADR-009: JWT RS256 con refresh token en Redis

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
Necesitamos autenticación stateless para el API (para escalar horizontalmente) pero con capacidad de invalidar sesiones (logout, suspensión de operadores).

**Decisión:**
- Access token: JWT RS256, expira en 15 minutos. Stateless — no se almacena.
- Refresh token: token opaco, almacenado en Redis con TTL de 30 días. Se invalida en logout.
- Al suspender un operador: eliminar sus refresh tokens de Redis. Sus access tokens expiran solos en 15 min.

**Consecuencias:**
- Redis es necesario para refresh tokens (ya lo usamos para BullMQ y OTP)
- 15 minutos de ventana máxima para usar un token inválido (access token de operador suspendido)
- Para invalidación inmediata de access tokens: se necesitaría una blocklist en Redis (no en MVP)

---

## ADR-010: Mobile app: un solo binario, dos flujos por role

**Fecha:** 2026-05-13
**Estado:** ✅ Vigente

**Contexto:**
El sistema tiene dos tipos de usuarios mobile: clientes y operadores (custodio/copiloto). Se discutió si hacer dos apps separadas.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Una app, dos flujos | Un solo mantenimiento, una distribución | Mayor tamaño de bundle |
| Dos apps separadas | Bundle más pequeño por rol | Doble mantenimiento, doble distribución |
| Web app para clientes | Sin app que instalar para cliente | UX inferior, sin push nativo |

**Decisión:** Una sola app React Native. Al hacer login, el `role` del JWT determina el navigator que se carga (`ClientNavigator` o `OperatorNavigator`). Código compartido en `services/` y `stores/`.

**Consecuencias:**
- Un solo release en App Store / Play Store
- El `RootNavigator` hace switch por role
- Los screens del cliente no se cargan en el bundle del operador y viceversa (React Navigation lazy)

---

## ADR-014: custody-tracking como módulo separado de tracking UBER_BASE

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
Al implementar el GPS tracking para custodia de valores, ya existía un módulo `tracking/` del UBER_BASE que usa tabla `trip_locations` con schema diferente (`trip_id, driver_id, recorded_at`). El dominio custodia usa `location_readings` (`order_id, operator_id, time` TimescaleDB). Los services están en uso activo por `DriversService` y `TripsService`.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Extender TrackingService existente | Un solo servicio | Acopla dominios, rompe UBER_BASE, violación de monolito modular |
| Módulo `custody-tracking/` separado | Módulos autocontenidos, sin riesgo | Dos servicios de tracking en el codebase |
| Refactorizar TrackingService a interfaz común | Reutilizable | Sobre-ingeniería para MVP |

**Decisión:** Módulo `custody-tracking/` completamente separado. El `TrackingService` UBER_BASE sigue intacto. El `CustodyTrackingService` es el canónico para el dominio custodia.

**Consecuencias:**
- Dos services de tracking en el proyecto — es intencional y documentado
- La disciplina de módulos autocontenidos se mantiene (ADR-001)
- Cuando UBER_BASE se deprece, `tracking/` se elimina sin tocar `custody-tracking/`

---

## ADR-015: Socket.io namespace injection via setIo() post-construcción

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
El `CustodyTrackingService` necesita hacer broadcast via Socket.io (`io.to(room).emit()`). El order de inicialización en `app.ts` obliga a construir el service antes de que el plugin de Socket.io registre el namespace `/tracking`. Inyectar `io` en el constructor causaría dependencia circular de orden.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| io en constructor | Explícito | Fuerza orden de inicialización — frágil |
| setIo() post-construcción | Flexible, testeable | Riesgo de olvidar la inyección |
| io como parámetro en cada método | Stateless | Verbose, repetitivo |
| Pub/sub via Redis (no socket directo) | Desacoplado | Latencia adicional para MVP |

**Decisión:** `setIo(io: Namespace): void` en el service. El routes plugin lo llama justo después de crear el namespace. El service verifica `this.io?.to(...)` — si io es null, el broadcast se omite silenciosamente y el endpoint HTTP funciona igualmente.

**Consecuencias:**
- Tests unitarios no necesitan Socket.io real
- El endpoint HTTP nunca falla por ausencia de WebSocket
- Patrón replicable para otros módulos que necesiten broadcast (alerts, compliance)

---

## ADR-016: AlertEngine como autoridad central para creación de alertas

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
En Sprint 5 el `geofence-check.worker.ts` insertaba directamente en `security_alerts` con un INSERT raw. Se necesitaba centralizar la lógica de severidad, deduplicación de pánico (30s), side effect `panic→INCIDENT` y futura integración con notifications.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| INSERT directo desde cada caller | Simple en el momento | Duplicación de lógica de severidad, dedup repartida en múltiples lugares |
| AlertEngine (clase de dominio) | Única fuente de verdad para creación de alertas | Acoplamiento del worker al service layer |
| Event bus interno | Desacoplado | Sobre-ingeniería para MVP |

**Decisión:** `AlertEngine` es la única vía válida para crear alertas. Cualquier módulo que necesite insertar en `security_alerts` (geofence worker, futuros timers, compliance) debe llamar `AlertEngine.createAlert()`. Nunca INSERT directo.

**Consecuencias:**
- El geofence worker de Sprint 5 se refactorizó en Sprint 6 para recibir `alertEngine` como parámetro
- La severidad de `geofence_violation` se corrigió de `high` a `medium` (SEVERITY_MAP canónico en AlertEngine)
- `registerGeofenceWorker(db, redis, alertEngine?)` — alertEngine es opcional para retrocompatibilidad de tests
- Toda cobertura del flujo de alertas reside en `alert-engine.test.ts` (100% lines/branches)

---

## ADR-017: CustodyNotificationService — FCM + SMS fallback + CircuitBreaker en Redis

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
Las alertas críticas (panic, tamper) y las transiciones de estado de órdenes de custodia requieren notificaciones push (FCM) con SMS como canal de respaldo. El módulo UBER_BASE `notifications/` ya existe pero solo tiene FCM sin SMS fallback ni circuit breaker. Era necesario un módulo custody-específico que agregue resiliencia.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Extender `modules/notifications/` UBER_BASE | Sin duplicación | Acopla dominios, rompe UBER_BASE, viola monolito modular (ADR-001) |
| Módulo `custody-notifications/` separado | Independiente, sin riesgo para UBER_BASE | Reutiliza `INotificationChannel` del UBER_BASE — dependencia mínima |
| Nueva interfaz FCM propia | Sin dependencia cruzada | Duplica código de FCM ya funcional en UBER_BASE |

**Decisión:** Módulo `custody-notifications/` separado (patrón ADR-014). Reutiliza `INotificationChannel` del UBER_BASE solo para la abstracción de FCM (no sus implementaciones). Agrega `ISmsClient + LogSmsClient` y `CircuitBreaker` en Redis (`cb:fcm:custody`).

**Consecuencias:**
- CircuitBreaker: 5 fallos FCM en 60s → open por 5 minutos, luego half-open con probe
- SMS siempre disponible como fallback — no sujeto al circuit breaker
- Para MVP: `LogFcmClient` (via LogNotificationChannel) y `LogSmsClient` (logs sin envío real)
- Al activar FCM real: intercambiar `LogNotificationChannel` por `FCMNotificationChannel` en `app.ts` — sin cambios de código en el servicio

---

## ADR-018: CustodyPaymentService — reutilización de IPaymentGateway UBER_BASE + BullMQ post-COMPLETED

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
Las órdenes de custodia completadas (estado COMPLETED) deben generar un cobro automático al cliente. El UBER_BASE ya tiene `IPaymentGateway + StripePaymentGateway` para viajes. Era necesario decidir si crear una nueva abstracción custody-específica o reutilizar la existente.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Nueva interfaz `ICustodyPaymentGateway` | Desacoplada del UBER_BASE | Duplicación de código Stripe sin ganancia real |
| Reutilizar `IPaymentGateway` del UBER_BASE | Sin duplicación, Stripe ya probado | Dependencia de infrastructura cruzada (aceptable para interfaces) |
| Pago manual vía endpoint | Más control del cliente | No automatiza el cobro al completar |

**Decisión:** Reutilizar `IPaymentGateway` del UBER_BASE (`modules/payments/payment.gateway.interface.ts`) en el servicio custody. El módulo `custody-payments/` sigue el patrón ADR-014 (separado del UBER_BASE), pero importa solo la interfaz de infraestructura — no lógica de dominio de viajes. El cobro se dispara vía BullMQ al transicionar a COMPLETED (fuera de transacción).

**Consecuencias:**
- `CustodyPaymentService` acepta `IPaymentGateway` como dependencia inyectada — intercambiable con `MockPaymentGateway` en tests
- El `custody-orders.controller.ts` encola `process-payment` en `custodyPaymentsQueue` después de `complete()` (non-fatal)
- Idempotencia: si `custody_payments.status = 'completed'` ya existe para la orden, el worker retorna sin re-cobrar
- Tabla `custody_payments` ya existía desde M-049 (Sprint 1 infra) — sin migración adicional
- Método de pago: `passenger_payment_methods` del usuario cliente (default o primero disponible)

---

## ADR-019: custody-scheduler — activación de recordatorios vía cron (node-cron + FOR UPDATE SKIP LOCKED)

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
Las órdenes de custodia con `scheduled_at` necesitan recordatorios automáticos (24h/1h/15m antes del pickup) y alertas a despachadores cuando la ventana de pickup abre sin equipo asignado. Era necesario decidir el mecanismo de scheduling.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Cron cada minuto + `FOR UPDATE SKIP LOCKED` | Mismo patrón que UBER_BASE, observable, sin deps nuevas | Mayor granularidad (1 min) vs. exactitud teórica |
| BullMQ delayed jobs | Exactitud en el tiempo del disparo | Edge cases al reiniciar workers, jobs "perdidos" tras crash |
| pg_cron (PostgreSQL nativo) | Sin proceso extra | Require extensión adicional, no en Railway por defecto |

**Decisión:** Cron con `node-cron` cada minuto + `custody_scheduled_reminders` table para deduplicación idempotente. El mismo patrón ya establecido en `SchedulerService` UBER_BASE (ADR-025). Deduplicación garantizada por UNIQUE constraint `(order_id, reminder_type)` y `FOR UPDATE SKIP LOCKED`.

**Consecuencias:**
- `CustodySchedulerService` corre dos tareas por tick: `scanUpcomingReminders` y `scanDispatchAlerts`
- Side effects (enqueue a `custodyNotificationsQueue`) ocurren FUERA de la transacción (ADR-003)
- La marca de "enviado" ocurre ANTES del enqueue (dedup-first) para preferir no-duplicar sobre no-perder
- Tabla `custody_scheduled_reminders` — M-053, UNIQUE en `(order_id, reminder_type)`
- Endpoints REST `PATCH /orders/:id/schedule` + `DELETE /orders/:id/schedule` permiten programar/desprogramar órdenes DRAFT

---

## ADR-020: compliance — reporte on-demand + SHA-256 + pdfkit

**Fecha:** 2026-05-14
**Estado:** ✅ Vigente

**Contexto:**
El módulo compliance necesita reportes de cadena de custodia auditables. Los datos ya existen en tablas implementadas (order_transitions, value_declarations, security_alerts). Había que decidir: (1) generación de PDF, (2) mecanismo de integridad, (3) almacenamiento vs on-demand.

**Opciones consideradas:**
| Aspecto | Opción | Pros | Contras |
|---|---|---|---|
| PDF | `pdfkit` | Pure JS, sin binarios nativos, compatible Railway/Render | Styling limitado |
| PDF | `puppeteer` | HTML completo, headless Chrome | 100MB+, incompatible con Railway free tier |
| PDF | `html-pdf` | Simple | Deprecated, usa PhantomJS |
| Integridad | `node:crypto` SHA-256 | Built-in Node.js, cero dependencias extras | — |
| Almacenamiento | On-demand (sin tabla) | Sin migración, simple, SHA-256 garantiza integridad | Ligera CPU por llamada |
| Almacenamiento | `compliance_reports` table | Cacheado, más rápido | Migración nueva, invalidación compleja |

**Decisión:** On-demand + `node:crypto` SHA-256 + `pdfkit`.

**Consecuencias:**
- Sin migración nueva — lee de `custody_orders`, `order_transitions`, `value_declarations`, `security_alerts`, `operators`, `users`, `custody_vehicles`, `custody_types`
- `declaredValue` y `signatureData` se redactan (`null`) para `role === 'client'`
- PDF disponible solo para dispatcher y supervisor
- SVG de firma en PDF descoped MVP — solo texto "Firma digital capturada"
- `renderToPdf()` separado de `buildPdf()` para testabilidad unitaria

---

## Plantilla para nuevas ADRs

```markdown
## ADR-XXX: {Título descriptivo}

**Fecha:** YYYY-MM-DD
**Estado:** 🔄 En discusión | ✅ Vigente | ⛔ Obsoleta | ↩️ Revertida

**Contexto:**
{Qué problema resuelve esta decisión. Por qué hubo que decidir algo.}

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Opción A | ... | ... |
| Opción B | ... | ... |

**Decisión:** {Qué se decidió y por qué.}

**Consecuencias:**
- {Implicaciones técnicas y de proceso}
- {Qué se gana y qué se pierde}
```
