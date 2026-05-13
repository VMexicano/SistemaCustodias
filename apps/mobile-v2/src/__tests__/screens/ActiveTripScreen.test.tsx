import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ActiveTripScreen from '../../screens/passenger/ActiveTripScreen';
import { useTripStore } from '../../stores/trip.store';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@rnmapbox/maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      MapView: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(View, { testID: 'mapbox-map-view' }, children),
      Camera: () => null,
      PointAnnotation: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(View, null, children),
    },
  };
});

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock('@react-navigation/stack', () => ({
  useCardAnimation: () => ({}),
}));

jest.mock('../../services/api.client', () => ({
  apiClient: {
    patch: jest.fn(),
  },
}));

const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();
const mockSocketEmit = jest.fn();

jest.mock('../../services/socket.client', () => ({
  getSocket: jest.fn(() => ({
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
  })),
  disconnectSocket: jest.fn(),
}));

jest.mock('../../stores/trip.store', () => ({
  useTripStore: jest.fn(),
}));

jest.mock('../../components/SessionMenuButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ testID }: { testID?: string }) =>
    React.createElement(View, { testID: testID ?? 'session-menu-btn' });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseTripStore = useTripStore as unknown as jest.Mock<any, any, any>;

const baseTrip = {
  id: 'trip-001',
  status: 'SEARCHING',
  originLat: 19.4326,
  originLng: -99.1332,
  originAddress: 'Reforma 123, CDMX',
  stops: [{ lat: 19.427, lng: -99.167, address: 'Polanco 456' }],
  estimatedTotal: 120.5,
};

function buildStoreState(status: string) {
  return {
    activeTrip: { ...baseTrip, status },
    driverLat: null,
    driverLng: null,
    tripStatus: status,
    updateDriverLocation: jest.fn(),
    updateStatus: jest.fn(),
    clearTrip: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActiveTripScreen', () => {
  describe('PENDING_APPROVAL status', () => {
    it('muestra "Tu solicitud está en revisión" cuando status es PENDING_APPROVAL', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('PENDING_APPROVAL'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('Tu solicitud está en revisión')).toBeTruthy();
    });

    it('muestra el subtítulo del despachador cuando status es PENDING_APPROVAL', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('PENDING_APPROVAL'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('Un despachador revisará tu solicitud en breve')).toBeTruthy();
    });

    it('no muestra el texto de búsqueda en PENDING_APPROVAL', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('PENDING_APPROVAL'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('Buscando conductor disponible...')).toBeNull();
    });

    it('no muestra el statusChip genérico en PENDING_APPROVAL', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('PENDING_APPROVAL'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('PENDING_APPROVAL')).toBeNull();
    });

    it('muestra el banner de pending (testID) cuando status es PENDING_APPROVAL', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('PENDING_APPROVAL'));

      render(<ActiveTripScreen />);

      expect(screen.getByTestId('status-banner-pending-approval')).toBeTruthy();
    });
  });

  describe('APPROVED status', () => {
    it('muestra "Solicitud aprobada" cuando status es APPROVED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('APPROVED'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('Solicitud aprobada')).toBeTruthy();
    });

    it('muestra "Buscando conductor disponible..." cuando status es APPROVED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('APPROVED'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('Buscando conductor disponible...')).toBeTruthy();
    });

    it('no muestra el texto de revisión en APPROVED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('APPROVED'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('Tu solicitud está en revisión')).toBeNull();
    });

    it('no muestra el statusChip genérico en APPROVED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('APPROVED'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('APPROVED')).toBeNull();
    });

    it('muestra el banner de aprobado (testID) cuando status es APPROVED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('APPROVED'));

      render(<ActiveTripScreen />);

      expect(screen.getByTestId('status-banner-approved')).toBeTruthy();
    });
  });

  describe('SEARCHING status — flujo existente no roto', () => {
    it('no muestra banners de aprobación en SEARCHING', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('SEARCHING'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('Tu solicitud está en revisión')).toBeNull();
      expect(screen.queryByText('Solicitud aprobada')).toBeNull();
    });

    it('muestra el statusChip con texto SEARCHING', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('SEARCHING'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('SEARCHING')).toBeTruthy();
    });

    it('muestra el botón de cancelar en SEARCHING', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('SEARCHING'));

      render(<ActiveTripScreen />);

      expect(screen.getByTestId('active-trip-cancel-btn')).toBeTruthy();
    });
  });

  describe('ACCEPTED status — flujo existente no roto', () => {
    it('no muestra banners de aprobación en ACCEPTED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('ACCEPTED'));

      render(<ActiveTripScreen />);

      expect(screen.queryByText('Tu solicitud está en revisión')).toBeNull();
      expect(screen.queryByText('Solicitud aprobada')).toBeNull();
    });

    it('muestra el statusChip con texto ACCEPTED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('ACCEPTED'));

      render(<ActiveTripScreen />);

      expect(screen.getByText('ACCEPTED')).toBeTruthy();
    });

    it('muestra el botón de cancelar en ACCEPTED', () => {
      mockUseTripStore.mockReturnValue(buildStoreState('ACCEPTED'));

      render(<ActiveTripScreen />);

      expect(screen.getByTestId('active-trip-cancel-btn')).toBeTruthy();
    });
  });

  describe('sin viaje activo', () => {
    it('muestra "No hay viaje activo" cuando activeTrip es null', () => {
      mockUseTripStore.mockReturnValue({
        activeTrip: null,
        driverLat: null,
        driverLng: null,
        tripStatus: null,
        updateDriverLocation: jest.fn(),
        updateStatus: jest.fn(),
        clearTrip: jest.fn(),
      });

      render(<ActiveTripScreen />);

      expect(screen.getByText('No hay viaje activo')).toBeTruthy();
    });
  });
});
