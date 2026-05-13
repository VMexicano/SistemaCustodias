# Context Router — UBER_BASE

> Este archivo define exactamente qué cargar según el tipo de tarea.
> Objetivo: máximo 2 snapshots + 1 archivo de steering por sesión.
> NUNCA cargar todos los docs al mismo tiempo.

---

## Cómo usar este router

1. Identifica el tipo de tarea en la tabla de abajo
2. Carga SOLO los archivos listados en "Cargar"
3. Ignora todo lo que esté en "Omitir"
4. Si necesitas más contexto, carga el doc completo referenciado

**Siempre en contexto (automático vía CLAUDE.md):**
```
context/project-index.md    ← Referencia técnica completa (schema, módulos, ADRs, patrones)
context/session.md          ← Estado de la sesión actual
```
> Nota: `steering/business-rules.md` NO se carga automáticamente — cargar solo cuando el tipo de tarea lo requiera (ver tabla abajo).

---

## Tabla de routing

### [PLANNING] — Planificación de sprint o tarea
```
Trigger: "qué sigue", "próximo sprint", "planear", "priorizar"

Cargar:
  context/session.md
  docs/06_memory.md           ← Estado actual de módulos
  steering/product.md         ← Fases y verticales
  docs/PLAN_TDD_SDD.md        ← Orden de implementación

Omitir: todos los snapshots individuales, docs técnicos
```

---

### [AUTH] — Módulo de autenticación
```
Trigger: auth, OTP, JWT, login, registro, refresh token, teléfono

Cargar:
  context/session.md
  context/snapshots/auth.snapshot.md
  steering/business-rules.md    (solo sección Auth)
  steering/coding-standards.md

Doc completo si necesitas:
  docs/09_api_contracts.md      (endpoints de /auth/*)
  docs/10_data_dictionary.md    (tablas: users, user_auth, user_roles)
```

---

### [DRIVERS] — Módulo de conductores
```
Trigger: conductor, driver, documentos, onboarding, disponibilidad, go-online

Cargar:
  context/session.md
  context/snapshots/drivers.snapshot.md
  steering/business-rules.md    (secciones R-DRV-*)

Doc completo si necesitas:
  docs/10_data_dictionary.md    (tablas: drivers, driver_documents, vehicles)
  docs/09_api_contracts.md      (endpoints de /drivers/*)
```

---

### [TRIPS] — Ciclo de vida del viaje (módulo crítico)
```
Trigger: viaje, trip, estado, state machine, aceptar, completar, cancelar,
         SEARCHING, ACCEPTED, IN_PROGRESS, COMPLETED

Cargar:
  context/session.md
  context/snapshots/trips.snapshot.md
  steering/business-rules.md    (secciones R-TRIP-*)
  steering/testing-standards.md (umbrales 100%)

Doc completo si necesitas:
  docs/10_data_dictionary.md    (tablas: trips, trip_status_history)
  docs/PLAN_TDD_SDD.md          (specs TripStateMachine)
```

---

### [PRICING] — Motor de precios
```
Trigger: precio, tarifa, factor, multiplier, IVA, pricing, fare, cotización

Cargar:
  context/session.md
  context/snapshots/pricing.snapshot.md
  steering/business-rules.md    (secciones R-PRICE-*)

Doc completo si necesitas:
  docs/10_data_dictionary.md    (tablas: trip_types, pricing_factors)
  docs/PLAN_TDD_SDD.md          (specs PricingEngine)
```

---

### [PAYMENTS] — Pagos con Stripe
```
Trigger: pago, Stripe, cobro, refund, reembolso, BullMQ payment, worker

Cargar:
  context/session.md
  context/snapshots/payments.snapshot.md
  steering/business-rules.md    (secciones R-PAY-*)

Doc completo si necesitas:
  docs/10_data_dictionary.md    (tablas: payments, passenger_payment_methods)
  docs/PLAN_TDD_SDD.md          (specs PaymentService)
```

---

### [TRACKING] — GPS y tiempo real
```
Trigger: GPS, ubicación, location, tracking, WebSocket, Socket.io, tiempo real,
         TimescaleDB, driver location

Cargar:
  context/session.md
  context/snapshots/tracking.snapshot.md
  steering/architecture.md      (sección Redis keys, TimescaleDB)

Doc completo si necesitas:
  docs/10_data_dictionary.md    (tabla: trip_locations)
  docs/03_tech.md               (configuración TimescaleDB)
```

---

### [NOTIFICATIONS] — Push, SMS, email
```
Trigger: notificación, FCM, push, SMS, Twilio, alerta, fallback

Cargar:
  context/session.md
  context/snapshots/notifications.snapshot.md
  steering/architecture.md      (sección Circuit breakers, fallbacks)
```

---

### [ADMIN] — Panel administrativo
```
Trigger: admin, dashboard, panel, operaciones, configuración, comisiones

Cargar:
  context/session.md
  context/snapshots/admin.snapshot.md
  steering/product.md           (actores: Administrador)
```

---

### [INFRA] — Infraestructura y DevOps
```
Trigger: docker, CI/CD, deploy, Railway, Render, migraciones, seeds,
         GitHub Actions, variables de entorno

Cargar:
  context/session.md
  context/snapshots/infra.snapshot.md
  steering/architecture.md

Doc completo si necesitas:
  docs/VERTICAL_CLONE_GUIDE.md  ← setup completo actualizado (usar este)
  docs/11_runbook.md
  ⚠️ docs/12_environment_setup.md está desactualizado — no usar
```

---

### [MOBILE] — App React Native
```
Trigger: mobile, React Native, pantalla, screen, pasajero app, conductor app,
         MMKV, Zustand, offline, Mapbox, vertical UX, cargo, custodia, temperatura

Cargar:
  context/session.md
  context/snapshots/mobile.snapshot.md
  steering/product.md           (actores + pantallas)
  steering/architecture.md      (sección Mobile)
```

---

### [ARCHITECTURE] — Decisiones técnicas
```
Trigger: ADR, arquitectura, stack, cambio técnico, nueva tecnología

Cargar:
  context/session.md
  steering/architecture.md      (completo)
  docs/13_decisions_log.md      (completo)
```

---

### [TESTING] — Tests y cobertura
```
Trigger: test, coverage, cobertura, Jest, Playwright, spec, TDD

Cargar:
  context/session.md
  steering/testing-standards.md (completo)
  docs/PLAN_TDD_SDD.md          (specs del módulo relevante)
  context/snapshots/{module}.snapshot.md
```

---

### [REVIEW] — Revisión de código
```
Trigger: revisar, review, PR, pull request, refactor, calidad

Cargar:
  context/session.md
  steering/coding-standards.md  (completo)
  steering/business-rules.md    (sección relevante)
  context/snapshots/{module}.snapshot.md
```

---

## Presupuesto de contexto por sesión

| Tipo de archivo | Tamaño aprox | ¿Cargar? |
|---|---|---|
| CLAUDE.md | ~2KB | Siempre (automático) |
| context/session.md | ~1KB | Siempre |
| steering/business-rules.md | ~5KB | Siempre |
| Un snapshot de módulo | ~1KB | Solo si aplica (máx 2) |
| Un archivo de steering | ~3KB | Solo si aplica (máx 1) |
| Doc completo (docs/*.md) | 5-15KB | Solo si se necesita profundidad |
| **Total objetivo** | **< 15KB** | |
| **Límite máximo** | **< 30KB** | Si supera esto, reducir |
