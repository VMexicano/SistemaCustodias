# Costos de Servicios Externos — UBER_BASE

> Documento de referencia para decisiones de arquitectura con impacto económico.
> Actualizar cuando cambien planes, escala proyectada, o se elija un proveedor diferente.
> **Última actualización:** 2026-04-22
> **Mercado objetivo inicial:** México · Moneda de referencia: USD (convertir a MXN ~17x)
> **Escenario objetivo confirmado:** 6,000 conductores activos · 5 viajes/conductor/día → **900,000 viajes/mes**

---

## Presupuesto de lanzamiento — Primer mes (piloto 1,000–5,000 viajes)

> Objetivo: separar costos one-time, costos fijos mensuales y costos variables por transacción para evitar subestimar el presupuesto real de arranque.
> Tipo de cambio de trabajo recomendado: **18.5 MXN/USD**.

### 1) Costos one-time (pago inicial)

| Concepto | USD | MXN estimado |
|---|---|---|
| Licencia/app (venta del software) | — | **285,000** |
| Google Play Console (única vez) | 25 | 463 |
| Apple Developer Program (anual, se paga al inicio) | 99 | 1,832 |
| **Subtotal one-time** |  | **287,295 MXN** |

### 2) Costos fijos del primer mes (operación técnica)

| Concepto | Supuesto | Rango MXN mes 1 |
|---|---|---|
| Infraestructura (Railway) | Pricing por uso + mínimo de plan (no tarifa fija por servicio) | **900–2,500** |
| Dominio | .com/.mx anual prorrateado | 15–40 |
| SSL/CDN base | Cloudflare + certificados gestionados | 0 |
| Almacenamiento documentos (R2) | Volumen bajo en piloto | 0–100 |
| Error tracking / correo transaccional | Free tier inicial | 0 |
| **Subtotal fijo técnico mes 1** |  | **915–2,640 MXN** |

### 3) Costos variables del primer mes

| Concepto | Supuesto piloto | Rango MXN mes 1 |
|---|---|---|
| Mapbox (maps/geocoding/directions) | 1,000–5,000 viajes; bajo supuestos actuales queda dentro de free tier | **0** |
| OTP (SMS/WhatsApp) | Depende del canal real y volumen de verificaciones | **0–2,500** |
| Stripe fees | 3.6% + MXN 3 por pago exitoso (costo variable, no fijo) | Variable por volumen |

> Nota crítica: no asumir cuota gratuita de SMS para México sin validar en consola/cotizador del proveedor activo.

### 4) Presupuesto total recomendado para presentar

| Vista | Total MXN |
|---|---|
| **Solo técnico mínimo (one-time + fijo + variable bajo)** | **~288,210 MXN** |
| **Técnico realista (incluyendo OTP moderado)** | **~289,500–292,500 MXN** |
| **Lanzamiento completo (técnico + operación/negocio)** | **~340,000–385,000 MXN** |

### 5) Rubros de operación/negocio que explican 350K MXN

| Concepto | Rango MXN |
|---|---|
| Soporte post-lanzamiento (guardias, fixes, monitoreo) | 20,000–35,000 |
| Marketing/adquisición inicial (conductores + pasajeros) | 20,000–40,000 |
| Legal/contable/onboarding financiero | 5,000–12,000 |
| Contingencia (5%–8% del presupuesto técnico) | 15,000–25,000 |
| **Subtotal operación/negocio** | **60,000–112,000** |

> Con esta estructura, **350K MXN sí es defendible** como presupuesto de lanzamiento integral (no solo tecnológico).

---

## Resumen ejecutivo por escala

| Escala | Viajes/mes | Costo fijo/mes (USD) | Nota |
|---|---|---|---|
| Early stage | ~1,000 | ~$15 | Free tiers cubren todo excepto infra |
| Tracción | ~10,000 | ~$50–150 | Mapbox aún en free tier |
| Crecimiento | ~100,000 | ~$500–1,200 | Mapbox + OTP empiezan a costar |
| **Objetivo** | **~900,000** | **~$4,500–6,000** | **Ver sección 0 — Escenario objetivo** |
| Escala máxima | ~5,000,000 | ~$20,000+ | Negociar tarifas enterprise |

