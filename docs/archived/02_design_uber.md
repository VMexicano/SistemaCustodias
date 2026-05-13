# Design — Plataforma Tipo UBER

## Principios de Diseño

| Principio | Descripción |
|---|---|
| Claridad sobre estética | Cada elemento debe comunicar estado o acción, no solo verse bien |
| Tiempo real como prioridad | El usuario siempre debe saber qué está pasando |
| Feedback inmediato | Toda acción tiene respuesta visual en menos de 200ms |
| Accesibilidad móvil | Diseñado para uso en movimiento, una mano, sol directo |
| Gama baja primero | Funciona en dispositivos Android de gama media-baja |

---

## Paleta de Colores

### Sistema principal
| Token | Hex | Uso |
|---|---|---|
| `primary-900` | `#1F3864` | Headers, títulos principales |
| `primary-600` | `#2E75B6` | Botones primarios, links, estados activos |
| `primary-100` | `#EBF3FB` | Fondos de cards, estados hover |
| `primary-50`  | `#F4F9FD` | Fondo general de pantallas |

### Semánticos
| Token | Hex | Uso |
|---|---|---|
| `success-500` | `#28A745` | Viaje completado, conductor disponible |
| `warning-500` | `#FFC107` | Conductor en camino, documentos por vencer |
| `error-500`   | `#DC3545` | Cancelaciones, errores, conductor suspendido |
| `neutral-500` | `#6C757D` | Texto secundario, estados inactivos |

### Mapa
| Token | Hex | Uso |
|---|---|---|
| `map-driver`    | `#2E75B6` | Pin del conductor |
| `map-passenger` | `#28A745` | Pin del pasajero / origen |
| `map-destination` | `#DC3545` | Pin del destino |
| `map-route`     | `#1F3864` | Línea de ruta |

---

## Tipografía

| Uso | Fuente | Tamaño | Peso |
|---|---|---|---|
| Títulos pantalla | Inter | 24px | 700 |
| Subtítulos | Inter | 18px | 600 |
| Cuerpo | Inter | 14px | 400 |
| Labels y chips | Inter | 12px | 500 |
| Precio / dato clave | Inter | 32px | 700 |

---

## Componentes Clave

### App del Pasajero

#### Pantalla principal (mapa)
```
┌─────────────────────────────┐
│  [Avatar]  ¿A dónde vas?    │  ← barra de búsqueda prominente
│                             │
│         [MAPA]              │  ← ocupa 70% de la pantalla
│                             │
│   ┌─────────────────────┐   │
│   │  Destino reciente   │   │  ← sugerencias
│   │  Casa / Trabajo     │   │
│   └─────────────────────┘   │
└─────────────────────────────┘
```

#### Pantalla de cotización
```
┌─────────────────────────────┐
│  [←]  Elige tu viaje        │
│                             │
│  ┌─────────────────────┐    │
│  │ ● Basic    $58.00   │ ←  │  ← card seleccionable
│  │   4 min · 3.2 km    │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │   Plus     $75.00   │    │
│  │   4 min · 3.2 km    │    │
│  └─────────────────────┘    │
│                             │
│  [Visa ···4242  ▼]          │  ← método de pago
│                             │
│  [    Solicitar Basic    ]   │  ← CTA primario
└─────────────────────────────┘
```

#### Pantalla de viaje activo
```
┌─────────────────────────────┐
│                             │
│         [MAPA + GPS]        │  ← mapa ocupa 60%
│     🚗 ← conductor         │
│                             │
├─────────────────────────────┤
│  Carlos M.  ⭐ 4.8          │
│  Toyota Corolla · ABC-1234  │
│  Llega en ~4 min            │
│                             │
│  [Contactar]  [Cancelar]    │
└─────────────────────────────┘
```

### App del Conductor

#### Pantalla online (esperando viajes)
```
┌─────────────────────────────┐
│  Estás en línea  ●          │  ← toggle prominente
│  Ganancias hoy: $342        │
│                             │
│         [MAPA]              │
│                             │
└─────────────────────────────┘
```

