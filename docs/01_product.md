# Product — SistemaCustodias

Documento de producto para el sistema de custodia de valores. Ver versión compacta en `steering/product.md`.

---

## Qué es

Plataforma digital para la gestión completa de servicios de custodia de valores: solicitud, aprobación supervisada, asignación de equipo, seguimiento GPS en tiempo real, cadena de custodia digital y documentación regulatoria.

---

## Actores y motivaciones

### Cliente
Empresa o persona que necesita transportar valores de forma segura.
- **Solicita** el servicio desde la app o web
- **Declara** el tipo y valor de lo que transporta
- **Firma digitalmente** al entregar el cargo al equipo
- **Hace seguimiento** en tiempo real desde la app

**Pain point actual:** Coordinación por teléfono, sin visibilidad, sin evidencia digital.

### Custodio
Operador principal de la unidad de transporte seguro.
- Recibe la asignación en la app
- Confirma y ejecuta el servicio
- Registra cada etapa (llegada, carga, entrega)
- Activa botón de pánico ante incidentes

**Pain point actual:** Instrucciones por radio, sin registro formal, sin respaldo ante incidentes.

### Copiloto
Acompañante de seguridad de la unidad. Parte obligatoria del equipo (regla dos-personas).
- Confirma la asignación independientemente del custodio
- Co-responsable del cargo durante el tránsito
- Puede activar alertas de seguridad

### Despachador
Operador central que coordina los servicios.
- Crea órdenes en nombre del cliente si es necesario
- Asigna equipos disponibles (custodio + copiloto)
- Monitorea todas las unidades activas en el mapa
- Responde a alertas de nivel medio

### Supervisor
Responsable de la operación y cumplimiento.
- Aprueba o rechaza órdenes antes de ejecutarse
- Responde a alertas críticas (botón de pánico)
- Puede suspender operadores
- Descarga reportes de cadena de custodia para auditorías

---

## Tipos de custodia (MVP)

Diseñados para ser extensibles sin código adicional (ADR-004).

### `cash_transport` — Transporte de efectivo
Efectivo, cheques, billetes, documentos bancarios.

Declaración requerida:
```json
{
  "amount_mxn": 500000,
  "currency": "MXN",
  "denomination_breakdown": { "1000": 100, "500": 500, "200": 250 }
}
```

### `high_value_package` — Paquetería de alto valor
Joyería, electrónicos, mercancía costosa.

Declaración requerida:
```json
{
  "description": "Relojes Rolex modelo Datejust x3",
  "estimated_value_mxn": 750000,
  "insurance_required": true,
  "insurance_policy_id": "POL-2026-00123"
}
```

### `confidential_docs` — Documentos confidenciales
Documentos legales, notariales, corporativos, expedientes.

Declaración requerida:
```json
{
  "document_type": "escritura_notarial",
  "issuing_entity": "Notaria 45 CDMX",
  "sensitivity_level": "high",
  "document_count": 3
}
```

### `vip_escort` — Escolta de personas
Protección y acompañamiento de personas VIP o en riesgo.

Declaración requerida:
```json
{
  "person_name": "Nombre Apellido",
  "threat_level": "medium",
  "route_restrictions": ["avoid_highway_15", "no_tunnels"],
  "contact_emergency": "+52 55 1234 5678"
}
```

---

## Flujo principal de una orden

### Fase 1: Solicitud
```
Cliente o Despachador
  → Crea orden (DRAFT)
  → Selecciona tipo de custodia
  → Llena declaración de valores (schema según tipo)
  → Define origen, destino y ventana de tiempo
  → Envía a aprobación (PENDING_APPROVAL)
```

### Fase 2: Aprobación
```
Supervisor
  → Recibe notificación (push + SMS)
  → Revisa declaración de valores y ruta
  → Aprueba (APPROVED) → se congela pricing_snapshot
  → O rechaza con motivo obligatorio (REJECTED)
```

### Fase 3: Asignación
```
Despachador
  → Ve órdenes en APPROVED
  → Selecciona custodio disponible + copiloto disponible
  → Asigna (ASSIGNED)

Custodio (en app)
  → Recibe notificación
  → Revisa detalles de la orden
  → Acepta (contribuye a CREW_CONFIRMED)

Copiloto (en app)
  → Recibe notificación independiente
  → Acepta (completa CREW_CONFIRMED)
```

### Fase 4: Ejecución
```
Custodio/Copiloto (en app)
  → Marca salida hacia pickup (EN_ROUTE_TO_PICKUP)
  → GPS tracking activo — visible en dashboard y app del cliente
  → Llega al punto de recolección (AT_PICKUP)
  → Cliente firma digitalmente en la pantalla del custodio
  → Carga el cargo (IN_TRANSIT) → se genera custody_snapshot inmutable

  [Durante IN_TRANSIT]
  → GPS tracking continuo
  → Verificación automática de geocerca
  → Botón de pánico siempre visible

  → Llega al destino (AT_DELIVERY)
  → Receptor firma digitalmente
  → Entrega completada (DELIVERED)
```

### Fase 5: Cierre
```
Sistema/Despachador
  → Cierra la orden (COMPLETED)
  → Se procesa el pago
  → Se genera reporte de cadena de custodia (PDF descargable)
```

---

## Principios de UX

### Para operadores (custodio/copiloto)
1. **Fluidez en campo** — Botones grandes, acciones claras, sin lecturas largas
2. **Pánico nunca oculto** — El botón de pánico es rojo, grande, siempre visible en orden activa
3. **Firma rápida** — Canvas con dedo en pantalla táctil — no requiere hardware adicional
4. **Offline-first** — Las acciones se encolan si hay pérdida de señal y se sincronizan

### Para clientes
1. **Visibilidad total** — Saben en todo momento dónde está su cargo
2. **Historial claro** — Pueden ver cada etapa de la orden con timestamps
3. **Notificaciones útiles** — Alertas en momentos clave, no spam

### Para despachadores y supervisores
1. **Mapa en tiempo real** — Todas las unidades activas visibles simultáneamente
2. **Acciones en contexto** — Aprobar, asignar y responder alertas sin cambiar de pantalla
3. **Reportes accesibles** — Cadena de custodia descargable en un clic

---

## Roadmap de tipos de custodia

Los siguientes tipos están en el backlog para sprints futuros:
- `cold_chain` — Transporte refrigerado (medicamentos, alimentos sensibles)
- `hazmat_transport` — Materiales peligrosos con protocolos especiales
- `vehicle_escort` — Escolta de vehículos de valor

Agregar cualquiera de estos = INSERT en `custody_types` + configurar el JSON Schema de la declaración.
