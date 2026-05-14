import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { CustodyClientStackParamList } from './types';
import SelectCustodyTypeScreen from '../screens/client/SelectCustodyTypeScreen';
import NewCustodyOrderScreen from '../screens/client/NewCustodyOrderScreen';
import ValueDeclarationScreen from '../screens/client/ValueDeclarationScreen';

const Stack = createStackNavigator<CustodyClientStackParamList>();

export default function CustodyClientStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SelectCustodyType" component={SelectCustodyTypeScreen} />
      <Stack.Screen name="NewCustodyOrder" component={NewCustodyOrderScreen} />
      <Stack.Screen name="ValueDeclaration" component={ValueDeclarationScreen} />
    </Stack.Navigator>
  );
}
