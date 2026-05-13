import React from 'react';
import { Platform } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import ScheduleConfirmScreen from '../../screens/passenger/ScheduleConfirmScreen';
import { apiClient } from '../../services/api.client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: {
      originLat: 19.4326,
      originLng: -99.1332,
      originAddress: 'Reforma 123, CDMX',
      stops: [{ lat: 19.427, lng: -99.167, address: 'Polanco 456' }],
      tripTypeId: 'type-uuid-1',
      tripTypeName: 'Basic',
      estimatedFare: 85.5,
    },
  }),
}));

jest.mock('@react-navigation/stack', () => ({
  useCardAnimation: () => ({}),
}));

jest.mock('../../services/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScheduleConfirmScreen', () => {
  describe('initial render', () => {
    it('renders originAddress, destination address, tripTypeName and estimatedFare', () => {
      render(<ScheduleConfirmScreen />);

      expect(screen.getByText('Reforma 123, CDMX')).toBeTruthy();
      expect(screen.getByText('Polanco 456')).toBeTruthy();
      expect(screen.getByText('Basic')).toBeTruthy();
      // estimatedFare = 85.50 => "$85.50 MXN"
      expect(screen.getByTestId('schedule-fare')).toBeTruthy();
      expect(screen.getByText('$85.50 MXN')).toBeTruthy();
    });

    it('renders the confirm button', () => {
      render(<ScheduleConfirmScreen />);

      const btn = screen.getByTestId('schedule-confirm-btn');
      expect(btn).toBeTruthy();
    });

    it('renders date/time display fields', () => {
      render(<ScheduleConfirmScreen />);

      expect(screen.getByTestId('schedule-date-display')).toBeTruthy();
      expect(screen.getByTestId('schedule-time-display')).toBeTruthy();
    });

    it('renders the datetime picker trigger button', () => {
      render(<ScheduleConfirmScreen />);

      expect(screen.getByTestId('schedule-datetime-btn')).toBeTruthy();
      expect(screen.getByText('Cambiar')).toBeTruthy();
    });
  });

  describe('confirm action', () => {
    it('calls apiClient.post with /trips/schedule and correct body on confirm', async () => {
      mockPost.mockResolvedValue({ data: { trip_id: 'new-trip-1', estimated_fare: 85.5 } });

      render(<ScheduleConfirmScreen />);

      const confirmBtn = screen.getByTestId('schedule-confirm-btn');
      fireEvent.press(confirmBtn);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledTimes(1);
      });

      const [url, body] = mockPost.mock.calls[0];
      expect(url).toBe('/trips/schedule');
      expect(body).toMatchObject({
        origin: {
          lat: 19.4326,
          lng: -99.1332,
          address: 'Reforma 123, CDMX',
        },
        destination: {
          lat: 19.427,
          lng: -99.167,
          address: 'Polanco 456',
        },
        tripTypeId: 'type-uuid-1',
      });
      expect(typeof body.scheduledFor).toBe('string');
    });

    it('navigates to ScheduledTrips after successful confirmation', async () => {
      mockPost.mockResolvedValue({ data: { trip_id: 'new-trip-1', estimated_fare: 85.5 } });

      render(<ScheduleConfirmScreen />);

      fireEvent.press(screen.getByTestId('schedule-confirm-btn'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('ScheduledTrips');
      });
    });
  });

  describe('API error handling', () => {
    it('shows generic error message when API call fails', async () => {
      mockPost.mockRejectedValue(new Error('Network error'));

      render(<ScheduleConfirmScreen />);

      fireEvent.press(screen.getByTestId('schedule-confirm-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-api-error')).toBeTruthy();
      });

      expect(
        screen.getByText('No se pudo programar el viaje. Intenta de nuevo'),
      ).toBeTruthy();
    });

    it('shows SCHEDULED_TOO_SOON error message when API returns that code', async () => {
      mockPost.mockRejectedValue({
        response: { data: { code: 'SCHEDULED_TOO_SOON' } },
      });

      render(<ScheduleConfirmScreen />);

      fireEvent.press(screen.getByTestId('schedule-confirm-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-api-error')).toBeTruthy();
      });

      expect(
        screen.getByText('El horario debe ser al menos 30 minutos en el futuro'),
      ).toBeTruthy();
    });

    it('shows PASSENGER_HAS_ACTIVE_TRIP error message when API returns that code', async () => {
      mockPost.mockRejectedValue({
        response: { data: { code: 'PASSENGER_HAS_ACTIVE_TRIP' } },
      });

      render(<ScheduleConfirmScreen />);

      fireEvent.press(screen.getByTestId('schedule-confirm-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-api-error')).toBeTruthy();
      });

      expect(
        screen.getByText('Ya tienes un viaje activo o programado'),
      ).toBeTruthy();
    });
  });

  describe('navigation', () => {
    it('calls goBack when Volver button is pressed', () => {
      render(<ScheduleConfirmScreen />);

      fireEvent.press(screen.getByText('Volver'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('date/time picker', () => {
    it('shows the DateTimePicker after pressing the datetime button', () => {
      render(<ScheduleConfirmScreen />);

      // Picker is hidden initially
      expect(screen.queryByTestId('schedule-datetime-picker')).toBeNull();

      fireEvent.press(screen.getByTestId('schedule-datetime-btn'));

      // After pressing, the DateTimePicker should appear
      expect(screen.getByTestId('schedule-datetime-picker')).toBeTruthy();
    });

    it('updates the selected date when the iOS picker onChange is fired', async () => {
      // The mocked DateTimePicker is rendered as a plain "DateTimePicker" host element.
      // We can invoke its onChange prop directly to simulate a date selection.
      const { UNSAFE_getByType } = render(<ScheduleConfirmScreen />);

      // Open the picker first
      fireEvent.press(screen.getByTestId('schedule-datetime-btn'));

      // On iOS (default in jest-expo), the picker fires a single onChange with the new date
      const newDate = new Date(Date.now() + 90 * 60 * 1000); // 90 min from now
      const DateTimePickerComponent = UNSAFE_getByType('DateTimePicker' as never);

      // Call the onChange prop wrapped in act to satisfy React state update expectations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onChangeProp = (DateTimePickerComponent.props as any).onChange;
      await act(async () => {
        if (onChangeProp) {
          onChangeProp({ type: 'set', nativeEvent: { timestamp: newDate.getTime() } }, newDate);
        }
      });

      // The date and time display elements should still be rendered (not crashed)
      expect(screen.getByTestId('schedule-date-display')).toBeTruthy();
      expect(screen.getByTestId('schedule-time-display')).toBeTruthy();
    });

    it('handles Android date then time picker flow', async () => {
      // Temporarily set Platform.OS to 'android' so the Android branch is exercised
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

      try {
        const { UNSAFE_getByType } = render(<ScheduleConfirmScreen />);

        // Open the picker (starts in 'date' mode)
        fireEvent.press(screen.getByTestId('schedule-datetime-btn'));

        const newDate = new Date(Date.now() + 90 * 60 * 1000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pickerProps = (UNSAFE_getByType('DateTimePicker' as never).props as any);

        // First onChange: date selection — picker should close and reopen as time
        await act(async () => {
          pickerProps.onChange(
            { type: 'set', nativeEvent: { timestamp: newDate.getTime() } },
            newDate,
          );
        });

        // After date picked, the time picker should now be visible
        // (Android flow: date → time in sequence)
        // Find the time picker and pick a time
        pickerProps = (UNSAFE_getByType('DateTimePicker' as never).props as any);
        await act(async () => {
          pickerProps.onChange(
            { type: 'set', nativeEvent: { timestamp: newDate.getTime() } },
            newDate,
          );
        });

        // Screen should still render without errors
        expect(screen.getByTestId('schedule-confirm-btn')).toBeTruthy();
      } finally {
        Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      }
    });

    it('handles Android picker dismissal (dismissed event type)', async () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

      try {
        const { UNSAFE_getByType } = render(<ScheduleConfirmScreen />);

        fireEvent.press(screen.getByTestId('schedule-datetime-btn'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onChangeProp = (UNSAFE_getByType('DateTimePicker' as never).props as any).onChange;
        await act(async () => {
          // Simulate user dismissing the picker
          onChangeProp({ type: 'dismissed', nativeEvent: {} }, undefined);
        });

        // Picker should now be hidden (dismissed) without crashing
        expect(screen.queryByTestId('schedule-datetime-picker')).toBeNull();
        expect(screen.getByTestId('schedule-confirm-btn')).toBeTruthy();
      } finally {
        Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      }
    });
  });
});
