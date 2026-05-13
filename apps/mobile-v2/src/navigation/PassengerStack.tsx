import React, { useEffect, useRef } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { PassengerStackParamList } from './types';
import HomeScreen from '../screens/passenger/HomeScreen';
import EstimateScreen from '../screens/passenger/EstimateScreen';
import CargoDeclarationScreen from '../screens/passenger/CargoDeclarationScreen';
import ActiveTripScreen from '../screens/passenger/ActiveTripScreen';
import SessionMenuScreen from '../screens/shared/SessionMenuScreen';
import ScheduledTripsScreen from '../screens/passenger/ScheduledTripsScreen';
import ScheduleConfirmScreen from '../screens/passenger/ScheduleConfirmScreen';
import { useTripStore } from '../stores/trip.store';
import { apiClient } from '../services/api.client';

interface ActiveTripApiResponse {
  id: string;
  status: string;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  estimated_fare: number | string | null;
  driver_id: string | null;
}

// Fires once on mount — populates trip store so HomeScreen can redirect.
function PassengerInitializer(): null {
  const { setActiveTrip } = useTripStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      try {
        const res = await apiClient.get<ActiveTripApiResponse | null>('/trips/active');
        const trip = res.data;
        if (!trip?.id) return;
        setActiveTrip({
          id: trip.id,
          status: trip.status,
          originLat: Number(trip.origin_lat),
          originLng: Number(trip.origin_lng),
          originAddress: trip.origin_address,
          stops: [{
            lat: Number(trip.destination_lat),
            lng: Number(trip.destination_lng),
            address: trip.destination_address,
          }],
          estimatedTotal: trip.estimated_fare != null ? Number(trip.estimated_fare) : undefined,
          driverId: trip.driver_id ?? undefined,
        });
      } catch {
        // No active trip or auth error — stay on Home.
      }
    })();
  }, [setActiveTrip]);

  return null;
}

const Stack = createStackNavigator<PassengerStackParamList>();

export default function PassengerStack(): React.JSX.Element {
  return (
    <>
      <PassengerInitializer />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="SessionMenu" component={SessionMenuScreen} />
        <Stack.Screen name="Estimate" component={EstimateScreen} />
        <Stack.Screen name="CargoDeclaration" component={CargoDeclarationScreen} />
        <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
        <Stack.Screen name="ScheduledTrips" component={ScheduledTripsScreen} />
        <Stack.Screen name="ScheduleConfirm" component={ScheduleConfirmScreen} />
      </Stack.Navigator>
    </>
  );
}
