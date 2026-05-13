import { act } from 'react';
import { useDriverStore, TripRequest } from '../../stores/driver.store';

const REQUEST: TripRequest = {
  id: 'trip-99',
  originAddress: 'Av. Insurgentes Sur 123',
  destinationAddress: 'Aeropuerto AICM',
  estimatedDistanceKm: 12.5,
  estimatedTotal: 145.0,
  passengerId: 'user-1',
  originLat: 19.4326,
  originLng: -99.1332,
  destinationLat: 19.4500,
  destinationLng: -99.0700,
  etaMinutes: 5,
};

function getStore() {
  return useDriverStore.getState();
}

beforeEach(() => {
  act(() => {
    useDriverStore.setState({ isOnline: false, pendingRequest: null, activeTrip: null });
  });
});

describe('driver.store', () => {
  it('initial state is offline with no trip', () => {
    const s = getStore();
    expect(s.isOnline).toBe(false);
    expect(s.pendingRequest).toBeNull();
    expect(s.activeTrip).toBeNull();
  });

  it('setOnline(true) marks driver as online', () => {
    act(() => getStore().setOnline(true));
    expect(getStore().isOnline).toBe(true);
  });

  it('setOnline(false) marks driver as offline', () => {
    act(() => {
      getStore().setOnline(true);
      getStore().setOnline(false);
    });
    expect(getStore().isOnline).toBe(false);
  });

  it('setPendingRequest stores the request', () => {
    act(() => getStore().setPendingRequest(REQUEST));
    expect(getStore().pendingRequest).toEqual(REQUEST);
  });

  it('setPendingRequest(null) clears the request', () => {
    act(() => {
      getStore().setPendingRequest(REQUEST);
      getStore().setPendingRequest(null);
    });
    expect(getStore().pendingRequest).toBeNull();
  });

  const ACTIVE_TRIP = { id: 'trip-99', status: 'ACCEPTED', originLat: 19.4326, originLng: -99.1332, destinationLat: 19.45, destinationLng: -99.07 };

  it('setActiveTrip stores trip with status', () => {
    act(() => getStore().setActiveTrip(ACTIVE_TRIP));
    const s = getStore();
    expect(s.activeTrip?.id).toBe('trip-99');
    expect(s.activeTrip?.status).toBe('ACCEPTED');
  });

  it('setActiveTrip(null) clears active trip', () => {
    act(() => {
      getStore().setActiveTrip(ACTIVE_TRIP);
      getStore().setActiveTrip(null);
    });
    expect(getStore().activeTrip).toBeNull();
  });

  it('setActiveTrip does not affect isOnline or pendingRequest', () => {
    act(() => {
      getStore().setOnline(true);
      getStore().setPendingRequest(REQUEST);
      getStore().setActiveTrip({ ...ACTIVE_TRIP, status: 'IN_PROGRESS' });
    });
    const s = getStore();
    expect(s.isOnline).toBe(true);
    expect(s.pendingRequest).toEqual(REQUEST);
  });
});
