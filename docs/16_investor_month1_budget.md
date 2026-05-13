# Presupuesto de Lanzamiento Mes 1

## UBER_BASE - Documento Ejecutivo para Inversionista

**Fecha:** 22 de abril de 2026  
**Moneda base:** MXN  
**Tipo de cambio de referencia:** 18.5 MXN/USD

---

## 1. Resumen Ejecutivo

El costo total para operar el primer mes depende del alcance que se quiera financiar:

- **Escenario tecnico minimo:** ~288,210 MXN
- **Escenario tecnico realista:** ~289,500-292,500 MXN
- **Escenario lanzamiento integral (recomendado):** ~340,000-385,000 MXN

**Conclusion para inversion:**
El monto de **350,000 MXN** es consistente y defendible cuando se incluye no solo tecnologia, sino tambien operacion de lanzamiento (soporte, contingencia, legal y traccion comercial inicial).

---

## 2. Estructura de Costos (Mes 1)

### 2.1 Costos One-Time (pago inicial)

| Concepto | Monto MXN |
|---|---:|
| Licencia/App (venta del software) | 285,000 |
| Google Play Console (unica vez) | 463 |
| Apple Developer Program (anual, pagado al inicio) | 1,832 |
| **Subtotal one-time** | **287,295** |

### 2.2 Costos Fijos Operativos (Mes 1)

| Concepto | Rango MXN |
|---|---:|
| Infraestructura (Railway, por uso + minimo de plan) | 900-2,500 |
| Dominio | 15-40 |
| Storage documentos (R2) | 0-100 |
| SSL/CDN base | 0 |
| Error tracking y correo transaccional (free tier) | 0 |
| **Subtotal fijo mensual** | **915-2,640** |

### 2.3 Costos Variables (Mes 1)

| Concepto | Supuesto piloto (1,000-5,000 viajes) | Rango MXN |
|---|---|---:|
| Mapbox | Dentro de free tier con supuestos actuales | 0 |
| OTP (SMS o WhatsApp) | Depende de volumen real de verificaciones | 0-2,500 |
| Stripe fees | 3.6% + 3 MXN por transaccion exitosa | Variable |

> Nota: Stripe es costo variable transaccional y se descuenta del flujo de cobro, no de una suscripcion fija mensual.

---

## 3. Escenarios de Presupuesto

| Escenario | Que incluye | Total MXN |
|---|---|---:|
| Tecnico minimo | One-time + fijo bajo + variable bajo | ~288,210 |
| Tecnico realista | One-time + fijo medio + OTP moderado | ~289,500-292,500 |
| Lanzamiento integral | Tecnico realista + operacion de salida a mercado | **~340,000-385,000** |

> Estos escenarios asumen despliegue MVP en Railway para mes 1. Si se decide operar en AWS desde el arranque, ver la seccion 4.

---

## 4. Infraestructura AWS requerida y costo mensual

> Esta app en AWS requiere, como base operativa diaria: API + workers + scheduler, PostgreSQL, Redis, balanceador, red privada, secretos, monitoreo y backups.
> Los montos son rangos de referencia para piloto (1,000-5,000 viajes/mes), en **USD y MXN**.

| Servicio AWS | Uso en la plataforma | Rango USD/mes | Rango MXN/mes |
|---|---|---:|---:|
| ECS Fargate | API Fastify + workers BullMQ + scheduler | 40-120 | 740-2,220 |
| Application Load Balancer | Entrada HTTPS API/WebSocket + health checks | 22-35 | 407-648 |
| RDS PostgreSQL | Datos transaccionales (viajes, pagos, usuarios) | 35-70 | 648-1,295 |
| ElastiCache Redis | Estado en tiempo real + colas BullMQ | 18-45 | 333-833 |
| NAT Gateway + transferencia | Salida privada segura a servicios externos | 37-57 | 685-1,055 |
| CloudWatch (logs, metricas, alarmas) | Monitoreo y operacion diaria | 10-40 | 185-740 |
| S3 (backups y artefactos) | Respaldos y almacenamiento operativo | 2-15 | 37-278 |
| ECR | Registro de imagenes Docker | 1-5 | 19-93 |
| Route 53 + DNS | Resolucion de dominios | 1-3 | 19-56 |
| ACM | Certificados TLS | 0 | 0 |
| Secrets Manager / SSM | Secretos y credenciales | 2-10 | 37-185 |
| WAF + SNS | Proteccion y alertamiento | 9-30 | 167-555 |
| **Total mensual AWS (produccion, piloto)** |  | **177-430** | **3,277-7,958** |

