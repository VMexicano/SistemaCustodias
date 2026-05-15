import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { CustodyOperatorStackParamList } from './types';
import CustodyOperatorHomeScreen from '../screens/operator/CustodyOperatorHomeScreen';
import CustodyActiveOrderScreen from '../screens/operator/CustodyActiveOrderScreen';

const Stack = createStackNavigator<CustodyOperatorStackParamList>();

export default function CustodyOperatorStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CustodyOperatorHome" component={CustodyOperatorHomeScreen} />
      <Stack.Screen name="CustodyActiveOrder" component={CustodyActiveOrderScreen} />
    </Stack.Navigator>
  );
}
