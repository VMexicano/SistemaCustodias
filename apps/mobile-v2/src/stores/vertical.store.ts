import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { apiClient } from '../services/api.client';
import { ENV } from '../config/env';
import { tlog, tlogError } from '../config/reactotron';

const storage = new MMKV({ id: 'vertical-store' });

export interface CustodyEventTypeConfig {
  code: string;
  label: string;
  requiresPhoto: boolean;
  requiresSignature: boolean;
}

export interface CargoFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'phone';
  required: boolean;
  placeholder?: string;
  multiline?: boolean;
}

export interface VerticalFeatures {
  scheduling: boolean;
  multiStop: boolean;
  cargoDeclaration: boolean;
  chainOfCustody: boolean;
  temperatureLog: boolean;
  b2bAccounts: boolean;
  pricingModel: 'per_km_min' | 'per_declared_value' | 'flat_rate';
  custodyEventTypes?: CustodyEventTypeConfig[];
  cargoFields?: CargoFieldConfig[];
  unitTypeDetermination?: 'by_declared_value' | 'by_cargo_type' | 'manual' | null;
}

interface VerticalState {
  slug: string;
  name: string;
  features: VerticalFeatures;
  loaded: boolean;
  fetchConfig: () => Promise<void>;
}

export const DEFAULT_FEATURES: VerticalFeatures = {
  scheduling: true,
  multiStop: false,
  cargoDeclaration: false,
  chainOfCustody: false,
  temperatureLog: false,
  b2bAccounts: false,
  pricingModel: 'per_km_min',
};

export const useVerticalStore = create<VerticalState>()(
  persist(
    (set) => ({
      slug: ENV.verticalSlug,
      name: 'RideBase',
      features: DEFAULT_FEATURES,
      loaded: false,
      fetchConfig: async () => {
        try {
          const res = await apiClient.get<{ slug: string; name: string; features: VerticalFeatures }>(
            '/config',
          );
          set({ slug: res.data.slug, name: res.data.name, features: res.data.features, loaded: true });
          tlog('vertical:config:loaded', { slug: res.data.slug, features: res.data.features });
        } catch (err) {
          set({ loaded: true });
          tlogError('vertical:config:fetch', err);
        }
      },
    }),
    {
      name: 'vertical-store',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => storage.getString(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      })),
    },
  ),
);
