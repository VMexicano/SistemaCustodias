Vamos a cerrar la sesión. Ejecuta estos pasos en orden:

**Paso 1:** Lee context/session.md para revisar qué se hizo.

**Paso 2:** Para cada módulo trabajado esta sesión, actualiza su snapshot en context/snapshots/{module}.snapshot.md:
- Cambia el estado (🔄 En progreso / ✅ Completo / 🔲 No iniciado)
- Actualiza el % de implementación y cobertura de tests
- Actualiza "Última actualización" con la fecha de hoy

**Paso 3:** Actualiza docs/06_memory.md:
- Marca las tareas completadas
- Actualiza el estado de los módulos en la tabla
- Agrega notas técnicas si hay algo relevante
- Actualiza la fecha al inicio del documento

**Paso 4:** Agrega una nueva entrada al inicio de la sección "Sesiones" en context/conversation-log.md con el formato:

```
### [YYYY-MM-DD] — Título descriptivo de la sesión

**Agentes usados:** [lista]
**Módulos tocados:** [lista]
**Tipo de contexto:** [tags del router]

#### Qué se hizo
- [lista de lo que se implementó/decidió]

#### Estado resultante
| Módulo | Estado antes | Estado después |
|---|---|---|

#### Decisiones tomadas
- [ADR nueva si aplica, o "Ninguna"]

#### Próximo paso
[siguiente tarea concreta]

#### Bloqueos
[Ninguno / descripción]
```

**Paso 5:** Actualiza context/session.md con el estado al cierre (próximo paso, bloqueos, pendientes).

**Paso 6:** Muéstrame un resumen de 3-5 bullets de lo que se logró en esta sesión.
