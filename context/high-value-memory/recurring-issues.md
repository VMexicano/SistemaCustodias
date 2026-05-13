# Recurring Issues — Memorias de Alto Valor

Bugs que aparecieron más de una vez + su fix validado.

---

## Web admin: navegación con `<a href>` expulsa al usuario

**Contexto:** Web admin — cualquier pantalla con navegación interna
**Hecho:** Usar `<a href="/ruta">` recarga la SPA y borra el token JWT en memoria.
**Fix:** Siempre usar `<Link to="/ruta">` de TanStack Router para rutas internas.
**Aplicar cuando:** Implementes navegación en el web admin. Nunca `<a href>` interno.

---

## API admin: respuestas son arrays directos, no `{ data: [...] }`

**Contexto:** Web admin — cualquier endpoint de configuración o listado
**Hecho:** Los endpoints GET del API devuelven el array directamente — no un objeto con `.data`.
**Fix:** Tipar las queries como `array` y no asumir envoltura. `const items = response` no `response.data`.
**Aplicar cuando:** Consumas un endpoint de listado desde el frontend. Verificar el contrato real.

---

## EADDRINUSE en puerto 3333: no reiniciar Docker, matar el proceso

**Contexto:** Backend local — arranque del API
**Hecho:** Si el API falla al iniciar con EADDRINUSE, hay un proceso Node.js huérfano en el puerto.
**Fix:** `npx kill-port 3333` o buscar PID con `netstat -ano | findstr 3333` y matar con `taskkill`.
**Aplicar cuando:** El API no levanta con error de puerto ocupado.

---

## GPS tracking: no enviar lecturas fuera de estados activos

**Contexto:** App mobile — `locationService.ts`
**Hecho:** Si se envían lecturas GPS cuando la orden no está en `EN_ROUTE_TO_PICKUP` o `IN_TRANSIT`, el backend las ignora silenciosamente pero gasta batería y red.
**Fix:** Verificar el estado de la orden en `locationStore` antes de enviar. Detener el tracker en otros estados.
**Aplicar cuando:** Implementes el GPS tracking en background.
