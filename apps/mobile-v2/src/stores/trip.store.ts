import { create } from 'zustand';
import type { Stop } from '../navigation/types';

export interface Trip {
  id: string;
  status: string;
  originLat: number;
  originLng: number;
  originAddress: string;
  stops: Stop[];
  estimatedTotal?: number;
  driverId?: string;
}

interface TripState {
  activeTrip: Trip | null;
  driverLat: number | null;
  driverLng: number | null;
  tripStatus: string | null;
  setActiveTrip: (trip: Trip) => void;
  updateDriverLocation: (lat: number, lng: number) => void;
  updateStatus: (status: string) => void;
  clearTrip: () => void;
}

export const useTripStore = create<TripState>()((set) => ({
  activeTrip: null,
  driverLat: null,
  driverLng: null,
  tripStatus: null,
  setActiveTrip: (trip) => set({ activeTrip: trip, tripStatus: trip.status }),
  updateDriverLocation: (driverLat, driverLng) => set({ driverLat, driverLng }),
  updateStatus: (tripStatus) => set({ tripStatus }),
  clearTrip: () => set({ activeTrip: null, driverLat: null, driverLng: null, tripStatus: null }),
}));
