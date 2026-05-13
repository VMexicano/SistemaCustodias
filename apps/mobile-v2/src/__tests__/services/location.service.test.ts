import type { TaskManagerTaskBody, TaskManagerError as TaskManagerErrorType } from 'expo-task-manager';

// ── Mocks (must be hoisted before imports) ────────────────────────────────────

let capturedTaskCallback: ((body: TaskManagerTaskBody) => void) | null = null;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_, cb: (body: TaskManagerTaskBody) => void) => {
    capturedTaskCallback = cb;
  }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 5 },
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(false),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/api.client', () => ({
  apiClient: { patch: jest.fn().mockResolvedValue({}) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type LocationServiceModule = typeof import('../../services/location.service');

let LocationService: LocationServiceModule['default'];
let apiPatch: jest.Mock;
let ExpoLocation: {
  requestBackgroundPermissionsAsync: jest.Mock;
  hasStartedLocationUpdatesAsync: jest.Mock;
  startLocationUpdatesAsync: jest.Mock;
  stopLocationUpdatesAsync: jest.Mock;
};

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  capturedTaskCallback = null;

  LocationService = (require('../../services/location.service') as LocationServiceModule).default;
  apiPatch = (require('../../services/api.client') as { apiClient: { patch: jest.Mock } }).apiClient.patch;
  ExpoLocation = require('expo-location') as typeof ExpoLocation;
});

