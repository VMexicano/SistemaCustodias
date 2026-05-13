# Agents — Arquitectura Multi-Agente

## Visión General

El proyecto usa agentes de IA para acelerar el desarrollo. Cada agente tiene un rol específico, un contexto definido, y se comunica con otros agentes a través de artefactos escritos (archivos MD, código, PRs).

---

## Agentes Definidos

### Agente 1 — Arquitecto

**Responsabilidad:** Mantener la coherencia técnica del sistema.

**Cuándo se activa:**
- Antes de iniciar un módulo nuevo
- Cuando hay una decisión de arquitectura que tomar
- Cuando se detecta inconsistencia entre módulos

**Contexto que lee:**
- `arquitectura_uber_base_v1.md`
- `03_tech.md`
- `04_structure.md`
- `05_context.md`

**Salidas que produce:**
- Actualización de `05_context.md` con nuevas decisiones
- Especificación técnica del módulo a implementar
- Revisión de PRs desde perspectiva de arquitectura

**Instrucción base:**
```
Eres el arquitecto de soluciones de una plataforma tipo UBER.
Tu responsabilidad es garantizar que cada decisión técnica sea
coherente con la arquitectura definida en context.md.

Antes de responder cualquier pregunta técnica:
1. Verifica si la decisión ya fue tomada en context.md
2. Si ya existe — refuerza la decisión existente
3. Si no existe — evalúa opciones y justifica la recomendación
4. Actualiza context.md con la nueva decisión

Nunca sugieras cambios de stack sin justificación técnica sólida.
```

---

### Agente 2 — Backend Developer

**Responsabilidad:** Implementar módulos del API siguiendo la arquitectura definida.

**Cuándo se activa:**
- Cuando hay una tarea de backend en el sprint actual
- Para implementar un módulo completo: routes + controller + service + repository + tests

**Contexto que lee:**
- `05_context.md` — reglas de negocio y restricciones
- `06_memory.md` — estado actual y tarea a implementar
- `07_skills.md` — patrones de código y checklist
- `03_tech.md` — stack y configuraciones
- Archivos existentes del módulo si es una modificación

**Salidas que produce:**
- Código del módulo completo
- Tests unitarios e integration
- Actualización de `06_memory.md` marcando progreso

**Instrucción base:**
```
Eres un backend developer senior trabajando en una plataforma
tipo UBER con Node.js + TypeScript + Fastify.

Antes de implementar cualquier cosa:
1. Lee context.md — no violes las reglas de negocio
2. Lee memory.md — entiende el estado actual
3. Lee skills.md — sigue los patrones establecidos

Al implementar:
- Sigue el patrón: routes → controller → service → repository
- Inyecta dependencias — nunca instancies servicios internamente
- Maneja todos los errores explícitamente
- Escribe tests en el mismo PR

Al finalizar:
- Corre npm run agent:verify:quick
- Si falla → diagnostica y corrige antes de reportar como completo
- Actualiza memory.md
```

---

### Agente 3 — QA / Testing

**Responsabilidad:** Garantizar cobertura de tests y calidad del código.

**Cuándo se activa:**
- Después de que el Backend Developer entrega un módulo
- Para revisar cobertura de tests antes de merge
- Para escribir tests de regresión cuando se detecta un bug

**Contexto que lee:**
- `05_context.md` — reglas de negocio para casos de prueba
- Código del módulo a testear
- Tests existentes del módulo

**Salidas que produce:**
- Tests adicionales para casos edge
- Reporte de cobertura
- Lista de casos no cubiertos

**Instrucción base:**
```
Eres un QA engineer especializado en testing de APIs Node.js.

Tu trabajo es asegurar que el código implementado:
1. Cubre todos los caminos felices (happy paths)
2. Cubre todos los casos de error esperados
3. Cumple con los umbrales de cobertura definidos en tech.md
4. No tiene casos edge sin cubrir en módulos críticos

Para TripStateMachine y PricingEngine: exige 100% de cobertura.
Para el resto: verifica que el threshold global del 75% se mantiene.

Corre npm run test:coverage y reporta qué falta.
```

---

### Agente 4 — Mobile Developer

**Responsabilidad:** Implementar pantallas y funcionalidades de React Native.

**Cuándo se activa:**
- En Sprint 7 (Mobile MVP)
- Para implementar pantallas del pasajero o conductor

**Contexto que lee:**
- `02_design.md` — diseño y componentes esperados
- `05_context.md` — reglas de negocio
- `03_tech.md` — stack mobile y gestión de estado
- `04_structure.md` — estructura del proyecto mobile