> ⚠️ Los costos de Stripe (% por transacción) no están incluidos en la columna de costo fijo — son variables y se detallan en la sección 4.

---

---

## 0. Escenario objetivo — 6,000 conductores · 5 viajes/día

> Datos confirmados: 6,000 conductores activos, promedio 5 viajes por conductor por día.
> Base de cálculo: 6,000 × 5 × 30 = **900,000 viajes/mes**.

### Supuestos por viaje (Mapbox)

| Evento | Requests generados |
|---|---|
| Pasajero abre app (mapa) | 1 map load |
| Pasajero ve pantalla de estimación | 1 map load |
| Pasajero en ActiveTrip | 1 map load |
| Búsqueda de origen + destino | 2 geocoding |
| Cálculo de ruta | 1 directions |
| **Total por viaje** | **3 map loads · 2 geocoding · 1 directions** |

### Costo Mapbox a 900,000 viajes/mes

| Servicio | Volumen bruto | Free tier | Volumen facturable | Precio | **Costo/mes** |
|---|---|---|---|---|---|
| Map loads | 2,700,000 | 50,000 | 2,650,000 | $0.50/1,000 | **$1,325** |
| Geocoding | 1,800,000 | 100,000 | 1,700,000 | $0.75/1,000 | **$1,275** |
| Directions | 900,000 | 100,000 | 800,000 | $1.00/1,000 | **$800** |
| **TOTAL MAPBOX** | | | | | **~$3,400/mes** |

**Comparativa Google Maps al mismo volumen:**

| Servicio | Volumen | Precio Google | Costo Google |
|---|---|---|---|
| Maps SDK | 2,700,000 | $7.00/1,000 | $18,900 |
| Places Autocomplete | 1,800,000 | $17.00/1,000 | $30,600 |
| Directions API | 900,000 | $5.00/1,000 | $4,500 |
| **TOTAL GOOGLE** | | | **~$54,000/mes** |

> Mapbox ahorra **~$50,600 USD/mes** respecto a Google Maps en este escenario. La decisión ADR-033 es crítica a esta escala.

### Costo Stripe a 900,000 viajes/mes

Supuesto: ticket promedio $150 MXN (~$8.80 USD). Tarifa Stripe MX: 3.6% + $3 MXN.

| Concepto | Cálculo | Resultado |
|---|---|---|
| Volumen total de pagos | 900,000 × $150 MXN | $135,000,000 MXN |
| Costo Stripe (3.6%) | 3.6% × $135M | $4,860,000 MXN |
| Costo Stripe (fijo) | $3 × 900,000 | $2,700,000 MXN |
| **Total costo Stripe/mes** | | **$7,560,000 MXN (~$445K USD)** |
| Comisión plataforma bruta (20%) | 20% × $135M | $27,000,000 MXN |
| **Ingreso neto plataforma** | $27M − $7.56M | **$19,440,000 MXN (~$1.14M USD/mes)** |

### Costo OTP a este volumen

Estimado: 6,000 conductores con sesión persistente (pocas re-autenticaciones) + ~50,000 pasajeros únicos/mes nuevos o que re-autentican. Total ~60,000–100,000 OTPs/mes.

| Proveedor | Costo estimado/mes |
|---|---|
| Firebase Phone Auth (SMS México) | ~$600–$1,500 |
| WhatsApp Business API (recomendado) | ~$300–$500 |

### Resumen de costos fijos a 900,000 viajes/mes

