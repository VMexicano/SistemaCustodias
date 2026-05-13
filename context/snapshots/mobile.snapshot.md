# Snapshot: mobile
> App React Native — dos flujos en una app: cliente y operador (custodio/copiloto).
> Última actualización: 2026-05-13 — Sprint 0

---

## Stack mobile

- Expo SDK 54 / React Native 0.81
- Zustand + MMKV (estado persistente)
- Mapbox (@rnmapbox/maps) para GPS y mapas
- Socket.io-client para tiempo real
- React Navigation + Expo Router
- React Query para fetching

---

## Estructura de pantallas

```
apps/mobile-v2/src/
  screens/
    auth/
      LoginScreen.tsx           (OTP por teléfono — todos los actores)
      VerifyOTPScreen.tsx
    client/
      HomeScreen.tsx            (mapa + botón "Solicitar custodia")
      NewOrderScreen.tsx        (formulario de nueva orden)
      OrderStatusScreen.tsx     (seguimiento en tiempo real)
      OrderHistoryScreen.tsx    (historial de órdenes)
      OrderDetailScreen.tsx     (detalle de orden)
    operator/
      HomeScreen.tsx            (mapa + estado de disponibilidad)
      OrderRequestScreen.tsx    (nueva orden asignada — aceptar/rechazar)
      ActiveOrderScreen.tsx     (orden activa — GPS + pánico + transiciones)
      OrderHistoryScreen.tsx    (historial como custodio/copiloto)
  navigators/
    RootNavigator.tsx           (divide flujo según role del usuario)
    ClientNavigator.tsx
    OperatorNavigator.tsx
  stores/
    authStore.ts                (usuario, token, role)
    orderStore.ts               (orden activa, historial)
    locationStore.ts            (GPS actual, heading, speed)
    alertStore.ts               (alertas activas)
  services/
    locationService.ts          (GPS continuo en background)
    socketService.ts            (WebSocket para tiempo real)
    pushService.ts              (FCM — setup y handlers)
```

---

## Flujo cliente

```
Login → Home (mapa)
  → NewOrderScreen (tipo de custodia, origen, destino, fecha/hora, declaración de valores)
  → OrderStatusScreen (seguimiento en tiempo real)
    → Ver ubicación del equipo en mapa
    → Notificaciones de cambio de estado
    → Firma digital al momento del pickup (AT_PICKUP → IN_TRANSIT)
  → OrderDetailScreen (historial y documentos)
```

---

## Flujo operador (custodio/copiloto)

```
Login → Home (mapa + toggle disponibilidad)
  → OrderRequestScreen (notificación push de nueva asignación)
    → Aceptar = CREW_CONFIRMED (ambos deben aceptar)
    → Rechazar = notifica al despachador para reasignación
  → ActiveOrderScreen (durante toda la orden activa)
    → GPS tracking continuo (background)
    → Mapa con ruta → pickup → delivery
    → Botones de transición: "Llegué al pickup", "Cargando", "En tránsito", etc.
    → BOTÓN DE PÁNICO (siempre visible, rojo, grande)
    → Lector de firma digital del cliente en pickup
    → Lector de firma digital del receptor en delivery
  → OrderHistoryScreen
```

---

## Pantalla crítica: ActiveOrderScreen

Durante IN_TRANSIT el operador ve:
- Mapa con ruta actual y destino
- Indicador de velocidad
- Tiempo estimado de llegada
- **Botón de pánico** — siempre visible, color rojo, requiere confirmación doble
- Botón "Reportar incidente" (menos urgente que pánico)
- Botón "Llegué al destino" al acercarse a la geocerca de entrega

---

## GPS tracking

- `locationService.ts` usa `expo-location` con permiso Background
- Envía lecturas cada 10 segundos durante EN_ROUTE_TO_PICKUP, IN_TRANSIT
- También emite por WebSocket para actualización en tiempo real del dashboard
- Se detiene automáticamente al entrar a DELIVERED o COMPLETED

---

## Stores (Zustand + MMKV)

```typescript
// authStore
{
  user: User | null;
  token: string | null;
  role: 'client' | 'custodio' | 'copiloto';
  setAuth(user, token): void;
  clearAuth(): void;
}

// orderStore
{
  activeOrder: CustodyOrder | null;
  orders: CustodyOrder[];
  setActiveOrder(order): void;
  updateOrderStatus(orderId, status): void;
}

// locationStore
{
  current: { lat: number; lng: number; heading: number; speed: number } | null;
  setLocation(loc): void;
}

// alertStore
{
  activeAlerts: SecurityAlert[];
  addAlert(alert): void;
  clearAlert(alertId): void;
}
```

---

## Reglas críticas de mobile

1. El botón de pánico está disponible **siempre** durante una orden activa — nunca lo escondas
2. La firma digital del cliente/receptor se captura en canvas directamente en la pantalla
3. El GPS tracking en background requiere el permiso `ACCESS_BACKGROUND_LOCATION`
4. Si el WebSocket se desconecta, el app sigue funcionando con polling HTTP cada 30s
5. Las acciones optimistas muestran feedback inmediato antes de la respuesta del API
6. Toda pantalla del flujo operador muestra el estado de la orden en un header persistente

---

## Dependencias entre módulos

- `auth` — Login y token JWT
- `custody-orders` — Toda la lógica de la orden
- `tracking` — Envío de GPS al backend
- `alerts` — Botón de pánico → POST /alerts
- `notifications` — Recepción de push notifications
- `value-declaration` — Formulario de nueva orden
