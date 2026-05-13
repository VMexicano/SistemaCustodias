import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import CustodyEventScreen from '../../screens/driver/CustodyEventScreen';
import { apiClient } from '../../services/api.client';
import * as ImagePicker from 'expo-image-picker';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { tripId: 'trip-001' } }),
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

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../../stores/vertical.store', () => ({
  useVerticalStore: jest.fn(() => ({ features: { custodyEventTypes: undefined } })),
}));

jest.mock('../../components/SignaturePad', () => ({
  SignaturePad: ({ onSign }: { onSign: (v: boolean) => void }) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity testID="mock-signature-pad" onPress={() => onSign(true)}>
        <Text>Firma</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../config/reactotron', () => ({
  tlog: jest.fn(),
  tlogError: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockLaunchCamera = ImagePicker.launchCameraAsync as jest.Mock;

const SAMPLE_EVENTS = [
  {
    id: 'evt-1',
    event_type: 'pick_up',
    notes: null,
    photo_url: null,
    occurred_at: new Date().toISOString(),
    sequence: 1,
    actor_name: 'Juan',
  },
  {
    id: 'evt-2',
    event_type: 'handoff',
    notes: 'En oficina',
    photo_url: null,
    occurred_at: new Date().toISOString(),
    sequence: 2,
    actor_name: 'Juan',
  },
];

const mockUseVerticalStore = jest.requireMock('../../stores/vertical.store').useVerticalStore as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: { success: true, data: [] } });
  mockPost.mockResolvedValue({ data: { success: true } });
  mockUseVerticalStore.mockReturnValue({ features: { custodyEventTypes: undefined } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustodyEventScreen', () => {
  it('fetches custody events on mount', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/trips/trip-001/custody');
    });
  });

  it('displays events ordered by sequence', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: SAMPLE_EVENTS } });
    render(<CustodyEventScreen />);

    await waitFor(() => {
      const list = screen.getByTestId('custody-events-list');
      expect(list).toBeTruthy();
    });

    // Sequence 1 appears before sequence 2 in the list
    const seqLabels = screen.getAllByText(/^[12]$/);
    expect(Number(seqLabels[0].props.children)).toBeLessThan(
      Number(seqLabels[1].props.children),
    );
  });

  it('disables submit when no event_type selected', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    const submitBtn = screen.getByTestId('custody-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled ?? submitBtn.props.disabled).toBeTruthy();
  });

  it('calls POST /trips/:id/custody/events with correct payload', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-pick_up'));
    fireEvent.changeText(screen.getByTestId('custody-notes-input'), 'Recogida en lobby');

    await act(async () => {
      fireEvent.press(screen.getByTestId('custody-submit-btn'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-001/custody/events', {
        event_type: 'pick_up',
        photo_url: undefined,
        notes: 'Recogida en lobby',
      });
    });
  });

  it('refreshes event list after successful POST', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-delivery'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('custody-submit-btn'));
    });

    await waitFor(() => {
      // GET called twice: once on mount, once after POST
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it('shows error message on 409 TRIP_NOT_ACTIVE', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { code: 'TRIP_NOT_ACTIVE' } },
    });
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-pick_up'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('custody-submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('custody-error-msg')).toBeTruthy();
      expect(screen.getByTestId('custody-error-msg').props.children).toContain('no está activo');
    });
  });

  it('opens image picker on photo button press', async () => {
    mockLaunchCamera.mockResolvedValueOnce({ canceled: true, assets: [] });
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByTestId('take-photo-btn'));
    });

    expect(mockLaunchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 0.7 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Signature flow — requiresSignature: true
// ---------------------------------------------------------------------------

describe('CustodyEventScreen — signature flow', () => {
  const SIGNATURE_TYPES = [
    { code: 'handoff', label: 'Traspaso', requiresPhoto: false, requiresSignature: true },
    { code: 'pick_up', label: 'Recogida', requiresPhoto: false, requiresSignature: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });
    mockPost.mockResolvedValue({ data: { success: true } });
    mockUseVerticalStore.mockReturnValue({ features: { custodyEventTypes: SIGNATURE_TYPES } });
  });

  it('shows SignaturePad when selected type requiresSignature', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-handoff'));

    expect(screen.getByTestId('mock-signature-pad')).toBeTruthy();
  });

  it('submit button stays disabled until user signs', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-handoff'));

    const submitBtn = screen.getByTestId('custody-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled ?? submitBtn.props.disabled).toBeTruthy();
  });

  it('enables submit after signing', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-handoff'));
    fireEvent.press(screen.getByTestId('mock-signature-pad'));

    const submitBtn = screen.getByTestId('custody-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled ?? submitBtn.props.disabled).toBeFalsy();
  });

  it('does not show SignaturePad for event type without requiresSignature', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-pick_up'));

    expect(screen.queryByTestId('mock-signature-pad')).toBeNull();
  });

  it('resets signature when changing event type', async () => {
    render(<CustodyEventScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('event-type-handoff'));
    fireEvent.press(screen.getByTestId('mock-signature-pad'));

    // Switch to non-signature type
    fireEvent.press(screen.getByTestId('event-type-pick_up'));

    // Pad gone and submit re-enabled (no signature needed for pick_up)
    expect(screen.queryByTestId('mock-signature-pad')).toBeNull();
    const submitBtn = screen.getByTestId('custody-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled ?? submitBtn.props.disabled).toBeFalsy();
  });
});
