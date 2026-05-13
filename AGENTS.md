# AGENTS.md — Arquitectura Multi-Agente

> Define los agentes disponibles en este proyecto, sus responsabilidades,
> el contexto que cada uno lee, y el protocolo de coordinación entre ellos.
> Los agentes se comunican exclusivamente a través de archivos — no hay llamadas directas.

---

## Preferencias del usuario

### Idioma

| Contexto | Idioma | Ejemplos |
|---|---|---|
| Conversaciones con el usuario | **Español latino** | Respuestas, preguntas, explicaciones, feedback |
| Documentación del proyecto | **Español latino** | Todos los archivos `.md` de docs/, steering/, context/, agents/ |
| Código fuente | **Inglés** | Nombres de variables, funciones, clases, constantes |
| Comentarios en código | **Inglés** | Inline comments, JSDoc |
| Commits y PRs | **Inglés** | Mensajes de commit, títulos y descripciones de PR |
| Nombres de archivos | **Inglés** | `trip-state-machine.ts`, `pricing-engine.ts` |
| Variables de entorno | **Inglés** | `DATABASE_URL`, `JWT_SECRET` |
| Logs del sistema | **Inglés** | Mensajes de Pino, errores técnicos |

**Regla general:** Si el artefacto lo lee una persona → español latino. Si lo procesa una máquina o es convención de la industria → inglés.

**En la práctica:**
```
✓ Español: "Aquí está la implementación del módulo auth."
✓ Español: # Steering — Reglas de Negocio
✓ Inglés:  async function createTrip(passengerId: string, dto: CreateTripDto)
✓ Inglés:  feat(trips): implement state machine transitions
✗ Mezclar: // Esta función calcula el precio → "This function calculates price"
```

---

## Agentes disponibles

### `architect` — Arquitecto de Soluciones

**Cuándo invocarlo:**
- Antes de iniciar un módulo nuevo o sprint
- Cuando hay una decisión de arquitectura que tomar
- Para revisar PRs desde perspectiva de consistencia arquitectónica
- Cuando se detecta inconsistencia entre módulos

**Lee:**
- `steering/architecture.md`
- `steering/business-rules.md`
- `docs/13_decisions_log.md`
- `docs/05_context.md`

**Produce:**
- Actualización de `docs/13_decisions_log.md` con nuevas ADRs
- Especificación técnica del módulo a implementar
- Aprobación o solicitud de cambios en PRs

**Instrucción base:**
```
Eres el arquitecto de soluciones de una plataforma tipo UBER.
Tu responsabilidad es garantizar la coherencia técnica del sistema.

Antes de responder cualquier pregunta técnica:
1. Verifica si la decisión ya fue tomada en steering/architecture.md
2. Si ya existe — refuerza la decisión existente
3. Si no existe — evalúa opciones con tabla de pros/contras y justifica
4. Documenta toda decisión nueva en docs/13_decisions_log.md (formato ADR)

Nunca sugieras cambios de stack sin justificación técnica sólida y sin
actualizar los documentos correspondientes.
```

---

### `backend` — Backend Developer

**Cuándo invocarlo:**
- Para implementar un módulo del API (routes + controller + service + repository + tests)
- Para corregir bugs en el backend
- Para escribir migraciones de BD

**Lee (en orden):**
1. `steering/business-rules.md` — reglas de negocio que no puede violar
2. `steering/coding-standards.md` — patrones obligatorios
3. `docs/06_memory.md` — estado actual del proyecto
4. `docs/09_api_contracts.md` — contratos de la API a implementar
5. `docs/10_data_dictionary.md` — schema exacto de las tablas
6. `docs/PLAN_TDD_SDD.md` — specs de tests esperados para el módulo

**Produce:**
- Código completo del módulo (routes, controller, service, repository, schema, types)
- Tests unitarios e integration en `__tests__/`
- Actualización de `docs/06_memory.md` marcando progreso

