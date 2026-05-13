# Memorias de Alto Valor

Este directorio guarda memorias de alto valor que deben vivir dentro del repositorio.

Objetivo:
- Preservar decisiones y lecciones que impactan entregas futuras.
- Evitar perder contexto cuando cambia la sesión o el agente.
- Mantener trazabilidad en Git para auditoria del proyecto.

Reglas:
- Guardar solo informacion durable y reutilizable.
- Escribir en espanol latino para lectura humana.
- Mantener entradas breves y accionables.
- No guardar secretos, tokens, credenciales ni datos personales.

Estructura:
- architecture-decisions.md: decisiones tecnicas y trade-offs importantes.
- recurring-issues.md: bugs recurrentes, causa raiz y fix estable.
- workflows-and-commands.md: comandos y flujos validados del proyecto.
- integration-contracts.md: formas de respuesta y contratos clave entre modulos.

Formato sugerido por entrada:
- Fecha: YYYY-MM-DD
- Contexto: modulo o flujo
- Hecho validado: que se comprobo
- Impacto: por que importa
- Accion futura: como reusar o prevenir regresion
