import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { MMKV } from 'react-native-mmkv';
import { apiClient } from './api.client';
import { ENV } from '../config/env';

export const LOCATION_TASK = 'driver-location-task';
const QUEUE_KEY = 'offline_gps_queue';
const MAX_QUEUE_SIZE = 100;

export interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

const storage = new MMKV({ id: 'location-service' });
let isConnected = true;

function loadQueue(): LocationPoint[] {
  try {
    const raw = storage.getString(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as LocationPoint[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: LocationPoint[]): void {
  storage.set(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue(point: LocationPoint): void {
  const queue = loadQueue();
  if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
  queue.push(point);
  saveQueue(queue);
}

async function sendLocation(point: LocationPoint): Promise<void> {
  if (!isConnected) {
    enqueue(point);
    return;
  }
  try {
    await apiClient.patch('/drivers/me/location', {
      latitude: point.lat,
      longitude: point.lng,
    });
  } catch {
    enqueue(point);
  }
}

export async function flush(): Promise<void> {
  const queue = loadQueue();
  if (queue.length === 0) return;
  const latest = queue[queue.length - 1];
  if (!latest) return;
  try {
    await apiClient.patch('/drivers/me/location', {
      latitude: latest.lat,
      longitude: latest.lng,
    });
    saveQueue([]);
  } catch {
    // keep queue intact on failure
  }
}

export function setConnected(connected: boolean): void {
  const wasDisconnected = !isConnected;
  isConnected = connected;
  if (connected && wasDisconnected) void flush();
}

export async function startTracking(tripId: string): Promise<void> {
  storage.set('active_trip_id', tripId);
  isConnected = true;

  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return;

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    foregroundService: {
      notificationTitle: `${ENV.appName} — Viaje activo`,
      notificationBody: 'Compartiendo tu ubicación con el pasajero.',
    },
  });
}

export async function stopTracking(): Promise<void> {
  storage.delete('active_trip_id');

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

// Must be defined at module root — called by the OS when app is in background
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[0];
  if (!loc) return;
  await sendLocation({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    timestamp: loc.timestamp,
  });
});

const LocationService = { startTracking, stopTracking, flush, setConnected, enqueue };
export default LocationService;
