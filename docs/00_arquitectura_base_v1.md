# Arquitectura Base — Plataforma Tipo UBER
**Documento de Referencia Técnica v1.0**

> Plataforma de movilidad y servicios bajo demanda construida sobre una base reutilizable, orientada a múltiples verticales de negocio: taxi, delivery y custodias. Primer vertical: **Taxi**. Mercado inicial: **México**.

---

## Índice

1. [Contexto y Decisiones de Negocio](#1-contexto-y-decisiones-de-negocio)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura General](#3-arquitectura-general)
4. [Schema de Base de Datos](#4-schema-de-base-de-datos)
5. [Motor de Precios Dinámico](#5-motor-de-precios-dinámico)
6. [Máquina de Estados del Viaje](#6-máquina-de-estados-del-viaje)
7. [Viajes Programados — Scheduler](#7-viajes-programados--scheduler)
8. [Tracking en Tiempo Real](#8-tracking-en-tiempo-real)
9. [API REST](#9-api-rest)
10. [Pagos](#10-pagos)
11. [Observabilidad](#11-observabilidad)
12. [Colas de Trabajo — BullMQ](#12-colas-de-trabajo--bullmq)
13. [Infraestructura y DevOps](#13-infraestructura-y-devops)
14. [Fases de Desarrollo](#14-fases-de-desarrollo)
15. [Decisiones Técnicas Registradas](#15-decisiones-técnicas-registradas)

---

## 1. Contexto y Decisiones de Negocio

| Variable | Decisión |
|---|---|
| Mercado inicial | México (LATAM en expansión) |
| Vertical inicial | Taxi |
| Moneda | MXN |
| Impuesto | IVA 16% (configurable vía `region_config`) |
| Método de pago MVP | Tarjeta — Stripe |
| Equipo | 5 personas: App, Web, API, DevOps, DB |
| Arquitectura | Monolito Modular → Microservicios al escalar |

---

## 2. Stack Tecnológico

### Backend

| Componente | Tecnología | Motivo |
|---|---|---|
| Runtime | Node.js + TypeScript | Stack MERN del equipo |
| Framework | Fastify | 3x más rápido que Express en concurrencia |
| Tiempo real | Socket.io | WebSockets con rooms y namespaces |
| Colas | BullMQ (sobre Redis) | Jobs con reintentos, prioridad y dashboard |
| Validación | Zod | Esquemas tipados en runtime |

### Bases de Datos

| Base de Datos | Rol | Qué almacena |
|---|---|---|
| PostgreSQL | Transaccional | Usuarios, viajes, pagos, conductores |
| Redis | Tiempo real / Cache | Posición GPS activa, estado del viaje, jobs BullMQ |
| TimescaleDB | Series de tiempo | Histórico GPS minute-by-minute |

### Frontend y Mobile

| Capa | Tecnología | Uso |
|---|---|---|
| Web Admin | Next.js + React + TypeScript | Panel de administración |
| Mobile | React Native + Google Maps SDK nativo | App pasajero y conductor |
| Persistencia local | MMKV / WatermelonDB | Tolerancia a desconexión en app conductor |

### Observabilidad

| Pilar | Herramienta |
|---|---|
| Logs | Pino (JSON estructurado) + PostgreSQL (auditoría) |
| Métricas | Prometheus + Grafana |
| Trazas | OpenTelemetry + Jaeger |

---

## 3. Arquitectura General

### Diagrama de Capas

```xml
<!-- draw.io: copiar el contenido entre las etiquetas mxGraphModel en https://app.diagrams.net -->
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>

    <!-- CLIENTES -->
    <mxCell id="2" value="CLIENTES" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontStyle=1;fontSize=13;fontColor=#1F3864;" vertex="1" parent="1"><mxGeometry x="400" y="20" width="370" height="30" as="geometry"/></mxCell>
    <mxCell id="3" value="App iOS / Android" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="400" y="60" width="160" height="50" as="geometry"/></mxCell>
    <mxCell id="4" value="Panel Web Admin" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="610" y="60" width="160" height="50" as="geometry"/></mxCell>

    <!-- API GATEWAY -->
    <mxCell id="5" value="API GATEWAY&#xa;Nginx / Fastify&#xa;Auth JWT · Rate Limit · Routing" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1F3864;strokeColor=#1F3864;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="170" width="250" height="60" as="geometry"/></mxCell>

    <!-- arrows clients → gateway -->
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="3" target="5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="4" target="5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- MONOLITO MODULAR -->
    <mxCell id="6" value="MONOLITO MODULAR" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;fontSize=13;" vertex="1" parent="1"><mxGeometry x="310" y="290" width="550" height="40" as="geometry"/></mxCell>

    <mxCell id="m1" value="Auth" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="320" y="345" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m2" value="Viajes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="425" y="345" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m3" value="Conductores" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="530" y="345" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m4" value="Pagos" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="635" y="345" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m5" value="Tracking" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="740" y="345" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m6" value="Pricing" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="320" y="400" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m7" value="Notificaciones" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="425" y="400" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m8" value="Scheduler" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="530" y="400" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m9" value="Admin" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="635" y="400" width="90" height="40" as="geometry"/></mxCell>
    <mxCell id="m10" value="RegionConfig" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="740" y="400" width="90" height="40" as="geometry"/></mxCell>

    <!-- gateway → monolito -->
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="5" target="6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- CAPA DE DATOS -->
    <mxCell id="d1" value="PostgreSQL&#xa;Transaccional" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="320" y="510" width="160" height="60" as="geometry"/></mxCell>
    <mxCell id="d2" value="Redis&#xa;Estado · Cache · BullMQ" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d6b656;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="510" y="510" width="160" height="60" as="geometry"/></mxCell>
    <mxCell id="d3" value="TimescaleDB&#xa;Histórico GPS" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="700" y="510" width="160" height="60" as="geometry"/></mxCell>

    <!-- monolito → dbs -->
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="6" target="d1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="6" target="d2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="6" target="d3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- EXTERNOS -->
    <mxCell id="x1" value="Stripe" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="100" y="290" width="100" height="50" as="geometry"/></mxCell>
    <mxCell id="x2" value="Google Maps" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="100" y="360" width="100" height="50" as="geometry"/></mxCell>
    <mxCell id="x3" value="FCM / APNs&#xa;Twilio" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="100" y="430" width="100" height="50" as="geometry"/></mxCell>
    <mxCell id="e7" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="x1" target="6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e8" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="x2" target="6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e9" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="x3" target="6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- legend -->
    <mxCell id="l1" value="Servicios externos" style="rounded=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=0;fontSize=10;" vertex="1" parent="1"><mxGeometry x="100" y="510" width="130" height="25" as="geometry"/></mxCell>
    <mxCell id="l2" value="Módulos internos" style="rounded=1;fillColor=#EBF3FB;strokeColor=#2E75B6;fontStyle=0;fontSize=10;" vertex="1" parent="1"><mxGeometry x="100" y="543" width="130" height="25" as="geometry"/></mxCell>
  </root>
</mxGraphModel>
```

---

## 4. Schema de Base de Datos

### Mapa de Entidades

```xml
<!-- draw.io: diagrama entidad-relación -->
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>

    <!-- region_config -->
    <mxCell id="rc" value="region_config&#xa;─────────────&#xa;id PK&#xa;country_code&#xa;currency&#xa;tax_rate&#xa;timezone&#xa;phone_prefix" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1F3864;strokeColor=#1F3864;fontColor=#ffffff;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="40" y="300" width="160" height="140" as="geometry"/></mxCell>

    <!-- users -->
    <mxCell id="us" value="users&#xa;─────────────&#xa;id PK&#xa;region_id FK&#xa;phone UNIQUE&#xa;full_name&#xa;status&#xa;deleted_at" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="280" y="200" width="150" height="140" as="geometry"/></mxCell>

    <!-- user_roles -->
    <mxCell id="ur" value="user_roles&#xa;─────────────&#xa;id PK&#xa;user_id FK&#xa;role&#xa;active" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="280" y="60" width="150" height="100" as="geometry"/></mxCell>

    <!-- user_auth -->
    <mxCell id="ua" value="user_auth&#xa;─────────────&#xa;id PK&#xa;user_id FK&#xa;password_hash&#xa;provider&#xa;refresh_token" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="480" y="60" width="150" height="110" as="geometry"/></mxCell>

    <!-- drivers -->
    <mxCell id="dr" value="drivers&#xa;─────────────&#xa;id PK&#xa;user_id FK&#xa;license_number&#xa;status&#xa;rating&#xa;online" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="480" y="200" width="150" height="130" as="geometry"/></mxCell>

    <!-- vehicles -->
    <mxCell id="ve" value="vehicles&#xa;─────────────&#xa;id PK&#xa;driver_id FK&#xa;brand · model&#xa;year · plate&#xa;status · active" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="680" y="120" width="150" height="120" as="geometry"/></mxCell>

    <!-- driver_documents -->
    <mxCell id="dd" value="driver_documents&#xa;─────────────&#xa;id PK&#xa;driver_id FK&#xa;requirement_id FK&#xa;status&#xa;expires_at" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="680" y="260" width="160" height="120" as="geometry"/></mxCell>

    <!-- document_requirements -->
    <mxCell id="dreq" value="document_requirements&#xa;─────────────&#xa;id PK&#xa;region_id FK&#xa;code UNIQUE&#xa;applies_to&#xa;required&#xa;has_expiry" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="880" y="260" width="170" height="130" as="geometry"/></mxCell>

    <!-- trip_types -->
    <mxCell id="tt" value="trip_types&#xa;─────────────&#xa;id PK&#xa;region_id FK&#xa;name&#xa;base_fare&#xa;cost_per_km&#xa;cost_per_minute&#xa;min_fare" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="280" y="420" width="160" height="150" as="geometry"/></mxCell>

    <!-- pricing_factors -->
    <mxCell id="pf" value="pricing_factors&#xa;─────────────&#xa;id PK&#xa;region_id FK&#xa;code UNIQUE&#xa;factor_type&#xa;value&#xa;stackable" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="40" y="520" width="160" height="130" as="geometry"/></mxCell>

    <!-- commission_rules -->
    <mxCell id="cr" value="commission_rules&#xa;─────────────&#xa;id PK&#xa;region_id FK&#xa;trip_type_id FK&#xa;percentage&#xa;min · max&#xa;valid_from" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="40" y="160" width="160" height="120" as="geometry"/></mxCell>

    <!-- trips -->
    <mxCell id="tr" value="trips  ★ ENTIDAD CENTRAL&#xa;─────────────────────&#xa;id PK&#xa;region_id · trip_type_id FK&#xa;passenger_id · driver_id FK&#xa;status&#xa;origin_lat · origin_lng&#xa;dest_lat · dest_lng&#xa;estimated_fare · actual_fare&#xa;pricing_snapshot JSONB&#xa;scheduled_at&#xa;started_at · completed_at" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="480" y="420" width="220" height="200" as="geometry"/></mxCell>

    <!-- trip_status_history -->
    <mxCell id="tsh" value="trip_status_history&#xa;─────────────&#xa;id PK&#xa;trip_id FK&#xa;from_status&#xa;to_status&#xa;actor_type · actor_id&#xa;reason" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="740" y="420" width="170" height="130" as="geometry"/></mxCell>

    <!-- trip_locations -->
    <mxCell id="tl" value="trip_locations&#xa;[TimescaleDB]&#xa;─────────────&#xa;time PK&#xa;trip_id · driver_id&#xa;lat · lng&#xa;speed · heading&#xa;accuracy" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="740" y="580" width="160" height="140" as="geometry"/></mxCell>

    <!-- scheduled_trips -->
    <mxCell id="st" value="scheduled_trips&#xa;─────────────&#xa;id PK&#xa;trip_id FK&#xa;scheduled_at&#xa;status&#xa;first_notice_sent&#xa;reminder_sent&#xa;final_notice_sent" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="480" y="650" width="170" height="140" as="geometry"/></mxCell>

    <!-- payments -->
    <mxCell id="pay" value="payments&#xa;─────────────&#xa;id PK&#xa;trip_id FK&#xa;amount · tax&#xa;platform_fee&#xa;driver_earnings&#xa;provider_payment_id&#xa;status" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="280" y="650" width="170" height="140" as="geometry"/></mxCell>

    <!-- trip_applied_factors -->
    <mxCell id="taf" value="trip_applied_factors&#xa;─────────────&#xa;id PK&#xa;trip_id FK&#xa;factor_id FK&#xa;factor_value&#xa;impact_amount" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="40" y="680" width="170" height="110" as="geometry"/></mxCell>

    <!-- ratings -->
    <mxCell id="rat" value="ratings&#xa;─────────────&#xa;id PK&#xa;trip_id FK&#xa;from_user_id FK&#xa;to_user_id FK&#xa;score 1-5&#xa;comment" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;align=left;spacingLeft=8;" vertex="1" parent="1"><mxGeometry x="940" y="420" width="150" height="130" as="geometry"/></mxCell>

    <!-- EDGES -->
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="rc" target="us" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="rc" target="tt" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="rc" target="pf" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="rc" target="cr" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="rc" target="dreq" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="us" target="ur" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e7" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="us" target="ua" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e8" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="us" target="dr" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e9" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="dr" target="ve" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e10" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="dr" target="dd" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e11" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="dreq" target="dd" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e12" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tt" target="tr" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e13" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="tsh" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e14" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="tl" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e15" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="st" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e16" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="pay" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e17" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="taf" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e18" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="tr" target="rat" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e19" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="pf" target="taf" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root>
</mxGraphModel>
```

### Convenciones del Schema

| Convención | Detalle |
|---|---|
| Primary Key | UUID en todas las tablas |
| Timestamps | `TIMESTAMPTZ` siempre con zona horaria |
| Soft delete | `deleted_at TIMESTAMPTZ NULL` — nunca se borran datos de negocio |
| `updated_at` | Trigger automático en PostgreSQL |
| `pricing_snapshot` | `JSONB` inmutable en `trips` — auditoría histórica de tarifas |

### SQL — Tablas Principales

```sql
-- Configuración regional
CREATE TABLE region_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    CHAR(2)         NOT NULL,
  currency        CHAR(3)         NOT NULL,
  tax_rate        DECIMAL(5,4)    NOT NULL,
  timezone        VARCHAR(50)     NOT NULL,
  phone_prefix    VARCHAR(5)      NOT NULL,
  active          BOOLEAN         NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Usuarios base
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       UUID            NOT NULL REFERENCES region_config(id),
  phone           VARCHAR(20)     NOT NULL UNIQUE,
  phone_verified  BOOLEAN         NOT NULL DEFAULT false,
  full_name       VARCHAR(255)    NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ     NULL
);

-- Viajes — entidad central
CREATE TABLE trips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id           UUID            NOT NULL REFERENCES region_config(id),
  trip_type_id        UUID            NOT NULL REFERENCES trip_types(id),
  passenger_id        UUID            NOT NULL REFERENCES users(id),
  driver_id           UUID            REFERENCES drivers(id),
  status              VARCHAR(30)     NOT NULL DEFAULT 'requested',
  origin_lat          DECIMAL(10,7)   NOT NULL,
  origin_lng          DECIMAL(10,7)   NOT NULL,
  dest_lat            DECIMAL(10,7)   NOT NULL,
  dest_lng            DECIMAL(10,7)   NOT NULL,
  estimated_fare      DECIMAL(10,2),
  actual_fare         DECIMAL(10,2),
  pricing_snapshot    JSONB,          -- inmutable al completarse
  scheduled_at        TIMESTAMPTZ     NULL,
  accepted_at         TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_passenger  ON trips(passenger_id);
CREATE INDEX idx_trips_driver     ON trips(driver_id);
CREATE INDEX idx_trips_status     ON trips(status);
CREATE INDEX idx_trips_scheduled  ON trips(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- Tracking GPS (TimescaleDB hypertable)
CREATE TABLE trip_locations (
  time        TIMESTAMPTZ   NOT NULL,
  trip_id     UUID          NOT NULL,
  driver_id   UUID          NOT NULL,
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  speed       DECIMAL(6,2),
  heading     DECIMAL(5,2),
  accuracy    DECIMAL(6,2)
);
SELECT create_hypertable('trip_locations', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_trip_locations ON trip_locations(trip_id, time DESC);

-- Historial de estados — auditoría completa
CREATE TABLE trip_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES trips(id),
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL,
  actor_type  VARCHAR(20) NOT NULL,
  actor_id    UUID,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger automático updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```

---

## 5. Motor de Precios Dinámico

### Tipos de Factor

| Tipo | Descripción | Ejemplo |
|---|---|---|
| `multiplier` | Multiplica la tarifa | Lluvia: ×1.20 |
| `fixed_amount` | Suma un monto fijo | Parada extra: +$15 |
| `percentage` | Porcentaje adicional | Hora pico: +10% |

### Factores Configurables

| Categoría | Factores |
|---|---|
| Climáticos | Lluvia, calor extremo, neblina, granizo |
| Temporales | Hora pico, nocturno, festivo, fin de semana |
| Demanda | Alta demanda por zona, eventos especiales |
| Distancia | Viaje largo, mínimo por viaje corto |
| Servicios extra | Parada adicional, mascotas, equipaje |

### Ejemplo de Cálculo

```
Tarifa base:               $45.00
+ Horario nocturno ×1.30:  $58.50
+ Lluvia          ×1.20:   $70.20
+ Parada extra    +$15:    $85.20
+ IVA 16%         +$13.63: $98.83
                           ───────
Total al pasajero:         $98.83
Comisión plataforma 20%:   $17.04  ← ejemplo ilustrativo (configurable en commission_rules)
Ganancia neta conductor:   $67.16
```

### SQL — Pricing

```sql
CREATE TABLE pricing_factors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id     UUID          NOT NULL REFERENCES region_config(id),
  code          VARCHAR(50)   NOT NULL UNIQUE,
  factor_type   VARCHAR(20)   NOT NULL, -- multiplier | fixed_amount | percentage
  value         DECIMAL(8,4)  NOT NULL,
  stackable     BOOLEAN       NOT NULL DEFAULT true,
  priority      SMALLINT      NOT NULL DEFAULT 0,
  active        BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE pricing_factor_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_id   UUID    NOT NULL REFERENCES pricing_factors(id),
  rule_type   VARCHAR(30) NOT NULL, -- time_range | demand_threshold | weather_condition
  conditions  JSONB   NOT NULL,     -- {"from":"22:00","to":"06:00"} | {"min_km":30}
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trip_applied_factors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID          NOT NULL REFERENCES trips(id),
  factor_id     UUID          NOT NULL REFERENCES pricing_factors(id),
  factor_value  DECIMAL(8,4)  NOT NULL,
  impact_amount DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

---

## 6. Máquina de Estados del Viaje

### Diagrama de Estados

```xml
<!-- draw.io: máquina de estados del viaje -->
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>

    <!-- estados del flujo principal -->
    <mxCell id="s1" value="REQUESTED" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1F3864;strokeColor=#1F3864;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="40" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s2" value="SEARCHING" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="140" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s3" value="ACCEPTED" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="240" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s4" value="DRIVER_EN_ROUTE" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="340" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s5" value="DRIVER_ARRIVED" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="440" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s6" value="IN_PROGRESS" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="540" width="150" height="50" as="geometry"/></mxCell>
    <mxCell id="s7" value="COMPLETED" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="640" width="150" height="50" as="geometry"/></mxCell>

    <!-- estados terminales de cancelación -->
    <mxCell id="c1" value="CANCELLED_BY&#xa;PASSENGER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="700" y="240" width="140" height="50" as="geometry"/></mxCell>
    <mxCell id="c2" value="CANCELLED_BY&#xa;DRIVER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="700" y="340" width="140" height="50" as="geometry"/></mxCell>
    <mxCell id="c3" value="CANCELLED_NO&#xa;DRIVER" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="700" y="140" width="140" height="50" as="geometry"/></mxCell>
    <mxCell id="c4" value="NO_SHOW" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="700" y="440" width="140" height="50" as="geometry"/></mxCell>

    <!-- flujo principal -->
    <mxCell id="e1" value="Sistema: pago válido" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s1" target="s2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" value="Conductor acepta" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s2" target="s3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e3" value="Conductor en camino" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s3" target="s4" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e4" value="GPS en origen" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s4" target="s5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e5" value="Pasajero abordó" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s5" target="s6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e6" value="GPS en destino" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="s6" target="s7" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- cancelaciones -->
    <mxCell id="e7" value="Timeout 8min" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;strokeColor=#b85450;" edge="1" source="s2" target="c3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e8" value="Pasajero cancela" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;strokeColor=#b85450;" edge="1" source="s3" target="c1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e9" value="Conductor cancela" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;strokeColor=#b85450;" edge="1" source="s4" target="c2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e10" value="Timeout espera 5min" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;strokeColor=#b85450;" edge="1" source="s5" target="c4" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <!-- leyenda -->
    <mxCell id="l1" value="Flujo normal" style="rounded=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;fontSize=10;" vertex="1" parent="1"><mxGeometry x="40" y="640" width="130" height="25" as="geometry"/></mxCell>
    <mxCell id="l2" value="Cancelación / Error" style="rounded=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=10;" vertex="1" parent="1"><mxGeometry x="40" y="673" width="130" height="25" as="geometry"/></mxCell>
    <mxCell id="l3" value="Estado final exitoso" style="rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;" vertex="1" parent="1"><mxGeometry x="40" y="706" width="130" height="25" as="geometry"/></mxCell>
  </root>
</mxGraphModel>
```

### Reglas por Transición

| Transición | Actor | Condición | Efecto |
|---|---|---|---|
| REQUESTED → SEARCHING | Sistema | Pago válido, sin viaje activo | Inicia búsqueda |
| SEARCHING → ACCEPTED | Conductor | Online, sin viaje, en radio | Asigna conductor |
| SEARCHING → CANCELLED_NO_DRIVER | Sistema | Timeout 8 min | Notifica pasajero |
| DRIVER_ARRIVED → NO_SHOW | Sistema | Timeout 5 min | Cargo no-show |
| IN_PROGRESS → COMPLETED | Conductor | GPS en destino | Cobro + solicita rating |
| → CANCELLED_BY_DRIVER | Conductor | Cualquier estado activo | Penaliza, reintenta matching |

### Implementación TypeScript

```typescript
const VALID_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  requested:          ['searching', 'cancelled_by_passenger'],
  searching:          ['accepted', 'cancelled_no_driver'],
  accepted:           ['driver_en_route', 'cancelled_by_passenger', 'cancelled_by_driver'],
  driver_en_route:    ['driver_arrived', 'cancelled_by_passenger', 'cancelled_by_driver'],
  driver_arrived:     ['in_progress', 'cancelled_by_passenger', 'no_show'],
  in_progress:        ['completed'],
  completed:          [],
  cancelled_by_passenger: [],
  cancelled_by_driver:    [],
  cancelled_no_driver:    [],
  no_show:                [],
};

// Toda transición ocurre dentro de una transacción con FOR UPDATE
// Protección crítica contra race conditions (dos conductores aceptando el mismo viaje)
const trip = await trx('trips').where({ id: tripId }).forUpdate().first();

// Los efectos secundarios se encolan en BullMQ DENTRO de la transacción
// pero se ejecutan FUERA de ella — la BD no espera a Stripe
await paymentQueue.add('payment.charge', { tripId });
```

---

## 7. Viajes Programados — Scheduler

### Diagrama del Scheduler

```xml
<!-- draw.io: arquitectura del scheduler -->
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>

    <mxCell id="pg" value="PostgreSQL&#xa;scheduled_trips&#xa;─────────────────&#xa;Fuente de verdad&#xa;first_notice_sent&#xa;reminder_sent&#xa;final_notice_sent" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="40" y="200" width="180" height="130" as="geometry"/></mxCell>

    <mxCell id="cron" value="Cron Job&#xa;cada 1 minuto&#xa;─────────────────&#xa;SELECT scheduled_trips&#xa;WHERE *_sent = false&#xa;AND *_at &lt;= now()" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1F3864;strokeColor=#1F3864;fontColor=#ffffff;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="280" y="200" width="200" height="130" as="geometry"/></mxCell>

    <mxCell id="bull" value="BullMQ&#xa;─────────────────&#xa;first_notice&#xa;reminder&#xa;final_notice" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d6b656;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="550" y="200" width="160" height="130" as="geometry"/></mxCell>

    <mxCell id="n1" value="Push Notification&#xa;al conductor&#xa;24h antes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="780" y="100" width="160" height="70" as="geometry"/></mxCell>
    <mxCell id="n2" value="Recordatorio +&#xa;verificar conductor&#xa;1h antes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="780" y="200" width="160" height="70" as="geometry"/></mxCell>
    <mxCell id="n3" value="Aviso final +&#xa;activar búsqueda&#xa;15min antes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;" vertex="1" parent="1"><mxGeometry x="780" y="300" width="160" height="70" as="geometry"/></mxCell>

    <mxCell id="reassign" value="Reasignar conductor&#xa;automáticamente" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="780" y="400" width="160" height="60" as="geometry"/></mxCell>

    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="pg" target="cron" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" value="encola job&#xa;marca sent=true" style="edgeStyle=orthogonalEdgeStyle;fontSize=10;" edge="1" source="cron" target="bull" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="bull" target="n1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="bull" target="n2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="bull" target="n3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e6" value="conductor inactivo" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#b85450;fontSize=10;" edge="1" source="n2" target="reassign" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>

    <mxCell id="note" value="Ventaja clave: si el cron falla, al recuperarse&#xa;encuentra los registros con sent=false y los procesa.&#xa;No se pierden eventos." style="text;html=1;strokeColor=#666666;fillColor=#f5f5f5;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=1;fontColor=#333333;" vertex="1" parent="1"><mxGeometry x="40" y="380" width="380" height="60" as="geometry"/></mxCell>
  </root>
</mxGraphModel>
```

---

## 8. Tracking en Tiempo Real

### Flujo de Datos GPS

```
App Conductor (cada 3-5 seg)
  → PATCH /drivers/me/location
  → Escribe en Redis  (< 50ms — no toca PostgreSQL)
  → Socket.io emite posición al pasajero
  → Cada 30 seg: batch flush a TimescaleDB
```

### Tolerancia a Pérdida de Conexión

```
App conductor pierde señal
  → Guarda puntos localmente (MMKV) con timestamp original
  → Al recuperar conexión → sync batch al backend
  → Backend reconstruye la ruta completa con timestamps fieles
  → Flush a TimescaleDB con datos completos
```

### Estado en Redis

```typescript
interface TripRedisState {
  tripId:     string;
  status:     TripStatus;
  driverId:   string;

  driverLocation: {
    lat:       number;
    lng:       number;
    heading:   number;
    speed:     number;
    updatedAt: number;
  };

  eta: {
    seconds:   number;
    updatedAt: number;
  };

  timers: {
    searchTimeout?: number;  // timestamp de expiración
    waitTimeout?:   number;  // timer de espera en origen
  };
}

const KEYS = {
  tripState:      (id: string) => `trip:${id}:state`,
  driverLocation: (id: string) => `driver:${id}:location`,
  driverTrip:     (id: string) => `driver:${id}:active_trip`,
  passengerTrip:  (id: string) => `passenger:${id}:active_trip`,
};
// Fuente de verdad: siempre PostgreSQL
// Redis es cache — si cae, el sistema sigue funcionando (más lento, correcto)
```

---

## 9. API REST

### Convenciones Globales

| Aspecto | Decisión |
|---|---|
| Versionado | `/api/v1/` — obligatorio |
| Auth | JWT access 15min + refresh 30 días con rotación |
| Respuesta | `{ success, data, meta?, error? }` |
| Validación | Zod en todos los endpoints |
| Rate limiting | Por endpoint — estricto en auth |
| Seguridad | Helmet.js en todas las respuestas |

### Endpoints por Módulo

```
Auth
  POST  /api/v1/auth/register
  POST  /api/v1/auth/login
  POST  /api/v1/auth/refresh
  POST  /api/v1/auth/verify-phone
  POST  /api/v1/auth/logout

Users
  GET   /api/v1/users/me
  PATCH /api/v1/users/me
  GET   /api/v1/users/me/payment-methods
  POST  /api/v1/users/me/payment-methods
  DELETE /api/v1/users/me/payment-methods/:id

Drivers
  GET   /api/v1/drivers/me
  PATCH /api/v1/drivers/me
  GET   /api/v1/drivers/me/documents
  POST  /api/v1/drivers/me/documents
  GET   /api/v1/drivers/me/vehicles
  POST  /api/v1/drivers/me/vehicles
  POST  /api/v1/drivers/me/go-online
  POST  /api/v1/drivers/me/go-offline
  PATCH /api/v1/drivers/me/location      ← cada 3-5 seg, solo escribe Redis
  GET   /api/v1/drivers/me/earnings

Trips
  POST  /api/v1/trips/estimate           ← cotización ANTES de crear el viaje
  POST  /api/v1/trips                    ← crear viaje
  GET   /api/v1/trips/:id
  DELETE /api/v1/trips/:id               ← pasajero cancela
  POST  /api/v1/trips/:id/accept
  POST  /api/v1/trips/:id/start-route
  POST  /api/v1/trips/:id/arrived
  POST  /api/v1/trips/:id/start-trip
  POST  /api/v1/trips/:id/complete
  POST  /api/v1/trips/:id/cancel         ← conductor cancela
  POST  /api/v1/trips/:id/rate
  GET   /api/v1/trips/:id/receipt

Admin
  GET   /api/v1/admin/users
  GET   /api/v1/admin/drivers
  PATCH /api/v1/admin/drivers/:id/documents/:docId/review
  GET   /api/v1/admin/trips
  GET   /api/v1/admin/dashboard/summary
  CRUD  /api/v1/admin/pricing-factors
  CRUD  /api/v1/admin/commission-rules
```

### WebSocket — Namespaces y Eventos

```typescript
// /passenger
socket.emit('trip.status_changed',     { trip_id, status, driver? })
socket.emit('driver.location_updated', { trip_id, lat, lng, heading, eta_seconds })
socket.emit('trip.driver_arrived',     { trip_id, wait_time })
socket.emit('trip.completed',          { trip_id, fare, breakdown, receipt_url })
socket.emit('trip.no_driver_found',    { trip_id })

// /driver
socket.emit('trip.request',            { trip_id, passenger, origin, destination,
                                         estimated_fare, expires_at })
socket.emit('trip.request_expired',    { trip_id })
socket.emit('trip.cancelled_by_passenger', { trip_id, reason })

// /admin
socket.emit('dashboard.update',        { active_trips, online_drivers })
socket.emit('alert.triggered',         { rule, severity, message, value })
```

---

## 10. Pagos

### Arquitectura en Capas

```
Tu PaymentService  (interfaz propia — único punto de acoplamiento)
        │
      Stripe (MVP)
        │
  Expansión futura:
        ├── Conekta  → OXXO, SPEI (México)
        └── MercadoPago → wallets LATAM
```

### Desglose de un Cobro

```
Tarifa del viaje
  − Comisión de plataforma   → configurable en commission_rules
  = Ganancia neta conductor
  + IVA 16%                  → configurable en region_config
  ═ Total cobrado al pasajero
```

### Colas de Pago

| Job | Cuándo | Acción |
|---|---|---|
| `payment.charge` | COMPLETED | Cobro a tarjeta vía Stripe |
| `payment.refund` | Cancelación con reembolso | Reembolso vía Stripe |
| `payment.cancellation_fee` | Cancelación tardía / no-show | Cargo parcial configurable |
| `receipt.generate` | Pago completado | PDF del recibo |

---

## 11. Observabilidad

### Logs Estructurados — Pino

```typescript
// Contexto mínimo en cada log
const log = createContextLogger({
  service:   'trip-state-machine',
  tripId,
  userId:    actor.id,
  requestId, // trazabilidad de la request completa
});

log.info({ event: 'trip.transition.completed', from_status, to_status, duration_ms });
log.error({ event: 'trip.transition.failed', error_code, error_msg });
```

### Métricas — Prometheus

| Métrica | Tipo | Descripción |
|---|---|---|
| `trips_created_total` | Counter | Por tipo y región |
| `trips_completed_total` | Counter | Viajes exitosos |
| `trips_cancelled_total` | Counter | Por actor y motivo |
| `trip_duration_seconds` | Histogram | Distribución de duraciones |
| `driver_matching_seconds` | Histogram | Tiempo hasta asignar conductor |
| `trips_active` | Gauge | Viajes activos ahora mismo |
| `drivers_online` | Gauge | Conductores conectados |
| `payment_queue_size` | Gauge | Jobs pendientes en cola de pagos |

### Alertas Configuradas

| Alerta | Condición | Severidad |
|---|---|---|
| Sin conductores | `drivers_online < 5` | Critical |
| Alta cancelación | `> 30%` en 5 min | Warning |
| Cola de pagos | `> 100` jobs pendientes | Critical |
| Matching lento | P95 `> 5` min | Warning |
| API lenta | P99 `> 2` seg | Warning |
| BD saturada | Conexiones `> 80%` | Warning |

### Tablas de Auditoría

```sql
-- Auditoría de negocio (quién hizo qué y cuándo)
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50)  NOT NULL,  -- trip | payment | driver
  entity_id   UUID         NOT NULL,
  action      VARCHAR(50)  NOT NULL,  -- created | status_changed | approved
  actor_type  VARCHAR(20)  NOT NULL,
  actor_id    UUID,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Errores críticos de sistema
CREATE TABLE system_error_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service       VARCHAR(50)  NOT NULL,
  error_code    VARCHAR(50)  NOT NULL,
  error_message TEXT         NOT NULL,
  stack_trace   TEXT,
  context       JSONB,
  trip_id       UUID REFERENCES trips(id),
  resolved      BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

---

## 12. Colas de Trabajo — BullMQ

| Cola | Jobs | Descripción |
|---|---|---|
| `trip.events` | completed, cancelled, no_driver | Orquestación del ciclo de vida |
| `notifications` | push.send, sms.send, email.send | Comunicaciones a usuarios |
| `payments` | charge, refund, cancellation_fee, receipt | Procesamiento de cobros |
| `tracking.sync` | route.flush | Batch GPS al recuperar conexión |
| `scheduler` | first_notice, reminder, final_notice | Alertas de viajes programados |
| `drivers` | release, penalize | Gestión post-cancelación |

> Todos los jobs tienen reintentos automáticos. Los errores persistentes van a Dead Letter Queue visible desde Bull Board en el panel admin.

---

## 13. Infraestructura y DevOps

> Infraestructura no es solo "dónde corre el código". Es el conjunto de decisiones que determina disponibilidad, seguridad, velocidad de despliegue y costo operacional.

### Ambientes

| Ambiente | Propósito |
|---|---|
| `development` | Máquina local del developer |
| `staging` | Espejo de producción — QA y pruebas de integración |
| `production` | Usuarios reales |

> **Regla:** nunca saltarse staging. Sin él, producción se convierte en el ambiente de pruebas con usuarios reales pagando las consecuencias.

---

### Docker — Containerización

#### Dockerfile del API

```dockerfile
# Etapa 1: build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Etapa 2: runtime — imagen mínima
FROM node:20-alpine AS runtime
WORKDIR /app

# Usuario no-root — seguridad básica
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

#### docker-compose — Desarrollo local

```yaml
version: '3.9'

services:

  api:
    build:
      context: .
      target: builder
    volumes:
      - ./src:/app/src       # hot reload
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://uber_user:uber_pass@postgres:5432/uber_dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: npm run dev

  postgres:
    image: timescale/timescaledb:latest-pg15
    # TimescaleDB incluye PostgreSQL — un solo contenedor
    environment:
      POSTGRES_DB:       uber_dev
      POSTGRES_USER:     uber_user
      POSTGRES_PASSWORD: uber_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/db/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U uber_user -d uber_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  bull-board:
    image: deadly0/bull-board
    ports:
      - "3001:3000"
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3002:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infra/grafana/dashboards:/etc/grafana/provisioning/dashboards
    depends_on:
      - prometheus

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

---

### Variables de Entorno

```
Regla crítica: nunca commitear secretos al repositorio.

.env.example     → commitear — plantilla sin valores reales
.env.local       → en .gitignore — valores locales del developer
.env.staging     → NO commitear — se inyecta en CI/CD
.env.production  → NO commitear — se inyecta en CI/CD
```

#### .env.example

```bash
# App
NODE_ENV=development
PORT=3000
APP_VERSION=1.0.0
SERVICE_NAME=api

# Base de datos
DATABASE_URL=postgresql://uber_user:uber_pass@localhost:5432/uber_dev
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=           # mínimo 64 caracteres aleatorios
JWT_REFRESH_SECRET=   # diferente al access secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Google Maps
GOOGLE_MAPS_API_KEY=

# Notificaciones
FCM_SERVER_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_FROM=

# Observabilidad
JAEGER_ENDPOINT=http://localhost:4318/v1/traces
LOG_LEVEL=debug

# Scheduler
SCHEDULER_CRON_INTERVAL=* * * * *
```

> En producción: variables inyectadas desde el dashboard de Railway/Render. Al migrar a AWS: AWS Secrets Manager con acceso por IAM roles — sin credenciales hardcoded.

---

### Migraciones de Base de Datos

> Regla crítica: nunca modificar el schema directamente en producción. Toda modificación pasa por una migración versionada.

#### Herramienta: Knex

```typescript
// migrations/20240101_002_create_users.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config');
    table.string('phone', 20).notNullable().unique();
    table.boolean('phone_verified').notNullable().defaultTo(false);
    table.string('full_name', 255).notNullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
```

#### Convenciones de migraciones

```
Nomenclatura:  YYYYMMDD_NNN_descripcion.ts
  20240101_001_create_region_config.ts
  20240101_002_create_users.ts
  20240115_003_add_driver_online_index.ts

Reglas:
  ✓ Cada migración es atómica — un solo cambio lógico
  ✓ El método down() siempre revierte el up()
  ✓ Nunca modificar una migración ya aplicada en producción
  ✓ Crear una nueva migración para corregir errores anteriores
  ✓ Probar el down() antes de hacer merge
  ✓ Snapshot de BD antes de cada migración en producción
```

---

### CI/CD — GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:

  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    services:
      postgres:
        image: timescale/timescaledb:latest-pg15
        env:
          POSTGRES_DB:       uber_test
          POSTGRES_USER:     uber_user
          POSTGRES_PASSWORD: uber_pass
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://uber_user:uber_pass@localhost:5432/uber_test
      REDIS_URL:    redis://localhost:6379
      NODE_ENV:     test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run db:migrate:test
      - run: npm run test:unit
      - run: npm run test:integration

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

```yaml
# .github/workflows/deploy.yml
name: Deploy

jobs:

  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - name: Deploy to staging
        run: curl -X POST "${{ secrets.STAGING_DEPLOY_HOOK }}"
      - name: Run migrations
        run: npm run db:migrate:staging
      - name: Smoke test
        run: npm run test:smoke -- --env staging

  deploy-production:
    if: github.ref == 'refs/heads/main'
    environment: production   # requiere aprobación manual en GitHub
    steps:
      - name: Deploy to production
        run: curl -X POST "${{ secrets.PROD_DEPLOY_HOOK }}"
      - name: Run migrations
        run: npm run db:migrate:production
      - name: Health check
        run: |
          sleep 30
          curl --fail https://api.tudominio.com/health
```

### Estrategia de Ramas

```
main      → producción — solo merge desde develop vía PR aprobado
develop   → staging — integración continua
feature/* → desarrollo individual

Flujo:
  1. feature/nombre desde develop
  2. PR hacia develop → CI automático
  3. Code review — mínimo 1 aprobación
  4. Merge → auto-deploy a staging
  5. QA valida en staging
  6. PR develop → main con aprobación manual
  7. Merge → deploy a producción
```

---

### Infraestructura en la Nube

#### MVP — Railway o Render

| | |
|---|---|
| ✓ | Deploy en minutos desde GitHub |
| ✓ | BD managed — PostgreSQL y Redis incluidos |
| ✓ | SSL automático y variables de entorno en dashboard |
| ✓ | Costo bajo para MVP |
| ✗ | Menos control sobre configuración de red |
| ✗ | No ideal para WebSockets de alta concurrencia a gran escala |

#### Escala — AWS (cuando superes 1,000 viajes/día consistentes)

| Componente | Railway/Render | AWS equivalente |
|---|---|---|
| API | Service | ECS Fargate |
| PostgreSQL | Managed DB | RDS Multi-AZ |
| Redis | Managed Redis | ElastiCache cluster |
| Secretos | Dashboard vars | AWS Secrets Manager |
| Imágenes Docker | Built-in | ECR |
| Observabilidad | Logs básicos | CloudWatch + Datadog |

> OpenTelemetry facilita la migración a Datadog sin cambiar el código de la aplicación.

#### Diagrama de Infraestructura MVP

```xml
<!-- draw.io: infraestructura MVP -->
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>

    <mxCell id="inet" value="Internet" style="shape=cloud;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="480" y="20" width="120" height="70" as="geometry"/></mxCell>
    <mxCell id="cf" value="Cloudflare CDN&#xa;DDoS · SSL · Edge Cache" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d6b656;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="430" y="140" width="220" height="55" as="geometry"/></mxCell>
    <mxCell id="rbox" value="Railway / Render" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#1F3864;strokeColor=#1F3864;fontColor=#ffffff;fontStyle=1;fontSize=13;" vertex="1" parent="1"><mxGeometry x="250" y="250" width="580" height="35" as="geometry"/></mxCell>
    <mxCell id="api" value="API Service&#xa;Node.js + Fastify&#xa;+ Socket.io" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="270" y="300" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="wk" value="Workers&#xa;BullMQ&#xa;(pagos, notifs)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="460" y="300" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="sc" value="Scheduler&#xa;Cron Jobs" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#2E75B6;strokeColor=#2E75B6;fontColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="650" y="300" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="pg" value="PostgreSQL&#xa;+ TimescaleDB&#xa;Managed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="270" y="440" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="rd" value="Redis&#xa;Managed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d6b656;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="460" y="440" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="obs" value="Prometheus&#xa;+ Grafana&#xa;+ Jaeger" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="650" y="440" width="150" height="80" as="geometry"/></mxCell>
    <mxCell id="stripe" value="Stripe" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="900" y="285" width="100" height="40" as="geometry"/></mxCell>
    <mxCell id="gmaps" value="Google Maps" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="900" y="335" width="100" height="40" as="geometry"/></mxCell>
    <mxCell id="fcm" value="FCM / Twilio" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="900" y="385" width="100" height="40" as="geometry"/></mxCell>
    <mxCell id="gh" value="GitHub&#xa;Actions CI/CD" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EBF3FB;strokeColor=#2E75B6;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="300" width="130" height="60" as="geometry"/></mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="inet" target="cf" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="cf" target="api" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="api" target="wk" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="api" target="pg" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="api" target="rd" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="wk" target="rd" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e7" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="sc" target="pg" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e8" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="api" target="obs" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e9" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="gh" target="rbox" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e10" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="wk" target="stripe" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e11" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="api" target="gmaps" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e12" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" source="wk" target="fcm" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root>
</mxGraphModel>
```

---

### Backups

Estrategia 3-2-1: 3 copias, 2 medios distintos, 1 copia offsite.

```bash
#!/bin/bash
# Backup diario — cron a las 2am
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="uber_backup_${DATE}.sql.gz"

pg_dump $DATABASE_URL | gzip > /tmp/${BACKUP_FILE}
aws s3 cp /tmp/${BACKUP_FILE} s3://uber-backups/postgres/${BACKUP_FILE}
```

#### Política de retención

| Tipo | Frecuencia | Retención |
|---|---|---|
| Backup completo | Diario | 30 días |
| Backup incremental | Cada 6 horas | 7 días |
| Point-in-time recovery | Continuo | 7 días (managed) |
| Snapshot pre-migración | Antes de cada deploy | 14 días |

---

### Health Checks

```typescript
// GET /health — público, para el orquestador
app.get('/health', async (req, reply) => {
  return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /health/detailed — privado, para monitoreo
app.get('/health/detailed', { onRequest: [authenticate] }, async (req, reply) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);

  const result = {
    status:  checks.every(c => c.status === 'fulfilled') ? 'ok' : 'degraded',
    checks: {
      database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
      redis:    checks[1].status === 'fulfilled' ? 'ok' : 'error',
      queues:   checks[2].status === 'fulfilled' ? 'ok' : 'error',
    },
    uptime:    process.uptime(),
    memory:    process.memoryUsage(),
    version:   process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  return reply.status(result.status === 'ok' ? 200 : 503).send(result);
});
```

---

### Seguridad de Infraestructura — Checklist MVP

```
Repositorio:
  ✓ .gitignore cubre todos los archivos .env
  ✓ Branch protection en main y develop
  ✓ Code review obligatorio para merge a main
  ✓ Dependabot activo — alertas de vulnerabilidades

Aplicación:
  ✓ Helmet.js — headers de seguridad HTTP
  ✓ Rate limiting por endpoint
  ✓ CORS configurado — solo orígenes permitidos
  ✓ Validación con Zod — sin SQL injection posible
  ✓ Usuario no-root en contenedor Docker
  ✓ Variables de entorno — nunca en el código

Datos:
  ✓ TLS en todas las conexiones a BD
  ✓ Backups cifrados en reposo
  ✓ Soft delete — sin borrado de datos de negocio
  ✓ audit_logs — trazabilidad completa de cambios

Pendiente antes de lanzamiento:
  → Penetration testing
  → Revisión OWASP Top 10
  → Política de manejo de incidentes de seguridad
```

---

## 14. Fases de Desarrollo

| Fase | Duración | Entregables |
|---|---|---|
| **Fase 1 — MVP Taxi** | 3-4 meses | Auth, ciclo completo de viaje, tracking básico, pago con tarjeta, panel admin básico |
| **Fase 2 — Estabilización** | 1-2 meses | Histórico de rutas, viajes programados, rating, push/SMS, métricas operacionales |
| **Fase 3 — Inteligencia** | Al tener datos | Matching ML, precios dinámicos por demanda real, detección de anomalías |
| **Fase 4 — Nuevos Verticales** | Variable | Delivery, custodia, expansión LATAM |

> **Nota sobre IA/ML:** construir flujos multi-agénticos antes de tener datos reales es un error frecuente. Los modelos necesitan señal histórica para ser útiles. La arquitectura está diseñada para que los módulos de inteligencia sean enchufables en Fase 3 sin afectar el core.

### Estructura del Repositorio

```
src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── drivers/
│   ├── trips/
│   │   ├── trips.routes.ts
│   │   ├── trips.controller.ts
│   │   ├── trips.service.ts
│   │   ├── trips.state-machine.ts
│   │   ├── trips.schema.ts
│   │   └── trips.events.ts
│   ├── pricing/
│   ├── payments/
│   ├── tracking/
│   ├── notifications/
│   └── admin/
├── observability/
│   ├── logger.ts
│   ├── metrics.ts
│   ├── tracer.ts
│   └── audit.ts
├── queues/
├── sockets/
│   ├── passenger.namespace.ts
│   ├── driver.namespace.ts
│   └── admin.namespace.ts
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── validate.ts
│   └── rate-limit.ts
└── config/
    ├── database.ts
    ├── redis.ts
    └── environment.ts
```

---

## 15. Decisiones Técnicas Registradas

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | Monolito modular | Microservicios | Equipo pequeño — MVP primero, extraer después |
| 2 | Fastify sobre Express | Express | 3x más rápido en concurrencia |
| 3 | PostgreSQL + Redis + Timescale | MongoDB | Datos relacionales + tiempo real + series de tiempo |
| 4 | React Native | Flutter | Mismo stack MERN del equipo |
| 5 | BullMQ + cron | Kafka | Complejidad innecesaria en MVP |
| 6 | Stripe solo | Stripe + Conekta | Simplifica MVP — se agrega Conekta en Fase 2 |
| 7 | OpenTelemetry | Datadog directo | Portabilidad — migración sin cambio de código |
| 8 | SELECT FOR UPDATE | Locks en Redis | Consistencia garantizada en BD transaccional |
| 9 | pricing_snapshot JSONB | Recalcular siempre | Inmutabilidad del precio histórico por viaje |
| 10 | Scheduler cron + PG | BullMQ delayed jobs | Resiliencia ante reinicios — no se pierden eventos |
| 11 | Markdown + draw.io XML | Word / PDF | Portable, versionable en Git, editable sin herramientas |
| 12 | Railway/Render para MVP | AWS desde el inicio | Reduce complejidad operacional hasta validar el negocio |
| 13 | GitHub Actions | Jenkins / CircleCI | Nativo en el repositorio — sin infraestructura extra |
| 14 | Knex para migraciones | Flyway / Liquibase | Mismo ecosistema Node.js — sin herramienta externa |
| 15 | docker-compose en dev | Entornos manuales | Entorno completo en un comando — reproducible en todo el equipo |

---

*Documento de referencia técnica — v1.0 — Completo*

---

## 16. Testing — Estrategia

### Pirámide de Tests

| Capa | Herramienta | Proporción | Cuándo corre |
|---|---|---|---|
| Unit | Jest | ~70% | Cada commit |
| Integration | Jest + Testcontainers | ~25% | Cada PR |
| E2E Smoke | Playwright @smoke | ~5% | Antes de deploy en CI |
| E2E completo | Playwright (local) | — | Agente de desarrollo |

### Cobertura mínima

| Módulo | Líneas | Branches |
|---|---|---|
| `TripStateMachine` | 100% | 100% |
| `PricingEngine` | 100% | 100% |
| `PaymentService` | 95% | 90% |
| Global | 75% | 70% |

### Playwright como herramienta del agente

Playwright corre localmente para dar feedback inmediato al agente:

```bash
npm run agent:verify:quick   # unit + @smoke — < 30 seg
npm run agent:verify         # todo — antes de PR
```

El agente lee los screenshots de fallo para diagnosticar sin intervención humana.

---

## 17. Manejo de Errores y Resiliencia

### Clasificación de errores

| Tipo | Cuándo | Respuesta al cliente |
|---|---|---|
| `BusinessError` | Estado de negocio inválido | 400 con código y mensaje descriptivo |
| `TechnicalError` | Fallo interno del sistema | 500 con mensaje genérico |
| `IntegrationError` | Servicio externo falla | 503 con mensaje genérico |

### Circuit Breaker por servicio

| Servicio | Timeout | Error threshold | Reset | Fallback |
|---|---|---|---|---|
| Google Maps | 5s | 40% | 60s | Estimación haversine |
| Stripe | 10s | 30% | 120s | 3 reintentos → manual |
| FCM | 5s | 50% | 30s | SMS vía Twilio |
| Twilio | 8s | 50% | 60s | Log + continúa |
| Redis | — | — | — | Leer desde PostgreSQL |

### Decisiones de resiliencia

| Fallo | Estrategia | Impacto visible |
|---|---|---|
| Google Maps caído | Estimación lineal con disclaimer | Precio estimado en UI |
| Stripe falla al cobrar | 3 reintentos exp. → revisión manual | Pasajero notificado |
| Stripe decline bancario | Sin reintentos — error de negocio | Pasajero elige otro método |
| FCM no entrega | Fallback a SMS si es crítico | Ninguno si SMS funciona |
| Redis cae | Fallback a PostgreSQL | Conductor "congelado" en mapa |

---

## 18. Onboarding del Conductor

### Estados

`pending` → `documents_submitted` → `under_review` → `approved` → `suspended` / `banned`

### Permisos por estado

| Estado | Puede hacer |
|---|---|
| `pending` | Subir documentos |
| `documents_submitted` | Ver estado |
| `under_review` | Ver estado |
| `approved` | Operar, go-online, subir renovaciones |
| `suspended` | Ver motivo, subir docs, contactar soporte |
| `banned` | Ver motivo, contactar soporte |

### Regla de documentos vencidos con viaje activo

Si el conductor tiene un viaje en curso cuando vence un documento:
1. Se permite terminar el viaje en curso
2. Al completarse → suspensión automática inmediata
3. Notificación proactiva antes de que venza (30 días, 7 días, 1 día)

---

## 19. Panel Admin — Funciones Operacionales MVP

### Las 5 pantallas críticas para operar desde el día 1

| Pantalla | Funciones clave |
|---|---|
| Dashboard | KPIs en tiempo real, mapa con conductores y viajes, alertas activas |
| Viajes | Lista filtrable, detalle con ruta GPS + timeline completo, acciones manuales |
| Conductores | Lista por estado, checklist de documentos con visor, aprobar/rechazar/suspender |
| Operaciones | Pagos fallidos con reintento manual, errores críticos, reembolsos pendientes |
| Configuración | Factores de precio, comisiones, radio de búsqueda, timeouts |

### Configuración en caliente

Todo lo configurable desde el panel admin aplica sin redeploy:
- Factores de precio (activar/desactivar/editar valor)
- Porcentaje de comisión por tipo de viaje
- Radio de búsqueda de conductores
- Tiempos de timeout (búsqueda, espera en origen)