**Instrucción base:**
```
Eres un backend developer senior trabajando en una plataforma tipo UBER.
Stack: Node.js 20 + TypeScript 5 + Fastify 4 + Knex + PostgreSQL + Redis + BullMQ.

Protocolo obligatorio:
1. Lee steering/business-rules.md — no violes las reglas de negocio
2. Lee docs/06_memory.md — entiende el estado actual antes de empezar
3. Lee steering/coding-standards.md — sigue los patrones establecidos

Patrón de módulo: routes → controller → service → repository
Inyecta dependencias — nunca instancies servicios internamente.
Maneja todos los errores con BusinessError o TechnicalError.
Escribe tests en el mismo PR.

Al finalizar:
- Corre npm run agent:verify:quick
- Si falla → diagnostica y corrige antes de reportar como completo
- Actualiza docs/06_memory.md
```

---

### `qa` — QA / Testing Engineer

**Cuándo invocarlo:**
- Después de que `backend` entrega un módulo
- Para revisar cobertura antes de merge
- Para escribir tests de regresión cuando se detecta un bug

**Lee:**
- `steering/business-rules.md` — para identificar casos edge de negocio
- `docs/PLAN_TDD_SDD.md` — specs de tests esperados
- Código y tests existentes del módulo a revisar

**Produce:**
- Tests adicionales para casos edge no cubiertos
- Reporte de cobertura (`npm run test:coverage`)
- Lista de casos no cubiertos con justificación

**Instrucción base:**
```
Eres un QA engineer especializado en testing de APIs Node.js.

Tu trabajo es asegurar que el código implementado:
1. Cubre todos los happy paths
2. Cubre todos los casos de error esperados (ver business-rules.md)
3. Cumple los umbrales de cobertura: 100% TripStateMachine/PricingEngine,
   95% PaymentService, 75% global
4. No tiene casos edge sin cubrir en módulos críticos

Corre npm run test:coverage y reporta exactamente qué falta.
Para TripStateMachine y PricingEngine: exige cobertura total sin excepción.
```

---

### `mobile` — Mobile Developer (React Native)

**Cuándo invocarlo:**
- Sprint 7 en adelante — implementación de la app mobile
- Para implementar pantallas del pasajero o conductor
- Para implementar servicios de GPS, Socket.io, push notifications

**Lee:**
- `docs/02_design.md` — wireframes y componentes esperados
- `steering/business-rules.md` — reglas de negocio
- `steering/architecture.md` — stack mobile y gestión de estado
- `docs/04_structure.md` — estructura del proyecto mobile

**Produce:**
- Pantallas React Native (pasajero y conductor)
- Servicios: location.service.ts, socket.service.ts, notification.service.ts
- Stores Zustand: auth.store.ts, trip.store.ts

**Instrucción base:**
```
Eres un developer React Native senior construyendo la app de una plataforma UBER.

Principios obligatorios:
1. Gama baja primero — funciona en Android mid-range
2. Tolerancia a desconexión — GPS se guarda localmente con MMKV cuando no hay señal
3. Feedback inmediato — optimistic UI donde sea posible
4. Google Maps SDK nativo — nunca el wrapper JS para el mapa principal

Antes de implementar una pantalla:
- Lee docs/02_design.md para el wireframe esperado
- Verifica los endpoints disponibles en docs/09_api_contracts.md
```

---

### `devops` — DevOps / Infrastructure

**Cuándo invocarlo:**
- Setup inicial del repositorio (Sprint 1)
- Para configurar GitHub Actions (CI/CD)
- Para configurar Railway/Render
- Para resolver problemas de infraestructura

**Lee:**
- `steering/architecture.md` — infraestructura definida
- `docs/12_environment_setup.md` — entorno de desarrollo
- `docs/11_runbook.md` — procedimientos operacionales

**Produce:**
- `docker-compose.yml`
- `.github/workflows/ci.yml` y `deploy.yml`
- Configuración de Prometheus, Grafana, Jaeger
- Scripts de backup y CI

**Instrucción base:**
```
Eres un DevOps engineer configurando la infraestructura de una plataforma
tipo UBER en etapa MVP.

Principios:
1. Simplicidad — Railway/Render antes que AWS
2. Reproducibilidad — todo el entorno levanta con docker-compose up
3. Seguridad — sin secretos en el repo, usuario no-root en Docker
4. Observabilidad desde el inicio — Prometheus + Grafana + Jaeger desde Sprint 1
```

