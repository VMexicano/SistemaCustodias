import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import EstimateScreen from '../../screens/passenger/EstimateScreen';
import ActiveTripScreen from '../../screens/driver/ActiveTripScreen';
import { apiClient } from '../../services/api.client';

// ---------------------------------------------------------------------------
// Shared mutable features — flip flags per test
// ---------------------------------------------------------------------------

const mockFeatures = {
  cargoDeclaration: false,
  temperatureLog: false,
  chainOfCustody: false,
  scheduling: false,
  multiStop: false,
  b2bAccounts: false,
  pricingModel: 'per_km_min' as const,
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({
    params: {
      originLat: 19.4326,
      originLng: -99.1332,
      originAddress: 'Reforma 123',
      stops: [{ lat: 19.427, lng: -99.167, address: 'Polanco 456' }],
    },
  }),
}));

jest.mock('@react-navigation/stack', () => ({
  useCardAnimation: () => ({}),
}));

jest.mock('../../hooks/useVerticalFeatures', () => ({
  useVerticalFeatures: () => mockFeatures,
}));

jest.mock('../../services/api.client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

jest.mock('../../stores/trip.store', () => ({
  useTripStore: () => ({ setActiveTrip: jest.fn() }),
}));

jest.mock('../../stores/driver.store', () => ({
  useDriverStore: () => ({
    activeTrip: { id: 'trip-001', status: 'IN_PROGRESS' },
    setActiveTrip: jest.fn(),
    setOnline: jest.fn(),
  }),
}));

jest.mock('../../services/location.service', () => ({
  default: { stopTracking: jest.fn() },
}));

jest.mock('../../components/SessionMenuButton', () => {
  const { TouchableOpacity } = require('react-native');
  return ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity testID="session-menu-btn" onPress={onPress} />
  );
});

jest.mock('@rnmapbox/maps', () => ({
  MapView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Camera: () => null,
  PointAnnotation: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Top-level mock function references (allowed in jest.mock factory)
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

const TRIP_TYPES = [{ id: 'type-001', name: 'Express', description: '', base_fare: 50 }];
const ESTIMATE_RES = {
  subtotal: 100,
  tax_amount: 16,
  final_fare: 116,
  estimated_distance_km: 5.2,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFeatures.cargoDeclaration = false;
  mockFeatures.chainOfCustody = false;
  mockFeatures.temperatureLog = false;
  mockGet.mockResolvedValue({ data: TRIP_TYPES });
  mockPost.mockResolvedValue({ data: ESTIMATE_RES });
});

// ---------------------------------------------------------------------------
// Tests — PassengerStack navigation
// ---------------------------------------------------------------------------

describe('PassengerStack navigation — cargo vertical', () => {
  it('navigates to CargoDeclaration when features.cargoDeclaration = true', async () => {
    mockFeatures.cargoDeclaration = true;
    mockPost.mockResolvedValue({ data: ESTIMATE_RES });

    render(<EstimateScreen />);
    await waitFor(() => expect(screen.queryByTestId('estimate-screen')).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId('estimate-card-0')).toBeTruthy());

    fireEvent.press(screen.getByTestId('estimate-card-0'));

    // Wait for estimate to finish loading
    await waitFor(() => {
      const btn = screen.getByTestId('estimate-confirm-btn');
      return btn.props.disabled === false || btn.props.accessibilityState?.disabled === false;
    }, { timeout: 3000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId('estimate-confirm-btn'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('CargoDeclaration', expect.objectContaining({
      tripTypeId: 'type-001',
    }));
  });

  it('skips CargoDeclaration when features.cargoDeclaration = false', async () => {
    mockFeatures.cargoDeclaration = false;
    mockPost
      .mockResolvedValueOnce({ data: ESTIMATE_RES }) // estimate call
      .mockResolvedValueOnce({ data: { id: 'trip-001', status: 'SEARCHING' } }); // POST /trips

    render(<EstimateScreen />);
    await waitFor(() => expect(screen.queryByTestId('estimate-screen')).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId('estimate-card-0')).toBeTruthy());

    fireEvent.press(screen.getByTestId('estimate-card-0'));

    await waitFor(() => {
      const btn = screen.getByTestId('estimate-confirm-btn');
      return btn.props.disabled === false || btn.props.accessibilityState?.disabled === false;
    }, { timeout: 3000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId('estimate-confirm-btn'));
    });

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('CargoDeclaration', expect.anything());
      expect(mockNavigate).toHaveBeenCalledWith('ActiveTrip');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — DriverActiveTrip conditional buttons
// ---------------------------------------------------------------------------

describe('DriverActiveTrip conditional buttons', () => {
  it('shows CustodyEvent button when features.chainOfCustody = true', () => {
    mockFeatures.chainOfCustody = true;
    render(<ActiveTripScreen />);
    expect(screen.queryByTestId('custody-event-btn')).toBeTruthy();
  });

  it('hides CustodyEvent button when features.chainOfCustody = false', () => {
    mockFeatures.chainOfCustody = false;
    render(<ActiveTripScreen />);
    expect(screen.queryByTestId('custody-event-btn')).toBeNull();
  });
});
