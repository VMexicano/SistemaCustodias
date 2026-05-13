import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const ENV = {
  appName: extra.appName ?? 'RideBase',
  verticalSlug: extra.verticalSlug ?? 'taxi',
  mapboxToken: extra.mapboxPublicToken ?? '',
  apiUrl: extra.apiUrl ?? 'http://10.0.2.2:3333',
  socketUrl: extra.socketUrl ?? 'http://10.0.2.2:3333',
} as const;
