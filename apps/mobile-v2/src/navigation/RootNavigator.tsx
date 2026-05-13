import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '../stores/auth.store';
import { useVerticalStore } from '../stores/vertical.store';
import LoginScreen from '../screens/auth/LoginScreen';
import PassengerStack from './PassengerStack';
import DriverStack from './DriverStack';
import { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator(): React.JSX.Element {
  const { accessToken, role } = useAuthStore();

  useEffect(() => {
    void useVerticalStore.getState().fetchConfig();
  }, []);

  if (!accessToken || !role) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (role === 'passenger') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="PassengerStack" component={PassengerStack} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverStack" component={DriverStack} />
    </Stack.Navigator>
  );
}
