import { act } from 'react';
import { useTripStore, Trip } from '../../stores/trip.store';

const TRIP: Trip = {
  id: 'trip-1',
  status: 'SEARCHING',
  originLat: 19.4326,
  originLng: -99.1332,
  originAddress: 'Mi ubicación',
  stops: [{ lat: 19.4526, lng: -99.1132, address: 'Destino de prueba' }],
  estimatedTotal: 85.5,
};

function getStore() {
  return useTripStore.getState();
}

beforeEach(() => {
  act(() => {
    useTripStore.setState({
      activeTrip: null,
      driverLat: null,
      driverLng: null,
      tripStatus: null,
    });
  });
});

describe('trip.store', () => {
  it('initial state is empty', () => {
    const s = getStore();
    expect(s.activeTrip).toBeNull();
    expect(s.driverLat).toBeNull();
    expect(s.driverLng).toBeNull();
    expect(s.tripStatus).toBeNull();
  });

  it('setActiveTrip stores trip and status', () => {
    act(() => getStore().setActiveTrip(TRIP));
    const s = getStore();
    expect(s.activeTrip).toEqual(TRIP);
    expect(s.tripStatus).toBe('SEARCHING');
  });

  it('updateDriverLocation updates coordinates', () => {
    act(() => getStore().updateDriverLocation(19.5, -99.2));
    const s = getStore();
    expect(s.driverLat).toBe(19.5);
    expect(s.driverLng).toBe(-99.2);
  });

  it('updateStatus changes tripStatus only', () => {
    act(() => getStore().setActiveTrip(TRIP));
    act(() => getStore().updateStatus('ACCEPTED'));
    expect(getStore().tripStatus).toBe('ACCEPTED');
    expect(getStore().activeTrip).toEqual(TRIP);
  });

  it('clearTrip resets all state', () => {
    act(() => {
      getStore().setActiveTrip(TRIP);
      getStore().updateDriverLocation(19.5, -99.2);
      getStore().updateStatus('ACCEPTED');
    });
    act(() => getStore().clearTrip());
    const s = getStore();
    expect(s.activeTrip).toBeNull();
    expect(s.driverLat).toBeNull();
    expect(s.driverLng).toBeNull();
    expect(s.tripStatus).toBeNull();
  });

  it('setActiveTrip sets estimatedTotal when provided', () => {
    act(() => getStore().setActiveTrip(TRIP));
    expect(getStore().activeTrip?.estimatedTotal).toBe(85.5);
  });

  it('setActiveTrip without estimatedTotal is allowed', () => {
    const tripNoTotal: Trip = { ...TRIP, estimatedTotal: undefined };
    act(() => getStore().setActiveTrip(tripNoTotal));
    expect(getStore().activeTrip?.estimatedTotal).toBeUndefined();
  });
});