| Servicio | Proveedor | Costo/mes (USD) |
|---|---|---|
| Mapas | Mapbox | **~$3,400** |
| Push notifications | FCM / Expo | **$0** |
| OTP (SMS) | WhatsApp Business API | **~$300–500** |
| Infraestructura | Railway Pro × 3 | **~$150–300** |
| Storage (docs conductores) | Cloudflare R2 | **~$10–20** |
| **TOTAL FIJO** | | **~$3,860–4,220/mes** |

> El costo variable de Stripe (~$445K USD/mes) se paga con el flujo de pagos — no es un costo operativo directo de la plataforma.

---

## 1. Mapas y Geolocalización

### Mapbox (proveedor elegido — ADR-033 pendiente)

**Por qué Mapbox sobre Google Maps:** 14× más barato a escala. Google cobra $7/1,000 map loads; Mapbox $0.50/1,000.

| Servicio | Free tier | Precio después |
|---|---|---|
| Map loads (SDK mobile) | 50,000 / mes | $0.50 / 1,000 loads |
| Geocoding (búsqueda de direcciones) | 100,000 / mes | $0.75 / 1,000 requests |
| Directions / Navigation | 100,000 / mes | $1.00 / 1,000 requests |

**Estimación por escala:**

Supuestos: cada viaje genera ~3 map loads (open app, estimate, active trip) + 2 geocoding (origen, destino) + 1 directions.

| Viajes/mes | Map loads | Geocoding | Directions | Costo total |
|---|---|---|---|---|
| 1,000 | 3,000 | 2,000 | 1,000 | **$0** (dentro de free) |
| 10,000 | 30,000 | 20,000 | 10,000 | **$0** (dentro de free) |
| 50,000 | 150,000 | 100,000 | 50,000 | **~$50** |
| 200,000 | 600,000 | 400,000 | 200,000 | **~$475** |
| **900,000** ⭐ | **2,700,000** | **1,800,000** | **900,000** | **~$3,400** |

> ⭐ Escenario objetivo confirmado: 6,000 conductores × 5 viajes/día. Ver sección 0 para el desglose completo.

**Google Maps (referencia comparativa — NO usado):**

| Servicio | Free tier | Precio |
|---|---|---|
| Maps SDK for Android/iOS | 28,000 / mes (compartido) | $7.00 / 1,000 |
| Places API (Autocomplete) | — | $17.00 / 1,000 |
| Directions API | — | $5.00 / 1,000 |

Al mismo volumen de 200,000 viajes/mes con Google: ~$6,800/mes vs ~$475 con Mapbox.

---

## 2. Notificaciones Push (FCM)

**Proveedor:** Firebase Cloud Messaging (FCM)
**Costo:** **$0** — FCM es gratuito sin límite de mensajes.

Solo hay costo si se usa Firebase Phone Auth para OTPs (ver sección 3).

---

## 3. OTP / Verificación por Teléfono

### Firebase Phone Auth (proveedor actual — LogOTPChannel en dev)

| Tier | Verificaciones/mes | Costo |
|---|---|---|
| Gratuito | 10,000 | $0 |
| SMS México | > 10,000 | ~$0.01–0.015 / SMS |

**Estimación:**

| Usuarios nuevos/mes | Logins recurrentes/mes | Total OTPs | Costo |
|---|---|---|---|
| 500 | 2,000 | 2,500 | **$0** |
| 2,000 | 8,000 | 10,000 | **$0** |
| 5,000 | 20,000 | 25,000 | **~$225** |
| 20,000 | 80,000 | 100,000 | **~$1,350** |

**Alternativa para escala:** WhatsApp Business API — $0.005/mensaje en México (3× más barato que SMS), adopción ~95% en México.

---

## 4. Pagos — Stripe

**Modelo:** Stripe cobra por transacción exitosa. Sin mensualidad, sin setup fee.

| Mercado | Tarifa |
|---|---|
| México (Stripe MX) | 3.6% + $3 MXN por cargo |
| Internacional (Stripe US) | 2.9% + $0.30 USD por cargo |