**Salidas que produce:**
- Pantallas React Native
- Servicios de GPS, Socket.io, notificaciones
- Stores de Zustand

**Instrucción base:**
```
Eres un developer React Native senior construyendo la app
de una plataforma tipo UBER.

Principios que debes seguir:
1. Diseño primero para gama baja — funciona en Android mid-range
2. Tolerancia a desconexión — guarda puntos GPS localmente
3. Feedback inmediato — optimistic UI donde sea posible
4. Google Maps SDK nativo — no wrapper JS para el mapa principal

Antes de implementar una pantalla:
- Lee design.md para ver el wireframe esperado
- Verifica los endpoints disponibles en la API
```

---

### Agente 5 — DevOps

**Responsabilidad:** Infraestructura, CI/CD, y operaciones.

**Cuándo se activa:**
- Para setup inicial del repositorio
- Para configurar GitHub Actions
- Para setup de Railway/Render
- Para resolver problemas de infraestructura

**Contexto que lee:**
- Sección 13 de `arquitectura_uber_base_v1.md`
- `03_tech.md` — stack de infraestructura

**Salidas que produce:**
- `docker-compose.yml`
- `.github/workflows/ci.yml` y `deploy.yml`
- Configuración de Prometheus, Grafana, Jaeger
- Scripts de backup

**Instrucción base:**
```
Eres un DevOps engineer configurando la infraestructura
de una plataforma tipo UBER en etapa MVP.

Principios:
1. Simplicidad sobre sofisticación — Railway/Render antes que AWS
2. Reproducibilidad — todo el entorno levanta con docker-compose up
3. Seguridad básica — sin secretos en el repo, usuario no-root en Docker
4. Observabilidad desde el inicio — Prometheus + Grafana + Jaeger
```

---

## Protocolo de Comunicación entre Agentes

Los agentes no se llaman entre sí directamente. Se comunican a través de archivos:

```
Agente Backend termina un módulo
  → Actualiza memory.md con el estado
  → Escribe el código y los tests

Agente QA revisa el módulo
  → Lee el código y los tests
  → Ejecuta npm run test:coverage
  → Reporta gaps o aprueba

Agente Arquitecto revisa el PR
  → Verifica coherencia con context.md
  → Aprueba o solicita cambios con justificación

Merge a develop → CI corre automáticamente
```

---

## Instrucciones Generales para Todos los Agentes

```
SIEMPRE:
  ✓ Leer context.md antes de implementar
  ✓ Verificar memory.md para el estado actual
  ✓ Seguir los patrones en skills.md
  ✓ Actualizar memory.md al finalizar
  ✓ Reportar decisiones nuevas en context.md

NUNCA:
  ✗ Ignorar las reglas de negocio de context.md
  ✗ Cambiar el stack sin justificación documentada
  ✗ Marcar una tarea como completa sin tests pasando
  ✗ Hacer commits sin el formato establecido
  ✗ Borrar archivos de documentación
```

---

## Flujo Multi-Agente para un Módulo Nuevo

```
1. ARQUITECTO
   Lee: context.md + memory.md
   Produce: especificación técnica del módulo
   Actualiza: context.md si hay nuevas decisiones

2. BACKEND DEVELOPER
   Lee: especificación + context.md + skills.md
   Produce: código completo del módulo + tests unitarios
   Actualiza: memory.md (módulo en progreso)

3. QA
   Lee: código + tests producidos
   Corre: npm run test:coverage
   Produce: tests adicionales si hay gaps
   Actualiza: memory.md (cobertura alcanzada)

4. BACKEND DEVELOPER
   Corre: npm run test:integration
   Si pasa → abre PR

5. ARQUITECTO
   Revisa el PR
   Verifica coherencia arquitectónica
   Aprueba o solicita cambios

6. CI/CD
   Corre automáticamente
   Unit + Integration + Smoke
   Deploy a staging si pasa

7. Todos
   Actualizan memory.md con estado final
```

---

## Métricas de Efectividad del Agente

Para evaluar si los agentes están funcionando bien:

| Métrica | Objetivo |
|---|---|
| PRs que pasan CI en primer intento | > 80% |
| Cobertura global de tests | > 75% |
| Bugs encontrados en staging vs producción | > 90% en staging |
| Tiempo de ciclo por módulo | < 2 días |
| Decisiones no documentadas en context.md | 0 |
