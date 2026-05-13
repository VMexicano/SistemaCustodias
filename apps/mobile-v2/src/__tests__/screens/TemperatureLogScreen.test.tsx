import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import TemperatureLogScreen from '../../screens/driver/TemperatureLogScreen';
import { apiClient } from '../../services/api.client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGoBack = jest.fn();

// routeParams is mutable so individual tests can override setpoints
const routeParams: {
  tripId: string;
  setpoints?: { min_celsius: number; max_celsius: number };
} = { tripId: 'trip-001', setpoints: { min_celsius: 2, max_celsius: 8 } };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: routeParams }),
}));

jest.mock('@react-navigation/stack', () => ({
  useCardAnimation: () => ({}),
}));

jest.mock('../../services/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

const EMPTY_HISTORY = { data: { readings: [], summary: null } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGet.mockResolvedValue(EMPTY_HISTORY);
  mockPost.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemperatureLogScreen', () => {
  it('fetches temperature history on mount', async () => {
    render(<TemperatureLogScreen />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/trips/trip-001/temperature?limit=20');
    });
  });

  it('shows green indicator when celsius is within setpoints range', async () => {
    render(<TemperatureLogScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.changeText(screen.getByTestId('celsius-input'), '4.0');

    const indicator = screen.getByTestId('temperature-indicator');
    expect(indicator.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#28A745' })]),
    );
    expect(indicator.props.children).toContain('Dentro del rango');
  });

  it('shows red indicator when celsius is outside setpoints range', async () => {
    render(<TemperatureLogScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.changeText(screen.getByTestId('celsius-input'), '10.0');

    const indicator = screen.getByTestId('temperature-indicator');
    expect(indicator.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#DC3545' })]),
    );
    expect(indicator.props.children).toContain('Fuera del rango');
  });

  it('shows neutral indicator when no setpoints provided', async () => {
    routeParams.setpoints = undefined;
    render(<TemperatureLogScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.changeText(screen.getByTestId('celsius-input'), '5.0');

    const indicator = screen.getByTestId('temperature-indicator');
    expect(indicator.props.children).toContain('Sin rango');

    // Restore for subsequent tests
    routeParams.setpoints = { min_celsius: 2, max_celsius: 8 };
  });

  it('clears interval on unmount (no memory leak)', async () => {
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<TemperatureLogScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('calls POST /trips/:id/temperature with celsius value', async () => {
    render(<TemperatureLogScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.changeText(screen.getByTestId('celsius-input'), '5.5');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-temperature-btn'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-001/temperature', { celsius: 5.5 });
    });
  });
});