**Ejemplo — viaje promedio $150 MXN (~$8.80 USD):**
- Costo Stripe MX: (3.6% × $150) + $3 = $5.40 + $3 = **$8.40 MXN por viaje** (~5.6% efectivo)
- La plataforma cobra 20% de comisión = $30 MXN → ganancia neta: $30 − $8.40 = **$21.60 MXN**

**Estimación por escala:**

| Viajes/mes | Ticket promedio | Volumen total | Costo Stripe | Ingreso bruto plataforma (20%) | Ingreso neto |
|---|---|---|---|---|---|
| 1,000 | $150 MXN | $150,000 MXN | ~$8,400 MXN | $30,000 MXN | **$21,600 MXN** |
| 10,000 | $150 MXN | $1,500,000 MXN | ~$84,000 MXN | $300,000 MXN | **$216,000 MXN** |
| 100,000 | $150 MXN | $15,000,000 MXN | ~$840,000 MXN | $3,000,000 MXN | **$2,160,000 MXN** |

> Stripe ofrece tarifas negociadas a partir de ~$1M USD/mes en volumen. Para escala LATAM contactar a su equipo de enterprise.

---

## 5. Infraestructura — API, Base de Datos, Redis

### Opción A: Railway (recomendado para MVP)

| Servicio | Plan | Costo/mes |
|---|---|---|
| API (Node.js) | Starter (512MB RAM, 1 vCPU) | $5 |
| PostgreSQL | Starter (1GB) | $5 |
| Redis | Starter (256MB) | $5 |
| **Total MVP** | | **~$15/mes** |

Escala a Pro (~$20/servicio) cuando haya carga real.

### Opción B: Fly.io

| Servicio | Configuración | Costo/mes |
|---|---|---|
| API | shared-cpu-1x, 256MB | $1.94 |
| PostgreSQL | 1 CPU, 256MB | $5.94 |
| Redis (Upstash) | Free 10k cmd/día | $0–10 |
| **Total MVP** | | **~$8–18/mes** |

### Comparativa infraestructura a escala

| Carga | Railway | Fly.io | AWS (referencia) |
|---|---|---|---|
| 100 req/min | $15/mes | $10/mes | $50+/mes |
| 1,000 req/min | $45/mes | $35/mes | $150+/mes |
| 10,000 req/min | $150/mes | $120/mes | $500+/mes |

---

## 6. Almacenamiento de Archivos (documentos de conductores)

### Cloudflare R2 (recomendado)

| Recurso | Free tier | Precio después |
|---|---|---|
| Almacenamiento | 10 GB/mes | $0.015 / GB |
| Operaciones de escritura | 1M / mes | $4.50 / millón |
| Operaciones de lectura | 10M / mes | $0.36 / millón |
| **Egress (descarga)** | **Ilimitado** | **$0** |

El egress gratuito es la ventaja clave vs S3 (S3 cobra $0.09/GB de salida).

**Estimación:** 1,000 conductores × 5 documentos × 2 MB promedio = ~10 GB → **$0/mes en free tier**.

### Alternativas

| Proveedor | Storage | Egress | Precio aprox. |
|---|---|---|---|
| Cloudflare R2 | $0.015/GB | **Gratis** | ~$0–5/mes |
| AWS S3 | $0.023/GB | $0.09/GB | ~$10–30/mes |
| Supabase Storage | 1GB free | incluido | $0–25/mes |

---

## 7. App Stores

| Plataforma | Costo | Recurrencia |
|---|---|---|
| Google Play | $25 USD | Una sola vez |
| Apple App Store | $99 USD | Anual |

**Comisión de tiendas sobre pagos in-app:**
- Google Play: 15% (primeros $1M USD/año), 30% después
- Apple App Store: 15% (pequeños negocios), 30% estándar
- **Impacto en UBER_BASE:** los pagos van directamente a Stripe (no son in-app purchases), por lo que las comisiones de tienda NO aplican al flujo de pago.

