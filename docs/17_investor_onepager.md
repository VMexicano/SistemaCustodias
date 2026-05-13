# One-Pager Inversionista - Presupuesto Mes 1

**Proyecto:** UBER_BASE (MVP Taxi Mexico)  
**Fecha:** 22 de abril de 2026  
**Moneda:** MXN  
**TC de referencia:** 18.5 MXN/USD

---

## 1) Mensaje clave

Con 6,000 conductores registrados, el costo tecnico del mes 1 ya no corresponde a un piloto con free tier de mapas. El arranque tecnico se ubica alrededor de **356K-380K MXN**, y para un lanzamiento integral sin presupuesto de marketing el monto recomendado es **415K MXN**.

---

## 2) Presupuesto ejecutivo (3 escenarios)

| Escenario | Incluye | Total MXN |
|---|---|---:|
| Tecnico minimo | Licencia + stores + infra + mapas + OTP sin free tier | ~356,395 |
| Tecnico realista | Tecnico minimo + margen tecnico para variacion de consumo | ~367,795-380,295 |
| Lanzamiento integral (recomendado) | Tecnico realista + soporte + legal + contingencia (sin marketing) | **~397,000-440,000** |

**Decision sugerida:** fondear 415,000 MXN.

### Representacion de costos - Lanzamiento integral

| Rubro | Minimo (MXN) | Objetivo (MXN) | Maximo (MXN) | % sobre objetivo |
|---|---:|---:|---:|---:|
| Licencia/App | 285,000 | 285,000 | 285,000 | 68.7% |
| Stores (Apple + Google) | 2,295 | 2,295 | 2,295 | 0.6% |
| Infra + SaaS tecnico mes 1 | 4,500 | 6,500 | 9,000 | 1.6% |
| Mapas (Mapbox) - uso app | 58,000 | 66,600 | 74,000 | 16.0% |
| OTP y servicios variables iniciales | 5,000 | 7,400 | 10,000 | 1.8% |
| Soporte post-lanzamiento | 20,000 | 27,000 | 35,000 | 6.5% |
| Legal/contable/onboarding financiero | 7,000 | 8,000 | 12,000 | 1.9% |
| Contingencia operativa | 15,205 | 12,205 | 12,705 | 2.9% |
| **Total escenario** | **397,000** | **415,000** | **440,000** | **100%** |

> Lectura ejecutiva:
> - **Minimo:** arranque muy ajustado, menor margen ante incidentes.
> - **Objetivo (415K):** equilibrio entre ejecucion tecnica y salida a mercado sin marketing.
> - **Maximo:** escenario conservador con mayor amortiguador operativo.
>
> Nota mapas: los costos se calcularon sin considerar free tier, asumiendo volumen operativo alto (base de 6,000 conductores).

---

## 3) Infraestructura de operacion diaria (AWS)

| Componente | Servicio AWS | Funcion operativa |
|---|---|---|
| Capa de aplicacion | ECS Fargate | Corre API, workers y scheduler |
| Entrada y seguridad TLS | ALB + ACM | Trafico HTTPS y health checks |
| Datos transaccionales | RDS PostgreSQL | Viajes, pagos, usuarios |
| Estado en tiempo real y colas | ElastiCache Redis | Socket state + BullMQ |
| Red privada | VPC + Subnets + NAT Gateway | Aislamiento y salida segura |
| Observabilidad | CloudWatch + SNS | Logs, metricas y alertas |
| Respaldo | S3 | Backups y artefactos |
| Seguridad de credenciales | Secrets Manager/SSM + IAM | Manejo de secretos y accesos |
| DNS y proteccion perimetral | Route 53 + WAF | Dominio y mitigacion de abuso |

---

## 4) Costo mensual estimado de AWS (base infraestructura)

| Rubro AWS | Rango USD/mes | Rango MXN/mes |
|---|---:|---:|
| Compute + balanceador (ECS + ALB) | 62-155 | 1,147-2,868 |
| Datos (RDS + Redis) | 53-115 | 981-2,128 |
| Red (NAT + transferencia) | 37-57 | 685-1,055 |
| Operacion (CloudWatch + SNS + WAF) | 19-70 | 352-1,295 |
| Storage/imagenes/DNS/secretos (S3 + ECR + Route53 + Secrets) | 6-33 | 111-611 |
| **Total AWS mensual** | **177-430** | **3,277-7,958** |

> Nota: esta tabla representa infraestructura AWS base. Costos de mapas, OTP y comisiones transaccionales se modelan por separado.

---

## 5) Uso propuesto de fondos (ticket 415K)

### Opcion A - Arranque con Railway (recomendada para MVP)

| Categoria | Monto MXN | % |
|---|---:|---:|
| Licencia/App | 285,000 | 68.7% |
| Stores (Apple + Google) | 2,295 | 0.6% |
| Infra + SaaS tecnico mes 1 (incluye mapas sin free tier) | 76,800 | 18.5% |
| Operacion y lanzamiento (sin marketing) | 50,905 | 12.3% |
| **Total** | **415,000** | **100%** |

