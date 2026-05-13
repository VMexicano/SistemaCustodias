import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef, ParamListBase } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import MapboxGL from '@rnmapbox/maps';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './src/navigation/RootNavigator';
import NotificationService from './src/services/notification.service';
import { ENV } from './src/config/env';

const queryClient = new QueryClient();

MapboxGL.setAccessToken(ENV.mapboxToken);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const navRef = useRef<NavigationContainerRef<ParamListBase>>(null);

  useEffect(() => {
    if (navRef.current) {
      NotificationService.setNavigationRef(navRef.current);
    }
    const unsubForeground = NotificationService.setupForegroundHandler();
    const unsubBackground = NotificationService.setupBackgroundHandler();
    return () => {
      unsubForeground();
      unsubBackground();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navRef}>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