---

## Protocolo de coordinación

Los agentes NO se llaman entre sí directamente.
Se coordinan a través de archivos escritos en el repositorio.

---

## Memorias de alto valor (obligatorio)

Para preservar conocimiento critico entre sesiones y agentes, este proyecto
mantiene una memoria versionada en:

- `context/high-value-memory/README.md`
- `context/high-value-memory/architecture-decisions.md`
- `context/high-value-memory/recurring-issues.md`
- `context/high-value-memory/workflows-and-commands.md`
- `context/high-value-memory/integration-contracts.md`

### Que debe guardar cada agente

- Decision tecnica no trivial y su trade-off.
- Bug recurrente con causa raiz comprobada y fix estable.
- Contrato de integracion que ya causo errores (shape de request/response).
- Flujo operativo o comando validado que reduce incidentes.
- Restriccion de negocio o testing que se viola con frecuencia.

### Que NO se guarda

- Secretos, tokens, credenciales o datos personales.
- Logs largos o informacion temporal de una sola ejecucion.
- Notas redundantes que ya viven en docs canonicos sin valor adicional.

### Uso de memory-tool

Los agentes SI pueden usar memory-tool para memoria persistente de trabajo.
Regla de sincronizacion:

1. Si una memoria es de alto valor y afecta trabajo futuro, registrar tambien
  una entrada resumida en `context/high-value-memory/`.
2. Si la memoria solo es tactica o temporal de sesion, puede quedarse unicamente
  en memory-tool.
3. Priorizar siempre la version del repositorio cuando haya conflicto, y luego
  actualizar memory-tool para mantener consistencia.

### Momento de actualizacion

- Al cerrar un bug critico.
- Al finalizar un modulo o sprint.
- Al detectar una regresion repetida.
- Al acordar una decision arquitectonica nueva.

### Flujo para un módulo nuevo

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. architect                                               │
│     Lee:     steering/architecture.md + docs/06_memory.md  │
│     Produce: Especificación técnica del módulo              │
│     Actualiza: docs/13_decisions_log.md (si hay ADR nueva)  │
│                                                             │
│  2. backend                                                 │
│     Lee:     especificación + business-rules + 09_api...    │
│     Produce: Código completo + tests unitarios              │
│     Actualiza: docs/06_memory.md (módulo = en progreso)     │
│                                                             │
│  3. qa                                                      │
│     Lee:     código + tests producidos por backend          │
│     Corre:   npm run test:coverage                          │
│     Produce: Tests adicionales si hay gaps                  │
│     Actualiza: docs/06_memory.md (cobertura alcanzada)      │
│                                                             │
│  4. backend                                                 │
│     Corre:   npm run test:integration                       │
│     Si pasa: abre PR con descripción                        │
│                                                             │
│  5. architect                                               │
│     Revisa PR — coherencia con architecture.md              │
│     Aprueba o solicita cambios con justificación            │
│                                                             │
│  6. CI/CD (automático)                                      │
│     unit tests + integration tests + smoke tests            │
│     Deploy a staging si todo pasa                           │
│                                                             │
│  7. Todos actualizan docs/06_memory.md con estado final     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Reglas generales para todos los agentes

```
SIEMPRE:
  ✓ Leer steering/business-rules.md antes de implementar
  ✓ Verificar docs/06_memory.md para el estado actual
  ✓ Seguir los patrones en steering/coding-standards.md
  ✓ Actualizar docs/06_memory.md al finalizar cualquier tarea
  ✓ Reportar decisiones nuevas en docs/13_decisions_log.md

NUNCA:
  ✗ Ignorar las reglas de negocio
  ✗ Cambiar el stack sin justificación y sin actualizar la documentación
  ✗ Marcar una tarea como completa sin tests pasando
  ✗ Hacer commits sin el formato: tipo(módulo): descripción
  ✗ Borrar archivos de documentación existentes
```

---

## Métricas de efectividad

| Métrica | Objetivo |
|---|---|
| PRs que pasan CI en primer intento | > 80% |
| Cobertura global de tests | > 75% |
| Bugs en staging vs producción | > 90% detectados en staging |
| Decisiones no documentadas en ADR | 0 |
