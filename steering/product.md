# Steering — Producto

> Resumen ejecutivo del producto para orientar decisiones de implementación.
> Fuente completa: docs/01_product.md

---

## Qué estamos construyendo

Plataforma de movilidad tipo UBER con base técnica reutilizable para múltiples verticales.
**Primer vertical:** Taxi en México.

## Actores

| Actor | App | Acciones principales |
|---|---|---|
| Pasajero | Mobile (iOS/Android) | Solicitar, seguir y pagar viajes |
| Conductor | Mobile (iOS/Android) | Aceptar viajes, navegar, cobrar |
| Administrador | Web (Next.js) | Operar, configurar, aprobar |

## Mercado actual

- País: México · Moneda: MXN · IVA: 16% · Idioma: Español
- Pagos MVP: Solo tarjeta vía Stripe
- Expansión Fase 4: Colombia, Brasil

## Tipos de servicio (Taxi)

| Tipo | Capacidad | Descripción |
|---|---|---|
| Basic | 4 personas | Vehículo estándar |
| Plus | 4 personas | Vehículo confort |
| Premium | 4 personas | Vehículo ejecutivo |

Configurables desde admin — cada tipo tiene tarifa base, costo/km y costo/min independientes.

## Ciclo de vida del viaje

```
REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE
→ DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
```

Cancelaciones: `CANCELLED_BY_PASSENGER` · `CANCELLED_BY_DRIVER` · `CANCELLED_NO_DRIVER` · `NO_SHOW`

## Fases del producto

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1** | MVP Taxi México (sprints 1-7) | **En desarrollo** |
| Fase 2 | Estabilización: historial, ratings, push, programados | Pendiente |
| Fase 3 | ML matching, precios dinámicos, detección anomalías | Pendiente |
| Fase 4 | Delivery, Custodia, LATAM | Pendiente |

## Motor de precios (Fase 1)

Los factores se aplican en orden fijo:
1. `fixed_amount` → suma al subtotal base
2. `percentage` → calcula sobre subtotal actualizado
3. `multiplier` → multiplica el resultado acumulado

El precio final nunca puede ser menor que `min_fare`.
El IVA se calcula sobre el subtotal (no sobre la tarifa base).

## Onboarding de conductores

```
pending → documents_submitted → under_review → approved
```
Con posibilidad de `suspended` o `banned` en cualquier momento.
La aprobación es **automática** cuando todos los documentos requeridos están aprobados.
Si un documento vence durante un viaje activo: el viaje termina normalmente, el conductor se suspende después.

## Monetización

```
Tarifa del viaje
  − Comisión de plataforma   (configurable por región y tipo)
  = Ganancia neta del conductor
  + IVA 16%
  ═ Total cobrado al pasajero
```
