import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import CargoDeclarationScreen from '../../screens/passenger/CargoDeclarationScreen';
import { apiClient } from '../../services/api.client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({
    params: {
      tripTypeId: 'type-001',
      originLat: 19.4326,
      originLng: -99.1332,
      originAddress: 'Reforma 123, CDMX',
      stops: [{ lat: 19.427, lng: -99.167, address: 'Polanco 456' }],
      estimatedFare: 120.5,
    },
  }),
}));

jest.mock('@react-navigation/stack', () => ({
  useCardAnimation: () => ({}),
}));

jest.mock('../../services/api.client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

jest.mock('../../stores/trip.store', () => ({
  useTripStore: () => ({ setActiveTrip: jest.fn() }),
}));

jest.mock('../../stores/vertical.store', () => ({
  useVerticalStore: () => ({ features: { cargoFields: undefined } }),
}));

jest.mock('@rnmapbox/maps', () => ({ MapView: 'MapView', Camera: 'Camera' }));

const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CargoDeclarationScreen', () => {
  it('renders all 4 fields', () => {
    render(<CargoDeclarationScreen />);
    expect(screen.getByTestId('cargo-description-input')).toBeTruthy();
    expect(screen.getByTestId('declared-value-input')).toBeTruthy();
    expect(screen.getByTestId('recipient-name-input')).toBeTruthy();
    expect(screen.getByTestId('recipient-phone-input')).toBeTruthy();
  });

  it('disables confirm button when cargo_description is empty', () => {
    render(<CargoDeclarationScreen />);
    const btn = screen.getByTestId('cargo-confirm-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables confirm button when cargo_description is filled', () => {
    render(<CargoDeclarationScreen />);
    fireEvent.changeText(screen.getByTestId('cargo-description-input'), 'Documentos importantes');
    const btn = screen.getByTestId('cargo-confirm-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls POST /trips with metadata.cargo on confirm', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'trip-001', status: 'SEARCHING' } });
    render(<CargoDeclarationScreen />);

    fireEvent.changeText(screen.getByTestId('cargo-description-input'), 'Valuables');
    fireEvent.changeText(screen.getByTestId('declared-value-input'), '5000');
    fireEvent.changeText(screen.getByTestId('recipient-name-input'), 'Juan Pérez');

    fireEvent.press(screen.getByTestId('cargo-confirm-btn'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips', expect.objectContaining({
        trip_type_id: 'type-001',
        metadata: expect.objectContaining({
          cargo: expect.objectContaining({
            cargo_description: 'Valuables',
            declared_value: 5000,
            recipient_name: 'Juan Pérez',
          }),
        }),
      }));
    });
  });

  it('navigates to ActiveTrip after successful POST /trips', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'trip-001', status: 'SEARCHING' } });
    render(<CargoDeclarationScreen />);

    fireEvent.changeText(screen.getByTestId('cargo-description-input'), 'Paquete');
    fireEvent.press(screen.getByTestId('cargo-confirm-btn'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('ActiveTrip');
    });
  });
});