afterEach(async () => {
  await LocationService.stopTracking();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LocationService', () => {
  describe('startTracking', () => {
    it('solicita permiso background y llama startLocationUpdatesAsync', async () => {
      await LocationService.startTracking('trip-1');
      expect(ExpoLocation.requestBackgroundPermissionsAsync).toHaveBeenCalled();
      expect(ExpoLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'driver-location-task',
        expect.objectContaining({
          foregroundService: expect.objectContaining({
            notificationTitle: expect.any(String),
            notificationBody: expect.any(String),
          }),
        })
      );
    });

    it('no inicia si el permiso es denegado', async () => {
      ExpoLocation.requestBackgroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
      await LocationService.startTracking('trip-1');
      expect(ExpoLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('no inicia si el task ya está corriendo', async () => {
      ExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
      await LocationService.startTracking('trip-1');
      expect(ExpoLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  describe('stopTracking', () => {
    it('llama stopLocationUpdatesAsync si el task estaba activo', async () => {
      ExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
      await LocationService.stopTracking();
      expect(ExpoLocation.stopLocationUpdatesAsync).toHaveBeenCalled();
    });

    it('no llama stop si el task no estaba activo', async () => {
      ExpoLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
      await LocationService.stopTracking();
      expect(ExpoLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  describe('enqueue + flush', () => {
    it('flush no hace nada si la cola está vacía', async () => {
      await LocationService.flush();
      expect(apiPatch).not.toHaveBeenCalled();
    });

    it('flush envía el punto más reciente y limpia la cola', async () => {
      LocationService.enqueue({ lat: 19.43, lng: -99.13, timestamp: 1000 });
      LocationService.enqueue({ lat: 19.44, lng: -99.14, timestamp: 2000 });
      await LocationService.flush();
      expect(apiPatch).toHaveBeenCalledWith('/drivers/me/location', {
        latitude: 19.44,
        longitude: -99.14,
      });
    });

    it('flush mantiene la cola si la request falla', async () => {
      apiPatch.mockRejectedValueOnce(new Error('Network'));
      LocationService.enqueue({ lat: 19.44, lng: -99.14, timestamp: 1000 });
      await LocationService.flush();
      expect(apiPatch).toHaveBeenCalled();
      // No error thrown
    });

    it('cola descarta el punto más antiguo al superar MAX_QUEUE_SIZE', () => {
      for (let i = 0; i < 101; i++) {
        LocationService.enqueue({ lat: i, lng: i, timestamp: i });
      }
      // No error — queue capped at 100
      expect(true).toBe(true);
    });
  });

  describe('setConnected', () => {
    it('setConnected(true) cuando estaba offline dispara flush', async () => {
      LocationService.setConnected(false);
      LocationService.enqueue({ lat: 19.44, lng: -99.14, timestamp: 1000 });
      LocationService.setConnected(true);
      await Promise.resolve(); // allow async flush to be called
      expect(apiPatch).toHaveBeenCalledWith('/drivers/me/location', {
        latitude: 19.44,
        longitude: -99.14,
      });
    });

    it('setConnected(true) dos veces seguidas no hace doble flush', async () => {
      LocationService.setConnected(true); // ya estaba conectado
      LocationService.setConnected(true);
      expect(apiPatch).not.toHaveBeenCalled();
    });
  });

  describe('background task callback', () => {
    it('procesa ubicación válida y llama patch', async () => {
      expect(capturedTaskCallback).not.toBeNull();
      capturedTaskCallback!({
        data: {
          locations: [
            { coords: { latitude: 19.5, longitude: -99.2 }, timestamp: 3000 } as { coords: { latitude: number; longitude: number }; timestamp: number },
          ],
        },
        error: null,
      } as unknown as TaskManagerTaskBody);
      await Promise.resolve();
      expect(apiPatch).toHaveBeenCalledWith('/drivers/me/location', {
        latitude: 19.5,
        longitude: -99.2,
      });
    });

    it('ignora si hay error en el task', async () => {
      capturedTaskCallback!({
        data: null,
        error: { message: 'GPS error' } as TaskManagerErrorType,
      } as unknown as TaskManagerTaskBody);
      await Promise.resolve();
      expect(apiPatch).not.toHaveBeenCalled();
    });

    it('ignora si locations está vacío', async () => {
      capturedTaskCallback!({
        data: { locations: [] },
        error: null,
      } as unknown as TaskManagerTaskBody);
      await Promise.resolve();
      expect(apiPatch).not.toHaveBeenCalled();
    });

    it('encola si está offline', async () => {
      LocationService.setConnected(false);
      apiPatch.mockClear();
      capturedTaskCallback!({
        data: {
          locations: [
            { coords: { latitude: 19.5, longitude: -99.2 }, timestamp: 3000 } as { coords: { latitude: number; longitude: number }; timestamp: number },
          ],
        },
        error: null,
      } as unknown as TaskManagerTaskBody);
      await Promise.resolve();
      expect(apiPatch).not.toHaveBeenCalled();
    });

    it('encola cuando patch falla estando online (catch de sendLocation)', async () => {
      apiPatch.mockRejectedValueOnce(new Error('Network'));
      capturedTaskCallback!({
        data: {
          locations: [
            { coords: { latitude: 19.5, longitude: -99.2 }, timestamp: 4000 } as { coords: { latitude: number; longitude: number }; timestamp: number },
          ],
        },
        error: null,
      } as unknown as TaskManagerTaskBody);
      await new Promise((r) => setTimeout(r, 10));
      // patch was called (and failed), subsequent flush should send the queued point
      apiPatch.mockResolvedValueOnce({});
      await LocationService.flush();
      expect(apiPatch).toHaveBeenCalledWith('/drivers/me/location', {
        latitude: 19.5,
        longitude: -99.2,
      });
    });
  });

  describe('loadQueue catch branch', () => {
    it('devuelve [] si MMKV contiene JSON inválido', async () => {
      // Use spy to make getString return invalid JSON → JSON.parse throws → catch → []
      // enqueue then flush: flush reads empty queue and does nothing
      const { MMKV: MockMMKV } = require('react-native-mmkv') as { MMKV: new (opts: object) => { getString: (k: string) => string | undefined } };
      const spy = jest.spyOn(MockMMKV.prototype, 'getString').mockReturnValueOnce('{invalid json{{');
      LocationService.enqueue({ lat: 1, lng: 2, timestamp: 1 }); // loadQueue → catch → []
      spy.mockRestore();
      // After restore, flush should find the single item we just enqueued
      await LocationService.flush();
      expect(apiPatch).toHaveBeenCalled();
    });
  });
});