---

## 8. Resumen por fase de crecimiento

### Fase 1 — MVP / Early Stage (0–500 viajes/mes)

| Servicio | Proveedor | Costo/mes |
|---|---|---|
| Mapas | Mapbox | $0 |
| Push notifications | Firebase FCM | $0 |
| OTP | Firebase Phone Auth | $0 |
| Pagos | Stripe MX | % por transacción |
| Infraestructura | Railway | $15 |
| Storage | Cloudflare R2 | $0 |
| **TOTAL FIJO** | | **~$15/mes** |

### Fase 2 — Tracción (1,000–10,000 viajes/mes)

| Servicio | Costo/mes estimado |
|---|---|
| Mapas (Mapbox) | $0–$50 |
| OTP (Firebase) | $0–$150 |
| Infraestructura (Railway Pro) | $45–$90 |
| Storage | $0–$5 |
| **TOTAL FIJO** | **~$50–$300/mes** |

### Fase 3 — Crecimiento (50,000–200,000 viajes/mes)

| Servicio | Costo/mes estimado |
|---|---|
| Mapas (Mapbox) | $200–$500 |
| OTP (WhatsApp Business API) | $250–$500 |
| Infraestructura (Fly.io / AWS ECS) | $300–$800 |
| Storage (R2) | $5–$20 |
| **TOTAL FIJO** | **~$800–$2,000/mes** |

### Fase Objetivo — 6,000 conductores · 900,000 viajes/mes ⭐

| Servicio | Proveedor recomendado | Costo/mes (USD) |
|---|---|---|
| Mapas | Mapbox | **~$3,400** |
| OTP | WhatsApp Business API | **~$300–500** |
| Push notifications | FCM / Expo | **$0** |
| Infraestructura API | Railway Pro × 3 instancias | **~$150–300** |
| Base de datos | Railway PostgreSQL Pro | **~$50–100** |
| Redis | Railway Redis Pro | **~$25–50** |
| Storage documentos | Cloudflare R2 | **~$10–20** |
| **TOTAL FIJO** | | **~$3,935–4,370/mes** |
| **Ingreso neto plataforma (Stripe)** | | **~$19.4M MXN/mes (~$1.14M USD)** |

> A esta escala el costo fijo (~$4K USD/mes) representa menos del 0.4% del ingreso neto. El mayor rubro es Mapbox ($3,400), no la infraestructura.
>
> **Acción recomendada:** Contactar a Mapbox para tarifa enterprise antes de superar 500,000 viajes/mes — a ese volumen suelen ofrecer descuentos del 20–40%.

---

## 9. Decisiones tomadas con impacto en costos

| Decisión | Impacto |
|---|---|
| Mapbox en lugar de Google Maps | Ahorro estimado 80–90% en costos de mapas a escala |
| Firebase FCM para push (sin Twilio) | Push notifications sin costo |
| LogOTPChannel en dev, FirebaseOTPChannel en prod | Sin costo hasta 10k OTPs/mes |
| Stripe como único gateway de pagos | Sin mensualidad; solo costo por transacción exitosa |
| Cloudflare R2 para documentos | Egress gratuito; sin sorpresas en factura |
| Monolito modular en Railway | $15/mes en early stage vs $50+ en microservicios |

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Mapbox sube precios | Baja | Medio | MapTiler es drop-in replacement (mismo SDK) |
| Firebase Phone Auth deja de ser gratuito | Baja | Alto | Abstraído vía `OTPChannel` — cambiar provider sin tocar `AuthService` |
| Stripe no aprueba cuenta MX | Media | Alto | Fallback: Conekta o OpenPay (gateways mexicanos) |
| Railway tiene downtime | Media | Alto | Migrar a Fly.io o AWS ECS con mismo Dockerfile |
| Volumen OTP supera free tier | Alta (en crecimiento) | Medio | Migrar a WhatsApp Business API ($0.005/msg) |
