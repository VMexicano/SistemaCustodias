# Workflows and Commands

- Fecha: 2026-04-11
- Contexto: Backend local
- Hecho validado: El API corre en 3333 desde apps/api/src/main.ts con pnpm --filter @uber-base/api dev.
- Impacto: Facilita reinicio y diagnostico de puertos.
- Accion futura: Si hay conflicto EADDRINUSE, identificar PID y reiniciar una sola instancia.

- Fecha: 2026-04-11
- Contexto: CORS local
- Hecho validado: En no produccion se permite origen * y en produccion se usa CORS_ORIGIN.
- Impacto: Evita bloqueos CORS en desarrollo web local.
- Accion futura: Verificar NODE_ENV y CORS_ORIGIN al cambiar puertos de frontend.
