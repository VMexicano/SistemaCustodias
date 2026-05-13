# Integration Contracts

- Fecha: 2026-04-11
- Contexto: API admin
- Hecho validado: GET /admin/errors devuelve arreglo directo de errores.
- Impacto: El frontend no debe asumir objeto con propiedad data para este endpoint.
- Accion futura: Mantener consistencia de contratos o agregar adaptador en cliente API.

- Fecha: 2026-04-11
- Contexto: API admin-config
- Hecho validado: GET /admin/pricing/factors, /admin/commissions y /admin/trip-types devuelven arreglos directos.
- Impacto: Tipados incorrectos en frontend causan crash en render.
- Accion futura: Tipar queries como arrays y normalizar antes de map.
