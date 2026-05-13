import { create } from 'zustand';

export interface TripRequest {
  id: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistanceKm: number;
  estimatedTotal: number;
  passengerId: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  etaMinutes: number;
}

export interface ActiveTrip {
  id: string;
  status: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

interface DriverState {
  isOnline: boolean;
  pendingRequest: TripRequest | null;
  activeTrip: ActiveTrip | null;
  queuedTrip: ActiveTrip | null;
  setOnline: (online: boolean) => void;
  setPendingRequest: (request: TripRequest | null) => void;
  setActiveTrip: (trip: ActiveTrip | null) => void;
  setQueuedTrip: (trip: ActiveTrip | null) => void;
}

export const useDriverStore = create<DriverState>()((set) => ({
  isOnline: false,
  pendingRequest: null,
  activeTrip: null,
  queuedTrip: null,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingRequest: (pendingRequest) => set({ pendingRequest }),
  setActiveTrip: (activeTrip) => set({ activeTrip }),
  setQueuedTrip: (queuedTrip) => set({ queuedTrip }),
}));
