import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduledTripsScreen from '../../screens/passenger/ScheduledTripsScreen';
import { apiClient } from '../../services/api.client';

jest.mock('../../services/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

const mockGet = apiClient.get as jest.Mock;
const mockDelete = apiClient.delete as jest.Mock;

const TRIP_1 = {
  id: 'sched-1',
  trip_id: 'trip-1',
  scheduled_for: '2026-05-10T14:00:00.000Z',
  origin_address: 'Reforma 123, CDMX',
  destination_address: 'Polanco 456, CDMX',
  estimated_fare: 85.5,
  trip_type_name: 'Basic',
};

const TRIP_2 = {
  id: 'sched-2',
  trip_id: 'trip-2',
  scheduled_for: '2026-05-11T09:30:00.000Z',
  origin_address: 'Insurgentes 789, CDMX',
  destination_address: 'Coyoacán 321, CDMX',
  estimated_fare: 120.0,
  trip_type_name: 'Premium',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScheduledTripsScreen', () => {
  describe('list rendering', () => {
    it('renders list with 2 trips showing all required fields', async () => {
      mockGet.mockResolvedValue({ data: { data: [TRIP_1, TRIP_2] } });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trips-list')).toBeTruthy();
      });

      // Trip 1
      expect(screen.getByText('Basic')).toBeTruthy();
      expect(screen.getByText('Reforma 123, CDMX')).toBeTruthy();
      expect(screen.getByText('Polanco 456, CDMX')).toBeTruthy();
      expect(screen.getByText('$85.50 MXN')).toBeTruthy();

      // Trip 2
      expect(screen.getByText('Premium')).toBeTruthy();
      expect(screen.getByText('Insurgentes 789, CDMX')).toBeTruthy();
      expect(screen.getByText('Coyoacán 321, CDMX')).toBeTruthy();
      expect(screen.getByText('$120.00 MXN')).toBeTruthy();

      // Cards rendered
      expect(screen.getByTestId('scheduled-trip-card-sched-1')).toBeTruthy();
      expect(screen.getByTestId('scheduled-trip-card-sched-2')).toBeTruthy();
    });

    it('renders formatted scheduled_for date string', async () => {
      mockGet.mockResolvedValue({ data: { data: [TRIP_1] } });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trip-card-sched-1')).toBeTruthy();
      });

      // The screen renders formatDate(scheduled_for) · formatTime(scheduled_for)
      // Just verify the date label is present in the card
      expect(screen.getByText(/Fecha/i)).toBeTruthy();
    });

    it('renders null estimated_fare as "— MXN"', async () => {
      const tripWithNullFare = { ...TRIP_1, estimated_fare: null };
      mockGet.mockResolvedValue({ data: { data: [tripWithNullFare] } });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('— MXN')).toBeTruthy();
      });
    });
  });

  describe('empty state', () => {
    it('renders empty state when data.data = []', async () => {
      mockGet.mockResolvedValue({ data: { data: [] } });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trips-empty')).toBeTruthy();
      });

      expect(screen.getByText('No tienes viajes programados aún')).toBeTruthy();
    });
  });

  describe('loading state', () => {
    it('renders ActivityIndicator while loading', async () => {
      // Never resolve so the query stays in loading state
      mockGet.mockReturnValue(new Promise(() => {}));

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trips-loading')).toBeTruthy();
      });
    });
  });

  describe('cancel trip', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert');
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    it('calls Alert.alert with correct title and message when cancel button is pressed', async () => {
      mockGet.mockResolvedValue({ data: { data: [TRIP_1] } });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`));

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        '¿Cancelar viaje?',
        'Esta acción no se puede deshacer.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'No', style: 'cancel' }),
          expect.objectContaining({ text: 'Sí, cancelar', style: 'destructive' }),
        ]),
      );
    });

    it('calls DELETE /trips/scheduled/:trip_id when user confirms cancellation', async () => {
      mockGet.mockResolvedValue({ data: { data: [TRIP_1] } });
      mockDelete.mockResolvedValue({ data: {} });

      alertSpy.mockImplementation((_title, _msg, buttons) => {
        // Simulate pressing the confirm button (index 1)
        const confirmButton = buttons.find(
          (b: { text: string; onPress?: () => void }) => b.text === 'Sí, cancelar',
        );
        confirmButton?.onPress?.();
      });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith(`/trips/scheduled/${TRIP_1.trip_id}`);
      });
    });

    it('does NOT call DELETE when user rejects cancellation', async () => {
      mockGet.mockResolvedValue({ data: { data: [TRIP_1] } });

      alertSpy.mockImplementation((_title, _msg, buttons) => {
        // Simulate pressing the "No" / cancel button (index 0)
        const cancelButton = buttons.find(
          (b: { text: string; onPress?: () => void }) => b.text === 'No',
        );
        cancelButton?.onPress?.();
      });

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId(`cancel-trip-btn-${TRIP_1.trip_id}`));

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('shows error UI when API call fails', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trips-error')).toBeTruthy();
      });

      expect(
        screen.getByText('No se pudieron cargar tus viajes programados.'),
      ).toBeTruthy();
    });

    it('renders retry button on error', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      render(<ScheduledTripsScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('scheduled-trips-retry-btn')).toBeTruthy();
      });
    });
  });
});
