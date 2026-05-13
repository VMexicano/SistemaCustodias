# Memorias de Alto Valor — SistemaCustodias

Directorio de memorias durables entre sesiones. Ver estrategia completa en `context/STRATEGY.md`.

## Índice de memorias activas

| Archivo | Contenido | Última actualización |
|---|---|---|
| `architecture-decisions.md` | Decisiones técnicas no-obvias con su razón | 2026-05-13 |
| `recurring-issues.md` | Bugs que vuelven + su fix validado | 2026-05-13 |
| `integration-contracts.md` | Contratos no-obvios entre módulos | 2026-05-13 |
| `workflows-and-commands.md` | Comandos CLI validados del proyecto | 2026-05-13 |

## Reglas (resumen rápido)

- Cada entrada: **≤ 5 líneas** (contexto + decisión + razón + cuándo aplicar)
- Cada archivo: **≤ 50 líneas activas**
- Solo lo que **sorprendería** a un agente que no estuvo en la sesión
- Ver `context/STRATEGY.md` para el formato completo y taxonomía

## Cuándo escribir aquí

```
¿Volvió a aparecer un bug? → recurring-issues.md
¿Dos módulos se comunican de forma no-obvia? → integration-contracts.md
¿Tomé una decisión que parece inconsistente pero tiene razón? → architecture-decisions.md
¿Descubrí un comando que no está en docs? → workflows-and-commands.md
```
