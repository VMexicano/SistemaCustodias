import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { apiClient } from '../../../services/api.client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@rnmapbox/maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      MapView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
        React.createElement(View, { testID: testID ?? 'mapbox-map-view' }, children),
      Camera: React.forwardRef(() => null),
      PointAnnotation: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(View, null, children),
      ShapeSource: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(View, null, children),
      LineLayer: () => null,
    },
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 19.4326, longitude: -99.1332 },
  }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  Accuracy: { High: 6 },
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { orderId: 'order-1' } }),
}));

jest.mock('../../../services/api.client', () => ({
  apiClient: { get: jest.fn(), patch: jest.fn() },
}));

const mockUseAuthStore = jest.fn();
jest.mock('../../../stores/auth.store', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

const mockGet = apiClient.get as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOrder = {
  id: 'order-1',
  orderNumber: 'ORD-20260514-ABC123',
  status: 'CREW_CONFIRMED',
  pickupAddress: { street: 'Reforma 123', city: 'CDMX', state: 'CDMX', lat: 19.4326, lng: -99.1332 },
  deliveryAddress: { street: 'Polanco 456', city: 'CDMX', state: 'CDMX', lat: 19.4200, lng: -99.1450 },
  custodioId: 'op-1',
  copilotoId: 'op-2',
};

const baseRoute = {
  id: 'route-1',
  orderId: 'order-1',
  status: 'APPROVED',
  totalDistanceKm: 12.5,
  estimatedDurationMin: 25,
  waypoints: [
    { lat: 19.4326, lng: -99.1332, label: 'Pickup' },
    { lat: 19.4263, lng: -99.1391, label: 'Paso 1' },
    { lat: 19.4200, lng: -99.1450, label: 'Entrega' },
  ],
};

const activeOrders = [
  {
    id: 'order-1',
    orderNumber: 'ORD-20260514-ABC123',
    status: 'CREW_CONFIRMED',
    pickupAddress: { street: 'Reforma 123', city: 'CDMX', state: 'CDMX' },
    deliveryAddress: { street: 'Polanco 456', city: 'CDMX', state: 'CDMX' },
  },
  {
    id: 'order-2',
    orderNumber: 'ORD-20260514-DEF456',
    status: 'IN_TRANSIT',
    pickupAddress: { street: 'Insurgentes 789', city: 'CDMX', state: 'CDMX' },
    deliveryAddress: { street: 'Coyoacán 321', city: 'CDMX', state: 'CDMX' },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ role: 'custodio' });
});

// ---------------------------------------------------------------------------
// CustodyOperatorHomeScreen
// ---------------------------------------------------------------------------

describe('CustodyOperatorHomeScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CustodyOperatorHomeScreen = require('../../../screens/operator/CustodyOperatorHomeScreen').default;

  it('muestra indicador de carga mientras obtiene las órdenes', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    render(<CustodyOperatorHomeScreen />);
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
  });

  it('muestra la lista de órdenes activas tras la carga', async () => {
    mockGet.mockResolvedValue({ data: { data: activeOrders } });
    render(<CustodyOperatorHomeScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('order-card-order-1')).toBeTruthy();
      expect(screen.getByTestId('order-card-order-2')).toBeTruthy();
    });
    expect(screen.getByText('ORD-20260514-ABC123')).toBeTruthy();
  });

  it('muestra estado vacío cuando no hay órdenes', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    render(<CustodyOperatorHomeScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-text')).toBeTruthy();
    });
    expect(screen.getByText('Sin órdenes activas')).toBeTruthy();
  });

  it('muestra mensaje de error cuando falla la carga', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<CustodyOperatorHomeScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toBeTruthy();
    });
    expect(screen.getByText('No se pudieron cargar las órdenes')).toBeTruthy();
  });

  it('navega a CustodyActiveOrder al pulsar una tarjeta', async () => {
    mockGet.mockResolvedValue({ data: { data: activeOrders } });
    render(<CustodyOperatorHomeScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('order-card-order-1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('order-card-order-1'));
    expect(mockNavigate).toHaveBeenCalledWith('CustodyActiveOrder', { orderId: 'order-1' });
  });

  it('llama a GET /orders/my al montar', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    render(<CustodyOperatorHomeScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/orders/my'));
  });
});

// ---------------------------------------------------------------------------
// CustodyActiveOrderScreen
// ---------------------------------------------------------------------------

describe('CustodyActiveOrderScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CustodyActiveOrderScreen = require('../../../screens/operator/CustodyActiveOrderScreen').default;

  function setupOrderMocks(orderOverride?: Partial<typeof baseOrder>): void {
    mockGet
      .mockResolvedValueOnce({ data: { ...baseOrder, ...orderOverride } })
      .mockResolvedValueOnce({ data: baseRoute });
  }

  it('muestra los datos de la orden al cargar', async () => {
    setupOrderMocks();
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('order-number')).toBeTruthy();
    });
    expect(screen.getByText('ORD-20260514-ABC123')).toBeTruthy();
  });

  it('muestra el botón "Partir" para custodio en CREW_CONFIRMED', async () => {
    setupOrderMocks();
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('action-btn')).toBeTruthy();
    });
    expect(screen.getByText('Partir')).toBeTruthy();
  });

  it('oculta el botón "Partir" para copiloto en CREW_CONFIRMED', async () => {
    mockUseAuthStore.mockReturnValue({ role: 'copiloto' });
    setupOrderMocks();
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('order-number')).toBeTruthy();
    });
    expect(screen.queryByText('Partir')).toBeNull();
  });

  it('muestra el botón de pánico en AT_PICKUP', async () => {
    setupOrderMocks({ status: 'AT_PICKUP' });
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('panic-btn')).toBeTruthy();
    });
  });

  it('no muestra el botón de pánico en CREW_CONFIRMED', async () => {
    setupOrderMocks();
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('order-number')).toBeTruthy();
    });
    expect(screen.queryByTestId('panic-btn')).toBeNull();
  });

  it('abre el modal de firma al pulsar "Confirmar pickup"', async () => {
    setupOrderMocks({ status: 'AT_PICKUP' });
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('action-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('action-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('signature-input')).toBeTruthy();
    });
  });

  it('llama a PATCH /orders/:id/depart al pulsar "Partir"', async () => {
    setupOrderMocks();
    mockPatch.mockResolvedValue({ data: { ...baseOrder, status: 'EN_ROUTE_TO_PICKUP' } });
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('action-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('action-btn'));
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/orders/order-1/depart', undefined);
    });
  });

  it('muestra "Orden no encontrada" cuando falla la carga', async () => {
    mockGet.mockRejectedValue(new Error('Not found'));
    render(<CustodyActiveOrderScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toBeTruthy();
    });
    expect(screen.getByText('Orden no encontrada')).toBeTruthy();
  });
});
