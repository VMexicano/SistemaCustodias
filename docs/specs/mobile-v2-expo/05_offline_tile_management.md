# Offline Tile Management — Feature Spec

**Feature:** Gestión dinámica de tiles de mapa sin conexión  
**Módulo:** `apps/mobile-v2` — Driver experience  
**Prioridad:** Media-alta (impacta experiencia del conductor en zonas con cobertura débil)  
**Dependencia previa:** Self-hosted tile server operativo (ver sección Infraestructura)

---

## Problema

El mapa de conductor depende de tiles descargados en tiempo real desde Mapbox. En zonas con señal débil, carreteras o durante pérdida temporal de datos, el mapa queda en blanco. Para un conductor en ruta esto es un riesgo operativo real.

Mapbox cobra por tiles descargados — descargar tiles de forma indiscriminada (radio fijo o pantalla completa) genera costos innecesarios y desperdicia almacenamiento del dispositivo.

---

## Solución

Sistema de cuatro capas progresivas, activadas según el contexto del conductor:

```
Capa 1 — Pack base CDMX          (instalación única, WiFi, zoom 10-14)
Capa 2 — Pack dinámico por zona   (background, zoom 15-17, radio 25 km)
Capa 3 — Pre-fetch de ruta        (al aceptar viaje, corredor de ruta + alternativas)
Capa 4 — Detector de desvío       (reactivo, mini-fetch al salirse de ruta conocida)
```

---

## Infraestructura requerida

### Tile server self-hosted

Servidor propio con tiles de OpenStreetMap (gratuito, sin cuota por request).

| Componente | Tecnología | Descripción |
|---|---|---|
| Tile server | `tileserver-gl` | Sirve tiles vectoriales/raster desde archivos MBTiles |
| Datos | OpenStreetMap MBTiles CDMX | Archivo ~800 MB descargado de `download.geofabrik.de` |
| Cache | Nginx + disco | Cache HTTP de tiles ya servidos, TTL 30 días |
| Metadata | Redis | Registra qué packs tiene cada conductor y cuándo los descargó |

**Endpoint de tiles:** `https://tiles.ridebase.app/{z}/{x}/{y}.pbf`

La app apunta a este endpoint en lugar de Mapbox para el mapa base. Mapbox Directions API se sigue usando solo para cálculo de rutas (request único al aceptar viaje, no tiles).

---

## Capas de detalle

### Capa 1 — Pack base CDMX

- **Cuándo:** Una sola vez al registrarse el conductor como activo por primera vez
- **Qué:** Zoom 10-14 de la Zona Metropolitana del Valle de México (ZMVM)
- **Tamaño estimado:** ~80-120 MB a zoom 14 máximo
- **Condición de descarga:** Solo en WiFi
- **Almacenamiento:** Filesystem local del dispositivo vía `MapboxGL.offlineManager`
- **Nunca se elimina** — es el fallback final cuando no hay señal ni pack dinámico

```
ZoomLevel 10: overview ciudad (~10 tiles)
ZoomLevel 12: barrios y colonias
ZoomLevel 14: calles principales
```

### Capa 2 — Pack dinámico por zona

- **Cuándo:** Al ponerse online el conductor, en background
- **Qué:** Zoom 15-17 (detalle de calle) centrado en posición actual, radio 25 km
- **Tamaño estimado:** ~25-35 MB por pack
- **Trigger de re-descarga:** Conductor se aleja >15 km del centro del pack activo
- **Overlap:** Mantiene el pack anterior activo hasta que el nuevo esté completo (evita quedarse sin tiles durante transición)
- **Límite activos simultáneos:** 2 packs (actual + anterior durante transición), luego elimina el más antiguo

```
Pack activo:   centro=posición_actual, radio=25 km
Pack anterior: se elimina cuando nuevo pack alcanza 100% de descarga
```

**Redis metadata:**
```
tile_pack:{driver_id} → {
  centerLat, centerLng,
  radiusKm: 25,
  zoomMin: 15, zoomMax: 17,
  downloadedAt: timestamp,
  status: "complete" | "downloading" | "stale"
}
```

### Capa 3 — Pre-fetch de ruta al aceptar viaje

- **Cuándo:** Inmediatamente después de `PATCH /trips/:id/accept`
- **Input:** Coordenadas de ruta ya calculadas (Directions API, disponibles en `driver.store`)
- **Qué descarga:**
  - Ruta principal: corredor de ~1 km a cada lado de la polilínea
  - Rutas alternativas: `alternatives=true` en el request de Directions ya devuelve hasta 3 rutas
  - Buffer adaptativo según tipo de vía:
    - Autopista/carretera: ±500 m
    - Vialidad primaria urbana: ±1.5 km
    - Centro histórico / zona densa: ±2 km
- **Zoom:** 14-17
- **Orden de descarga:** De la posición actual del conductor hacia el destino (prioriza lo que necesita antes)
- **Head start:** El conductor tarda ~3-5 min en llegar al origen — tiempo suficiente para descargar el corredor completo

