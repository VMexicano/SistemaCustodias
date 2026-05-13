# Requirements — Sprint 15: Backoffice Enrichment + Clone Kit

**Fecha:** 2026-04-27
**Sprint:** 15
**Tipo:** FEATURE
**Depende de:** Sprint 14 completo (SP14-QA-001 ✅)

---

## Objetivo

Completar la visibilidad operacional en el backoffice para los datos específicos de cada vertical (temperatura y custodia en el detalle de viaje), entregar un editor de configuración de vertical en la interfaz admin, y documentar el proceso de clonación del repositorio para que cualquier equipo pueda adaptar la plataforma a un nuevo vertical en menos de 1 día de trabajo.

---

## Scope

| Incluye | Excluye |
|---|---|
| Tab "Temperatura" con gráfica en detalle de viaje | Charts en tiempo real (WebSocket) |
| Tab "Custodia" con timeline de eventos en detalle de viaje | Exportación PDF de cadena de custodia |
| Editor visual de features JSONB en VerticalesPage | Creación de nuevos verticales desde el UI (PATCH solo, no POST) |
| VERTICAL_CLONE_GUIDE.md + .env.vertical.example + seed template | CLI generador (scaffolding automático) |
| Playwright smoke tests para vertical editor + datos en detalle | Tests Detox E2E mobile (Sprint futuro) |

---

## Actores y stakeholders

| Actor | Interés en este sprint |
|---|---|
| Administrador | Ver historial de temperatura y cadena de custodia en detalle de viaje |
| Operador de negocio | Activar/desactivar features del vertical desde el panel sin deploy |
| Equipo de desarrollo externo | Clonar el repo y adaptar un nuevo vertical en < 1 día |
| Arquitecto | Garantizar que el Clone Kit refleja el estado real del código |

---

## Requerimientos funcionales

### RF-1501 — Detalle de viaje: datos de temperatura

**Como** administrador,  
**quiero** ver las lecturas de temperatura de un viaje cold-chain en el detalle de viaje,  
**para** verificar que la cadena de frío se mantuvo durante el trayecto.

**Criterios de aceptación:**
- [ ] El modal de detalle de viaje en `TripsPage` muestra tab "Temperatura" solo si el viaje tiene lecturas
- [ ] La tab muestra una gráfica de línea (Recharts LineChart) con el eje X = tiempo y eje Y = celsius
- [ ] Muestra resumen: min, max, avg y out_of_range_count
- [ ] Si el viaje no tiene lecturas (`GET /trips/:id/temperature` retorna array vacío), la tab no aparece
- [ ] La data se carga con `GET /trips/:id/temperature` desde el backoffice

### RF-1502 — Detalle de viaje: cadena de custodia

**Como** administrador,  
**quiero** ver la cadena de custodia de un viaje custody en el detalle de viaje,  
**para** auditar el manejo del bien custodiado y resolver disputas.

**Criterios de aceptación:**
- [ ] El modal de detalle de viaje muestra tab "Custodia" solo si el viaje tiene eventos
- [ ] La tab muestra un timeline vertical con: sequence, event_type, actor_name, occurred_at, notas
- [ ] Si hay `photo_url`, muestra un ícono de foto que el admin puede abrir en nueva pestaña
- [ ] Si el viaje no tiene eventos (`GET /trips/:id/custody` retorna array vacío), la tab no aparece

### RF-1503 — Editor de features del vertical

**Como** operador de negocio,  
**quiero** activar o desactivar features de un vertical desde el panel admin sin necesidad de deploy,  
**para** controlar qué capacidades están disponibles en cada vertical en producción.

**Criterios de aceptación:**
- [ ] En `VerticalesPage`, cada tarjeta de vertical tiene un botón "Editar"
- [ ] Al hacer clic abre un modal con toggles (Switch) para cada feature booleana del vertical
- [ ] El modal también permite editar `name` y `description`
- [ ] Al guardar se llama `PATCH /admin/verticals/:id` con los features actualizados
- [ ] El cambio se refleja inmediatamente en la tarjeta (sin recargar página)
- [ ] Solo los campos booleanos del JSONB se muestran como toggles; `pricingModel` como select

### RF-1504 — Clone Starter Kit

**Como** desarrollador externo,  
**quiero** una guía paso a paso para clonar este repositorio y adaptarlo a un nuevo vertical,  
**para** reducir el tiempo de setup de un nuevo proyecto a menos de 1 día.

**Criterios de aceptación:**
- [ ] `docs/VERTICAL_CLONE_GUIDE.md` existe con checklist de pasos numerados
- [ ] `.env.vertical.example` documenta todas las variables de entorno relevantes al vertical
- [ ] `apps/api/seeds/templates/vertical.template.ts` es un seed comentado que el clonador copia y adapta
- [ ] La guía incluye los comandos exactos para ejecutar migraciones + seeds + levantar el stack
- [ ] La guía incluye la sección "Por vertical" con los pasos específicos de taxi, custody y cold-chain como referencia

---

## Requerimientos no funcionales

- Recharts ya debe ser dependencia de `apps/web` (verificar package.json antes de implementar)
- Las queries `GET /trips/:id/temperature` y `GET /trips/:id/custody` se hacen solo cuando la tab está activa (lazy loading con `enabled: tab === 'temperatura'`)
- El Clone Kit no genera código — es documentación estática
- La guía de clonación debe ser verificable: cada paso tiene un comando o acción verificable

---

## Restricciones técnicas

- El editor de features JSONB solo soporta valores booleanos y string (select) — no estructuras JSONB anidadas
- `PATCH /admin/verticals/:id` ya existe (Sprint 10) — solo se consume desde el nuevo UI
- Recharts es la librería de gráficas elegida (consistente con el stack React existente; sin D3 directo)

---

## Decisiones pendientes

- Exportación PDF de cadena de custodia para fines legales (Sprint futuro — requiere PDF generation)
- Dashboard analytics por vertical (viajes por tipo, temperatura promedio por ruta) (Sprint futuro)
- Autenticación multi-empresa en el backoffice (acceso por empresa sin ver todos los viajes) (Sprint futuro)
