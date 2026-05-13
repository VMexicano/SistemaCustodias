# Sprint 12 — Diseño: Mobile Vertical-aware

## Arquitectura al finalizar el sprint

```
apps/mobile-v2/src/
├── config/
│   └── env.ts              ✅ + verticalSlug: extra.verticalSlug ?? 'taxi'
├── stores/
│   ├── auth.store.ts        ✅ sin cambios
│   ├── trip.store.ts        ✅ sin cambios
│   └── vertical.store.ts   🆕 Zustand + MMKV + fetch GET /config
├── hooks/
│   └── useVerticalFeatures.ts 🆕 acceso tipado al store
├── screens/
│   ├── passenger/
│   │   ├── EstimateScreen.tsx  ✅ + ocultar "Programar" si !features.scheduling
│   │   └── HomeScreen.tsx      ✅ + ocultar botón "Mis programados" si !features.scheduling
│   └── auth/
│       └── LoginScreen.tsx     ✅ sin cambios
└── navigation/
    └── RootNavigator.tsx   ✅ + inicializar vertical store al montar

apps/mobile-v2/app.json
└── extra.verticalSlug: "taxi"  🆕
```

---

## Schema del `vertical.store.ts`

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MMKV } from 'react-native-mmkv'
import { apiClient } from '../services/api.client'
import { ENV } from '../config/env'

const storage = new MMKV({ id: 'vertical-store' })

interface VerticalFeatures {
  scheduling:       boolean
  multiStop:        boolean
  cargoDeclaration: boolean
  chainOfCustody:   boolean
  temperatureLog:   boolean
  b2bAccounts:      boolean
  pricingModel:     'per_km_min' | 'per_declared_value' | 'flat_rate'
}

interface VerticalState {
  slug:     string
  name:     string
  features: VerticalFeatures
  loaded:   boolean
  fetchConfig: () => Promise<void>
}

const DEFAULT_FEATURES: VerticalFeatures = {
  scheduling:       true,
  multiStop:        false,
  cargoDeclaration: false,
  chainOfCustody:   false,
  temperatureLog:   false,
  b2bAccounts:      false,
  pricingModel:     'per_km_min',
}

export const useVerticalStore = create<VerticalState>()(
  persist(
    (set) => ({
      slug:     ENV.verticalSlug,
      name:     'RideBase',
      features: DEFAULT_FEATURES,
      loaded:   false,
      fetchConfig: async () => {
        try {
          const res = await apiClient.get<{ slug: string; name: string; features: VerticalFeatures }>('/config')
          set({ slug: res.data.slug, name: res.data.name, features: res.data.features, loaded: true })
        } catch {
          set({ loaded: true }) // usa lo cacheado en MMKV o DEFAULT_FEATURES
        }
      },
    }),
    {
      name: 'vertical-store',
      storage: createJSONStorage(() => ({
        getItem: (key) => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      })),
    }
  )
)
```

---

## Hook: `useVerticalFeatures`

```typescript
// Acceso tipado a los features del vertical activo
export function useVerticalFeatures(): VerticalFeatures {
  return useVerticalStore((s) => s.features)
}
```

---

## Inicialización en `RootNavigator.tsx`

```typescript
// En el componente raíz, al montar:
useEffect(() => {
  void useVerticalStore.getState().fetchConfig()
}, [])
// fetchConfig es fire-and-forget — no bloquea el render inicial
// Si MMKV tiene datos cacheados, se usan inmediatamente mientras llega la respuesta de la API
```

---

## Cambios en pantallas

### EstimateScreen.tsx

```typescript
const features = useVerticalFeatures()

// Ocultar CTA "Programar para después" si el vertical no tiene scheduling:
{features.scheduling && (
  <TouchableOpacity onPress={handleSchedule}>
    <Text>Programar para después</Text>
  </TouchableOpacity>
)}
```

### HomeScreen.tsx

```typescript
const features = useVerticalFeatures()

// Ocultar botón "Mis programados":
{features.scheduling && (
  <TouchableOpacity onPress={() => navigation.navigate('ScheduledTrips')}>
    <Text>Mis programados</Text>
  </TouchableOpacity>
)}
```

---

## Cambio en `app.json extra`

```json
"extra": {
  "appName": "RideBase",
  "verticalSlug": "taxi",
  ...
}
```

## Cambio en `config/env.ts`

```typescript
export const ENV = {
  appName:      extra.appName      ?? 'RideBase',
  verticalSlug: extra.verticalSlug ?? 'taxi',   // 🆕
  mapboxToken:  extra.mapboxPublicToken ?? '',
  apiUrl:       extra.apiUrl       ?? 'http://10.0.2.2:3333',
  socketUrl:    extra.socketUrl    ?? 'http://10.0.2.2:3333',
} as const
```

---

## Tests a escribir

```
vertical.store.test.ts:
  ✓ fetchConfig: llama GET /config y actualiza el store
  ✓ fetchConfig: en error de red, loaded=true y mantiene valores previos (MMKV)
  ✓ fetchConfig: en primer uso sin caché, usa DEFAULT_FEATURES
  ✓ features.scheduling: false → la UI debería ocultar el scheduling CTA
    (test de integración con renderizado del componente)

EstimateScreen.test.ts (agregar casos):
  ✓ con features.scheduling=true → "Programar para después" visible
  ✓ con features.scheduling=false → "Programar para después" no existe en el árbol
```
