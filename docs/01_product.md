# Product — Plataforma Tipo UBER Multi-Vertical

## Visión

Plataforma de movilidad y servicios bajo demanda construida sobre una base técnica reutilizable, orientada a múltiples verticales de negocio. El diseño permite lanzar nuevos verticales sin reescribir el núcleo.

---

## Verticales

| Vertical | Estado | Descripción |
|---|---|---|
| Taxi | MVP activo | Servicio de transporte punto a punto |
| Delivery | Fase 4 | Entrega de paquetes y comida |
| Custodia | Fase 4 | Acompañamiento y seguridad personal |

---

## Actores del Sistema

| Actor | Descripción | App |
|---|---|---|
| Pasajero | Solicita y paga el servicio | Mobile (iOS/Android) |
| Conductor | Acepta y ejecuta el servicio | Mobile (iOS/Android) |
| Administrador | Opera y configura la plataforma | Web (Panel Admin) |

---

## Mercado Inicial

| Variable | Valor |
|---|---|
| País | México |
| Moneda | MXN |
| Idioma | Español |
| Impuesto | IVA 16% |
| Pagos MVP | Tarjeta vía Stripe |
| Expansión | LATAM (Colombia, Brasil) en Fase 4 |

---

## Tipos de Servicio (Taxi)

| Tipo | Descripción | Capacidad |
|---|---|---|
| Basic | Vehículo estándar | 4 personas |
| Plus | Vehículo confort | 4 personas |
| Premium | Vehículo ejecutivo | 4 personas |

Los tipos son configurables desde el panel admin. Cada tipo tiene tarifa base, costo por km y costo por minuto independientes.

---

## Ciclo de Vida del Viaje

```
REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE
→ DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
```

Estados de cancelación: `CANCELLED_BY_PASSENGER`, `CANCELLED_BY_DRIVER`, `CANCELLED_NO_DRIVER`, `NO_SHOW`

---

## Funcionalidades MVP

### Pasajero
- Registro y verificación por OTP (teléfono)
- Cotización de viaje antes de confirmar
- Solicitud de viaje inmediato o programado
- Seguimiento del conductor en tiempo real
- Pago con tarjeta guardada
- Historial de viajes
- Calificación del conductor

### Conductor
- Registro con documentos verificables
- Activación/desactivación de disponibilidad
- Recepción de solicitudes con tiempo límite de aceptación
- Navegación integrada
- Historial de viajes y ganancias
- Calificación del pasajero

### Administrador
- Dashboard en tiempo real (viajes, conductores, KPIs)
- Revisión y aprobación de documentos de conductores
- Gestión de incidentes y viajes problemáticos
- Configuración de tarifas y factores de precio
- Gestión de errores y pagos fallidos

---

## Modelo de Monetización

```
Tarifa del viaje
  − Comisión de plataforma   (configurable por tipo de viaje)
  = Ganancia neta del conductor
  + IVA 16%
  ═ Total cobrado al pasajero
```

La comisión es configurable desde el panel admin por región y tipo de viaje, sin necesidad de redeploy.

---

## Viajes Programados

El pasajero puede agendar un viaje con anticipación. El sistema notifica al conductor asignado en tres momentos:
- 24 horas antes
- 1 hora antes
- 15 minutos antes

Si el conductor no responde o se desconecta, el sistema reasigna automáticamente.

---

## Fases del Producto

### Fase 1 — MVP Taxi (3-4 meses)
Auth, ciclo completo de viaje, tracking en tiempo real, pago con tarjeta, panel admin básico.

### Fase 2 — Estabilización (1-2 meses)
Historial de rutas, viajes programados, sistema de rating, notificaciones push y SMS, métricas operacionales.

### Fase 3 — Inteligencia (al tener datos)
Matching inteligente por ML, precios dinámicos por demanda real, detección de anomalías, predicción de demanda por zona.

### Fase 4 — Nuevos Verticales
Delivery, custodia, expansión a Colombia y Brasil.

---

## Motor de Precios Dinámico

El precio se calcula en tiempo de ejecución evaluando factores configurables. No hay valores hardcoded.

### Categorías de factores
- **Climáticos:** lluvia, calor extremo, neblina
- **Temporales:** hora pico, nocturno, festivo
- **Demanda:** alta demanda por zona
- **Distancia:** viaje largo, mínimo por viaje corto
- **Servicios extra:** parada adicional, mascotas, equipaje

### Tipos de factor
| Tipo | Ejemplo |
|---|---|
| `multiplier` | Lluvia: ×1.20 |
| `fixed_amount` | Parada extra: +$15 |
| `percentage` | Hora pico: +10% |

---

## Onboarding del Conductor

### Estados del conductor
`pending` → `documents_submitted` → `under_review` → `approved`

Con posibilidad de `suspended` o `banned` en cualquier momento.

### Documentos requeridos (México)
Configurables dinámicamente desde el panel admin. Ejemplos:
- Licencia de conducir vigente
- INE / identificación oficial
- Tarjeta de circulación
- Póliza de seguro del vehículo
- Verificación de antecedentes

### Regla de documentos vencidos
Si un documento vence con un viaje activo en curso, el conductor termina el viaje y luego es suspendido automáticamente. No se interrumpe el viaje en curso.
