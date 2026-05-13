# Recurring Issues

- Fecha: 2026-04-11
- Contexto: Web admin, Dashboard y Configuracion
- Hecho validado: Se pierde sesion cuando se usa navegacion con a href porque recarga la SPA y borra token en memoria.
- Impacto: Expulsa al usuario a login en navegacion interna.
- Accion futura: Usar Link de TanStack Router para rutas internas del panel.

- Fecha: 2026-04-11
- Contexto: Web admin, Configuracion
- Hecho validado: El backend de admin-config responde arreglos directos y no objetos con propiedad data.
- Impacto: map sobre undefined rompe render con error en runtime.
- Accion futura: Normalizar respuestas del frontend antes de map y tipar acorde al contrato real.