### Impacto en presupuesto de primer mes si se usa AWS desde dia 1

| Concepto | MXN |
|---|---:|
| Base tecnica one-time (licencia + stores) | 287,295 |
| Infra AWS mes 1 (rango piloto) | 3,277-7,958 |
| OTP variable estimado | 0-2,500 |
| **Total tecnico mes 1 con AWS** | **~290,572-297,753** |

> Si ademas se incluye operacion/lanzamiento (soporte, marketing, legal y contingencia), el rango total sigue en la banda de **~350,000-400,000 MXN**.

---

## 5. Desglose de Lanzamiento Integral

| Rubro de lanzamiento | Rango MXN |
|---|---:|
| Soporte post-lanzamiento (guardias, fixes, monitoreo) | 20,000-35,000 |
| Marketing inicial (conductores y pasajeros) | 20,000-40,000 |
| Legal/contable/onboarding financiero | 5,000-12,000 |
| Contingencia operativa (5%-8% del tecnico) | 15,000-25,000 |
| **Subtotal operacion/lanzamiento** | **60,000-112,000** |

---

## 6. Recomendacion de Inversion

### Ticket recomendado

- **Solicitar inversion objetivo: 350,000 MXN**

### Justificacion

- Cubre tecnologia y salida a mercado del primer mes sin operar al limite.
- Mantiene colchoncito para variaciones en OTP, incidentes iniciales y ritmo de adquisicion.
- Evita subcapitalizacion en una etapa donde la velocidad de respuesta es critica.

---

## 7. Uso Propuesto de Fondos (350,000 MXN)

### 7.1 Distribucion objetivo usando Railway en mes 1

| Categoria | Monto MXN | % |
|---|---:|---:|
| Licencia/App | 285,000 | 81.4% |
| Stores (Apple + Google) | 2,295 | 0.7% |
| Infra + SaaS tecnico mes 1 | 3,705 | 1.1% |
| Operacion y lanzamiento | 59,000 | 16.9% |
| **Total** | **350,000** | **100%** |

### 7.2 Distribucion objetivo usando AWS desde dia 1

| Categoria | Monto MXN | % |
|---|---:|---:|
| Licencia/App | 285,000 | 81.4% |
| Stores (Apple + Google) | 2,295 | 0.7% |
| Infra + SaaS tecnico mes 1 (AWS base) | 7,705 | 2.2% |
| Operacion y lanzamiento | 55,000 | 15.7% |
| **Total** | **350,000** | **100%** |

> Nota: en AWS, el rango tecnico mensual puede moverse por consumo real (logs, transferencia, picos de compute). El valor de 7,705 MXN en esta tabla representa una referencia media dentro del rango estimado.

---

## 8. Riesgos y Mitigacion

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| OTP por encima de lo estimado | Medio | Priorizar canal mas barato (WhatsApp) y optimizar re-autenticaciones |
| Mayor uso de infraestructura por picos | Medio | Escalamiento por consumo y alertas tempranas de gasto |
| Retrasos de onboarding legal/financiero | Alto | Iniciar checklist legal y cuentas de pago antes del go-live |
| Menor traccion comercial inicial | Alto | Reasignar parte de contingencia a adquisicion durante semana 1-2 |

---

## 9. Mensaje Final para Inversionista

El proyecto puede arrancar tecnicamente cerca de 288K MXN.  
Sin embargo, para un lanzamiento con alta probabilidad de ejecucion estable, el presupuesto correcto a financiar es **350K MXN**.

Ese monto no infla tecnologia: protege operacion, tiempo de respuesta y traccion inicial en el primer mes, que son los factores que mas afectan la probabilidad de continuidad del negocio.