#### Solicitud de viaje (modal urgente)
```
┌─────────────────────────────┐
│  Nueva solicitud            │
│  ──────────────             │
│  📍 Col. Narvarte           │  ← origen
│  🏁 Pedregal de Carrasco    │  ← destino
│                             │
│  3.2 km · ~18 min           │
│  Ganancia estimada: $52     │
│                             │
│  [████████░░░░] 30 seg      │  ← countdown visual
│                             │
│  [ Rechazar ]  [ Aceptar ]  │
└─────────────────────────────┘
```

#### Durante el viaje
```
┌─────────────────────────────┐
│  En camino al pasajero      │
│         [MAPA + RUTA]       │
├─────────────────────────────┤
│  Andrea L.  ⭐ 4.9          │
│  📍 Col. Narvarte           │
│  ETA: 4 min                 │
│                             │
│  [Llamar]  [Ya llegué ✓]   │
└─────────────────────────────┘
```

### Panel Admin Web

#### Dashboard
```
┌──────────────────────────────────────────────────────┐
│  🚗 47 viajes activos  👥 183 conductores  💰 $34,291 │
├─────────────────────┬────────────────────────────────┤
│                     │  ⚠ Alertas (2)                │
│    MAPA EN TIEMPO   │  · Cola de pagos: 3 pendientes │
│       REAL          │  · Conductor sin docs: 5       │
│                     │                                │
│  (conductores +     ├────────────────────────────────┤
│   viajes activos)   │  Últimas cancelaciones         │
│                     │  Tasa hoy: 8.2% ↓              │
└─────────────────────┴────────────────────────────────┘
```

---

## Estados Visuales por Entidad

### Conductor (chips de color)
| Estado | Color | Label |
|---|---|---|
| `pending` | Gris | Pendiente |
| `documents_submitted` | Azul | Docs enviados |
| `under_review` | Amarillo | En revisión |
| `approved` + online | Verde | En línea |
| `approved` + offline | Gris oscuro | Fuera de línea |
| `suspended` | Naranja | Suspendido |
| `banned` | Rojo | Bloqueado |

### Viaje (chips de color)
| Estado | Color |
|---|---|
| `requested` / `searching` | Azul claro |
| `accepted` / `driver_en_route` | Azul |
| `driver_arrived` | Amarillo |
| `in_progress` | Verde |
| `completed` | Gris |
| `cancelled_*` / `no_show` | Rojo claro |

---

## Patrones de UX

### Feedback de carga
- Skeleton screens en lugar de spinners para listas
- Optimistic UI: actualizar estado local antes de confirmar con servidor
- Error states con acción clara de retry

### Mapas
- El mapa nunca bloquea la UI principal
- El conductor siempre visible con animación suave de movimiento
- ETA actualizado cada 30 segundos visible sin abrir ningún modal

### Notificaciones push
| Evento | Título | Cuerpo |
|---|---|---|
| Conductor asignado | Tu viaje fue aceptado | Carlos llegará en ~4 min en Toyota Corolla ABC-1234 |
| Conductor llegó | Tu conductor llegó | Carlos te está esperando en Col. Narvarte |
| Viaje completado | Viaje completado | $98.83 · Califica a Carlos |
| Nueva solicitud (conductor) | Nueva solicitud | 3.2 km · Ganancia ~$52 |

---

## Accesibilidad

- Contraste mínimo WCAG AA en todos los textos
- Áreas táctiles mínimo 44×44px
- Labels descriptivos en todos los botones de acción
- Soporte para modo oscuro en Fase 2
- Tamaño de fuente mínimo 14px en mobile

---

## Diseño para Conectividad Baja

- Assets cacheados localmente en primera carga
- Mapa en modo offline con última posición conocida
- Indicador visible cuando no hay conexión
- Cola local de acciones pendientes — se sincronizan al recuperar señal
- Imágenes de documentos comprimidas al subir (max 2MB)
