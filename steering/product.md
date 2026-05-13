# Steering — Producto
> Resumen ejecutivo del producto para orientar decisiones de implementación.
> Actualizado: 2026-05-13

---

## Qué es SistemaCustodias

Plataforma de gestión y seguimiento de servicios de custodia de valores. Permite a empresas y personas solicitar transporte seguro de efectivo, paquetería de alto valor, documentos confidenciales o escolta de personas VIP — con seguimiento GPS en tiempo real, cadena de custodia digital y aprobación supervisada.

---

## Actores y sus motivaciones

| Actor | Motivación principal | Pain point actual |
|---|---|---|
| **Cliente** | Saber dónde está su cargo en todo momento | No hay visibilidad — llaman por teléfono |
| **Custodio** | Recibir instrucciones claras y reportar incidentes fácil | Coordinación por radio/teléfono, sin registro |
| **Copiloto** | Confirmar recepción y reportar alertas | No hay sistema — todo es verbal |
| **Despachador** | Asignar equipos eficientemente y ver todo en un mapa | Spreadsheets y llamadas telefónicas |
| **Supervisor** | Aprobar órdenes rápido y reaccionar a incidentes | Sin visibilidad hasta que algo sale mal |

---

## Propuesta de valor

1. **Transparencia** — El cliente ve en tiempo real dónde está su cargo
2. **Trazabilidad** — Cadena de custodia digital e inmutable, con firmas
3. **Seguridad** — Botón de pánico, alertas automáticas, geofencing
4. **Escalabilidad** — Nuevos tipos de custodia sin cambios de código (JSONB schema)
5. **Eficiencia** — Despacho automatizado, notificaciones, reducción de llamadas

---

## Tipos de custodia (MVP)

| Tipo | Requisitos especiales |
|---|---|
| `cash_transport` | Declaración de montos, denominaciones, aseguradora |
| `high_value_package` | Descripción detallada, valor estimado, seguro obligatorio |
| `confidential_docs` | Tipo de documento, entidad emisora, nivel de sensibilidad |
| `vip_escort` | Nombre de persona protegida, nivel de amenaza, restricciones de ruta |

---

## Flujo principal de una orden

```
Cliente o Despachador
  → Crea orden (DRAFT)
  → Llena declaración de valores
  → Envía a aprobación (PENDING_APPROVAL)

Supervisor
  → Revisa y aprueba (APPROVED) o rechaza (REJECTED)

Despachador
  → Asigna custodio + copiloto (ASSIGNED)

Custodio + Copiloto
  → Confirman vía app (CREW_CONFIRMED)
  → Salen hacia el pickup (EN_ROUTE_TO_PICKUP)
  → Llegan al pickup (AT_PICKUP)
  → Cliente firma → cargan cargo (IN_TRANSIT)
  → Llegan al destino (AT_DELIVERY)
  → Receptor firma → entregan cargo (DELIVERED)

Sistema
  → Cierra la orden y cobra (COMPLETED)
```

---

## Principios de UX

1. **Fluidez en campo** — Los custodios no tienen tiempo de leer pantallas largas. Botones grandes, acciones claras.
2. **Visibilidad siempre** — El cliente siempre sabe en qué estado está su orden.
3. **Pánico nunca oculto** — El botón de pánico es rojo y prominente. Nunca esconder.
4. **Firma simple** — La firma digital debe ser rápida — canvas con dedo en pantalla táctil.
5. **Offline-first** — Si el custodio pierde señal, las acciones se encolan y sincronizan.

---

## Decisiones de producto vigentes

- **Aprobación obligatoria** — No existe una orden que salte la aprobación del supervisor
- **Dos personas mínimo** — Toda orden requiere custodio + copiloto asignados y confirmados
- **Tipos extensibles** — Un cliente puede necesitar un nuevo tipo; se agrega como INSERT
- **Mobile primero** — La app mobile es el producto principal; el web es admin/operativo