### Desglose tecnico mensual - Opcion A (incluye mapas)

| Componente tecnico | Rango MXN mes 1 |
|---|---:|
| Infraestructura Railway (API + DB + Redis) | 4,500-8,700 |
| Dominio + storage base + observabilidad inicial | 200-500 |
| Mapas (Mapbox, sin free tier) | 58,000-74,000 |
| OTP y mensajeria inicial | 5,000-10,000 |
| **Total tecnico variable/fijo mes 1** | **67,700-93,200** |

### Sensibilidad de costo de mapas (Mapbox)

| Volumen mensual | Costo mapas estimado (MXN) |
|---|---:|
| 10,000 viajes | ~740 |
| 50,000 viajes | ~3,700 |
| 200,000 viajes | ~14,800 |
| 900,000 viajes | ~66,600 |

### Actividades de ejecucion - Opcion A (primeros 30 dias)

| Fase | Actividades clave | Responsable principal | Entregable |
|---|---|---|---|
| Semana 1 - Setup productivo | Configurar servicios en Railway (API, PostgreSQL, Redis), variables de entorno, dominio, SSL, health checks y rollback | Backend + DevOps | Entorno productivo estable y verificable |
| Semana 1 - Seguridad minima | Configurar secretos, politicas de acceso, rate limits, webhook signing (Stripe), backup inicial | Backend + DevOps | Checklist de seguridad MVP completado |
| Semana 2 - Integraciones core | Validar Stripe (cobro y webhook), OTP, push notifications, mapas y storage de documentos | Backend | Flujo punta a punta funcionando |
| Semana 2 - QA operativa | Ejecutar smoke tests, pruebas de carga ligera, pruebas de fallos (Redis/API) y runbook de incidentes | QA + Backend | Acta de go-live con criterios aprobados |
| Semana 3 - Lanzamiento controlado | Onboarding inicial de conductores/pasajeros, soporte de incidencias, monitoreo activo en Grafana/Bull Board | Operaciones + Backend | Piloto en produccion con soporte activo |
| Semana 4 - Estabilizacion | Ajuste de costos, tuning de colas, correccion de bugs, priorizacion de backlog y plan de mes 2 | Producto + Backend | Reporte de cierre mes 1 + plan mes 2 |

### Desglose operativo por frente (Opcion A)

| Frente | Actividades | Frecuencia |
|---|---|---|
| Operacion tecnica | Revisar health checks, errores, colas (BullMQ), jobs fallidos y latencia API | Diario |
| Datos y continuidad | Verificar backups, estado de BD, conexiones activas y retencion de logs | Diario/Semanal |
| Soporte al usuario | Atender tickets de conductores/pasajeros, reintentos de pago y cancelaciones manuales | Diario |
| Calidad | Ejecutar smoke tests y regresion de flujos criticos (auth, viaje, pago) | 2-3 veces por semana |
| Finanzas y costos | Revisar consumo Railway, costos variables (OTP/Stripe) y desviacion vs presupuesto | Semanal |

### Indicadores de control del mes 1 (Opcion A)

| KPI | Meta mes 1 |
|---|---:|
| Disponibilidad API | >= 99.5% |
| Tiempo de respuesta p95 API | < 500 ms |
| Exito de pagos | >= 97% |
| Incidentes P1 | 0-1 maximo |
| Tiempo medio de resolucion (MTTR) | < 60 min |
| Desviacion presupuestal | <= 10% |

### Opcion B - Arranque en AWS desde dia 1

| Categoria | Monto MXN | % |
|---|---:|---:|
| Licencia/App | 285,000 | 68.7% |
| Stores (Apple + Google) | 2,295 | 0.6% |
| Infra + SaaS tecnico mes 1 (AWS + mapas + OTP) | 92,000 | 22.2% |
| Operacion y lanzamiento (sin marketing) | 35,705 | 8.6% |
| **Total** | **415,000** | **100%** |

---

## 6) Riesgos clave y mitigacion

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Sobreconsumo de infraestructura | Medio | Alertas de gasto + escalamiento gradual |
| Costo OTP mayor al supuesto | Medio | Priorizar canal de menor costo y reducir reautenticaciones |
| Falla operativa en semana 1 | Alto | Guardias y soporte post-lanzamiento |
| Desviacion de costos por volumen de mapas | Alto | Monitoreo semanal de consumo y ajuste de limites operativos |

---

## 7) Cierre para presentacion

- El valor tecnico base esta validado.
- El ticket de 415K refleja el costo real sin depender de free tier de mapas y sin presupuesto de marketing.
- La diferencia entre un arranque fragil y uno estable esta en operacion + contingencia.
- Recomendacion final: **aprobar 415K MXN para lanzamiento mes 1**.
