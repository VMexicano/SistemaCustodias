import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api.client';

export type NotificationType = 'trip_request' | 'trip_accepted' | 'trip_cancelled' | 'trip_reminder';

type NavigationRef = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
};

let navigationRef: NavigationRef | null = null;

function setNavigationRef(ref: NavigationRef): void {
  navigationRef = ref;
}

async function registerToken(): Promise<void> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await apiClient.post('/users/me/device-token', {
      token: tokenData.data,
      platform: Platform.OS,
    });
  } catch {
    // Silently ignore — app works without push notifications
  }
}

export function handleNotificationData(data: Record<string, unknown> | undefined): void {
  const type = data?.['type'] as NotificationType | undefined;

  switch (type) {
    case 'trip_request':
      navigationRef?.navigate('TripRequest', { data });
      break;
    case 'trip_accepted':
      navigationRef?.navigate('ActiveTrip');
      break;
    case 'trip_cancelled':
      navigationRef?.navigate('Home', { toast: 'Viaje cancelado' });
      break;
    case 'trip_reminder':
      // OS shows the notification — no additional navigation needed
      break;
    default:
      break;
  }
}

function setupForegroundHandler(): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    handleNotificationData(notification.request.content.data as Record<string, unknown>);
  });
  return () => sub.remove();
}

function setupBackgroundHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationData(response.notification.request.content.data as Record<string, unknown>);
  });
  return () => sub.remove();
}

const NotificationService = {
  registerToken,
  handleNotificationData,
  setupForegroundHandler,
  setupBackgroundHandler,
  setNavigationRef,
};
export default NotificationService;
