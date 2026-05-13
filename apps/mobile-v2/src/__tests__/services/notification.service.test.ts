jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  setNotificationHandler: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('../../services/api.client', () => ({
  apiClient: { post: jest.fn().mockResolvedValue({}) },
}));

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationServiceModule = typeof import('../../services/notification.service');
type ExpoNotifications = {
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
  addNotificationReceivedListener: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let NotificationService: NotificationServiceModule['default'];
let apiPost: jest.Mock;
let Expo: ExpoNotifications;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  NotificationService = (require('../../services/notification.service') as NotificationServiceModule).default;
  apiPost = (require('../../services/api.client') as { apiClient: { post: jest.Mock } }).apiClient.post;
  Expo = require('expo-notifications') as ExpoNotifications;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  describe('registerToken', () => {
    it('solicita permiso, obtiene token y llama POST /users/me/device-token', async () => {
      await NotificationService.registerToken();
      expect(Expo.requestPermissionsAsync).toHaveBeenCalled();
      expect(Expo.getExpoPushTokenAsync).toHaveBeenCalled();
      expect(apiPost).toHaveBeenCalledWith(
        '/users/me/device-token',
        expect.objectContaining({ token: 'ExponentPushToken[xxx]', platform: 'android' })
      );
    });

    it('no registra token si el permiso es denegado', async () => {
      Expo.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
      await NotificationService.registerToken();
      expect(Expo.getExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('no lanza error si la API falla (catch silencioso)', async () => {
      apiPost.mockRejectedValueOnce(new Error('Network'));
      await expect(NotificationService.registerToken()).resolves.not.toThrow();
    });

    it('no lanza error si getExpoPushTokenAsync falla', async () => {
      Expo.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('Token error'));
      await expect(NotificationService.registerToken()).resolves.not.toThrow();
    });
  });

  describe('handleNotificationData', () => {
    let navigate: jest.Mock;

    beforeEach(() => {
      navigate = jest.fn();
      NotificationService.setNavigationRef({ navigate });
    });

    it('navega a TripRequest para trip_request', () => {
      NotificationService.handleNotificationData({ type: 'trip_request', tripId: 'trip-1' });
      expect(navigate).toHaveBeenCalledWith('TripRequest', expect.any(Object));
    });

    it('navega a ActiveTrip para trip_accepted', () => {
      NotificationService.handleNotificationData({ type: 'trip_accepted' });
      expect(navigate).toHaveBeenCalledWith('ActiveTrip');
    });

    it('navega a Home con toast para trip_cancelled', () => {
      NotificationService.handleNotificationData({ type: 'trip_cancelled' });
      expect(navigate).toHaveBeenCalledWith('Home', expect.objectContaining({ toast: 'Viaje cancelado' }));
    });

    it('no navega para trip_reminder', () => {
      NotificationService.handleNotificationData({ type: 'trip_reminder' });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('no navega para tipo desconocido', () => {
      NotificationService.handleNotificationData({ type: 'unknown' });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('no lanza error si navigationRef es null', () => {
      NotificationService.setNavigationRef(null as unknown as Parameters<typeof NotificationService.setNavigationRef>[0]);
      expect(() => NotificationService.handleNotificationData({ type: 'trip_accepted' })).not.toThrow();
    });

    it('no lanza error si data es undefined', () => {
      expect(() => NotificationService.handleNotificationData(undefined)).not.toThrow();
    });
  });

  describe('setupForegroundHandler', () => {
    it('registra addNotificationReceivedListener y retorna unsubscribe', () => {
      const unsub = NotificationService.setupForegroundHandler();
      expect(Expo.addNotificationReceivedListener).toHaveBeenCalled();
      expect(typeof unsub).toBe('function');
    });

    it('el listener invoca handleNotificationData con los datos de la notificación', () => {
      const navigate = jest.fn();
      NotificationService.setNavigationRef({ navigate });
      NotificationService.setupForegroundHandler();

      const listener = Expo.addNotificationReceivedListener.mock.calls[0]?.[0] as
        ((n: { request: { content: { data: Record<string, unknown> } } }) => void) | undefined;
      expect(listener).toBeDefined();

      listener!({ request: { content: { data: { type: 'trip_accepted' } } } });
      expect(navigate).toHaveBeenCalledWith('ActiveTrip');
    });

    it('unsubscribe llama sub.remove()', () => {
      const mockRemove = jest.fn();
      Expo.addNotificationReceivedListener.mockReturnValueOnce({ remove: mockRemove });
      const unsub = NotificationService.setupForegroundHandler();
      unsub();
      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('setupBackgroundHandler', () => {
    it('registra addNotificationResponseReceivedListener y retorna unsubscribe', () => {
      const unsub = NotificationService.setupBackgroundHandler();
      expect(Expo.addNotificationResponseReceivedListener).toHaveBeenCalled();
      expect(typeof unsub).toBe('function');
    });

    it('el listener navega al tocar una notificación', () => {
      const navigate = jest.fn();
      NotificationService.setNavigationRef({ navigate });
      NotificationService.setupBackgroundHandler();

      const listener = Expo.addNotificationResponseReceivedListener.mock.calls[0]?.[0] as
        ((r: { notification: { request: { content: { data: Record<string, unknown> } } } }) => void) | undefined;
      expect(listener).toBeDefined();

      listener!({ notification: { request: { content: { data: { type: 'trip_cancelled' } } } } });
      expect(navigate).toHaveBeenCalledWith('Home', expect.objectContaining({ toast: 'Viaje cancelado' }));
    });

    it('unsubscribe llama sub.remove()', () => {
      const mockRemove = jest.fn();
      Expo.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove: mockRemove });
      const unsub = NotificationService.setupBackgroundHandler();
      unsub();
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
