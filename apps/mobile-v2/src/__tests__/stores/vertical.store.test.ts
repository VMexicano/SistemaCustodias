import { act } from 'react';
import { useVerticalStore, DEFAULT_FEATURES } from '../../stores/vertical.store';
import type { VerticalFeatures } from '../../stores/vertical.store';
import { apiClient } from '../../services/api.client';

jest.mock('../../services/api.client', () => ({
  apiClient: { get: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  ENV: { verticalSlug: 'taxi', appName: 'RideBase', mapboxToken: '', apiUrl: '', socketUrl: '' },
}));

jest.mock('../../config/reactotron', () => ({
  tlog: jest.fn(),
  tlogError: jest.fn(),
}));

const CUSTODY_FEATURES: VerticalFeatures = {
  scheduling: false,
  multiStop: true,
  cargoDeclaration: true,
  chainOfCustody: true,
  temperatureLog: false,
  b2bAccounts: true,
  pricingModel: 'per_declared_value',
  custodyEventTypes: [
    { code: 'PICKUP', label: 'Recolección', requiresPhoto: true, requiresSignature: true },
  ],
  cargoFields: [
    { key: 'declared_value', label: 'Valor declarado', type: 'number', required: true },
  ],
};

function getStore() {
  return useVerticalStore.getState();
}

beforeEach(() => {
  act(() => {
    useVerticalStore.setState({
      slug: 'taxi',
      name: 'RideBase',
      features: DEFAULT_FEATURES,
      loaded: false,
    });
  });
  (apiClient.get as jest.Mock).mockReset();
});

describe('vertical.store — estado inicial', () => {
  it('slug proviene de ENV.verticalSlug', () => {
    expect(getStore().slug).toBe('taxi');
  });

  it('name por defecto es RideBase', () => {
    expect(getStore().name).toBe('RideBase');
  });

  it('features por defecto son DEFAULT_FEATURES', () => {
    expect(getStore().features).toEqual(DEFAULT_FEATURES);
  });

  it('loaded comienza en false', () => {
    expect(getStore().loaded).toBe(false);
  });
});

describe('vertical.store — fetchConfig() éxito', () => {
  it('establece slug, name y features desde la API', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { slug: 'custody', name: 'CustodyPro', features: CUSTODY_FEATURES },
    });

    await act(async () => {
      await getStore().fetchConfig();
    });

    const s = getStore();
    expect(s.slug).toBe('custody');
    expect(s.name).toBe('CustodyPro');
    expect(s.features).toEqual(CUSTODY_FEATURES);
  });

  it('marca loaded = true tras respuesta exitosa', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { slug: 'taxi', name: 'RideBase', features: DEFAULT_FEATURES },
    });

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(getStore().loaded).toBe(true);
  });

  it('llama a /config sin parámetros adicionales', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { slug: 'taxi', name: 'RideBase', features: DEFAULT_FEATURES },
    });

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/config');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('sobreescribe features completamente con los de la API', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { slug: 'custody', name: 'CustodyPro', features: CUSTODY_FEATURES },
    });

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(getStore().features.pricingModel).toBe('per_declared_value');
    expect(getStore().features.chainOfCustody).toBe(true);
    expect(getStore().features.custodyEventTypes).toHaveLength(1);
  });
});

describe('vertical.store — fetchConfig() error', () => {
  it('marca loaded = true aunque falle la petición', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(getStore().loaded).toBe(true);
  });

  it('preserva DEFAULT_FEATURES cuando la API falla', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(getStore().features).toEqual(DEFAULT_FEATURES);
  });

  it('preserva slug original cuando la API falla', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    await act(async () => {
      await getStore().fetchConfig();
    });

    expect(getStore().slug).toBe('taxi');
    expect(getStore().name).toBe('RideBase');
  });

  it('no lanza excepción al caller cuando la API falla', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Timeout'));

    await expect(
      act(async () => {
        await getStore().fetchConfig();
      }),
    ).resolves.not.toThrow();
  });
});