**Cálculo de tiles desde polilínea:**
```typescript
function tilesForRoute(coords: [number, number][], zoom: number, bufferKm: number): TileXYZ[] {
  // Para cada punto de la ruta, calcular tile XYZ
  // tile_x = floor((lng + 180) / 360 * 2^z)
  // tile_y = floor((1 - ln(tan(lat*π/180) + sec(lat*π/180)) / π) / 2 * 2^z)
  // Expandir buffer_tiles = ceil(bufferKm / tileWidthKm(zoom))
  // Deduplicar con Set<string> usando "z/x/y" como key
}
```

**Tiles a descargar = tiles(ruta_principal) ∪ tiles(alt_1) ∪ tiles(alt_2) − tiles_ya_en_cache**

### Capa 4 — Detector de desvío reactivo

- **Cuándo:** Durante viaje activo, en polling cada 10 s
- **Condición de trigger:** Conductor >400 m fuera de cualquier ruta conocida (principal + alternativas) durante >20 s consecutivos
- **Acción:** 
  1. Fetch tiles radio 2 km alrededor de posición actual (zoom 15-17)
  2. Re-calcular ruta desde posición actual → destino (nuevo request a Directions)
  3. Pre-fetch corredor de nueva ruta
- **Throttle:** Máximo 1 re-fetch reactivo cada 2 minutos (evita loop si el conductor sigue desviándose)

---

## Política de limpieza de tiles

| Condición | Acción |
|---|---|
| Pack dinámico con centro >50 km de posición actual | Eliminar |
| Pack de ruta de viaje completado/cancelado hace >24 h | Eliminar |
| Pack anterior durante transición una vez nuevo = 100% | Eliminar |
| Almacenamiento del dispositivo <200 MB libre | Eliminar todos excepto pack base |

La limpieza corre en background al arrancar la app y al completar cada viaje.

---

## Flujo completo del conductor

```
Instalación
└── [WiFi] Descarga pack base CDMX (zoom 10-14, ~100 MB) → solo una vez

Se pone online
└── [Background] Verifica pack dinámico zona actual
    ├── Si es reciente (<2 h) → no hace nada
    └── Si es viejo o no existe → descarga pack dinámico (zoom 15-17, ~30 MB)

Llega solicitud de viaje
└── [OnlineScreen] Mapbox Directions con alternatives=true → calcula 3 rutas
    └── Muestra preview en mapa (ya implementado)

Acepta viaje
└── [TripRequestModal.handleAccept()] 
    ├── PATCH /trips/:id/accept
    ├── LocationService.startTracking()
    └── TilePreloader.preloadRoute(routeCoords, alternatives) → background

Durante el viaje
├── watchPositionAsync actualiza marcador cada 3 s (sin requests, 100% local)
├── [Capa 4] TileDeviationDetector polling cada 10 s
│   └── Si desvío detectado → mini-fetch + re-route
└── Tiles sirviéndose desde cache local (tileserver-gl → dispositivo)

Viaje completado
└── [Cleanup] Elimina tiles de ruta >24 h
    └── Verifica pack dinámico zona actual para siguiente viaje
```

---

## Sin señal — comportamiento de degradación

```
Señal disponible    → Tiles desde tileserver-gl (self-hosted)
Sin señal, en ruta  → Tiles desde cache local (Capas 3+2+1 en ese orden)
Sin señal, zona nueva → Mapa base zoom 10-14 (Capa 1 siempre disponible)
Sin datos + sin pack → Mapa en blanco solo en zonas no cubiertas por pack base
```

---

## TilePackManager — interfaz del servicio

```typescript
interface TilePackManager {
  // Capa 1
  ensureBasePack(): Promise<void>;
  
  // Capa 2  
  refreshDynamicPack(lat: number, lng: number): Promise<void>;
  shouldRefreshDynamicPack(lat: number, lng: number): boolean; // >15 km del centro actual

  // Capa 3
  preloadRoute(routes: RouteGeometry[], driverLat: number, driverLng: number): Promise<void>;
  
  // Capa 4
  startDeviationDetector(tripId: string, knownRoutes: RouteGeometry[]): void;
  stopDeviationDetector(): void;

  // Limpieza
  cleanup(): Promise<void>;
}
```

---

## Sprint plan

Ver sección **Sprint 16 — Offline Tile Management** en `03_sprints.md`.

---

## Métricas de éxito

| Métrica | Objetivo |
|---|---|
| % de viajes completados sin pantalla de mapa en blanco | ≥ 99% |
| Requests a tileserver durante viaje activo | 0 (100% desde cache local) |
| Tamaño promedio de tiles por viaje descargados proactivamente | < 15 MB |
| Tiempo de descarga del pack de ruta antes de llegar al origen | < 60 s en 4G |
| Tiles descargados y nunca vistos (waste) | < 20% |

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| MBTiles de CDMX desactualizado (OSM) | Refresh mensual automatizado desde Geofabrik |
| Límite de tiles de Mapbox offline manager excedido | Usar solo zoom 15-17 en packs dinámicos; zoom 10-14 en pack base (menos tiles) |
| Conductor instala en dispositivo con poco almacenamiento | Política de limpieza agresiva + advertencia si disco <500 MB al registrarse |
| tileserver-gl caído → sin mapa en línea | Fallback a Mapbox CDN con bandera de feature flag en backend |
