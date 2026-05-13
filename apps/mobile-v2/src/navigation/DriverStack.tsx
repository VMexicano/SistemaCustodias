import React, { useEffect, useRef } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { DriverStackParamList } from './types';
import OnlineScreen from '../screens/driver/OnlineScreen';
import ActiveTripScreen from '../screens/driver/ActiveTripScreen';
import CustodyEventScreen from '../screens/driver/CustodyEventScreen';
import TemperatureLogScreen from '../screens/driver/TemperatureLogScreen';
import SessionMenuScreen from '../screens/shared/SessionMenuScreen';
import TripRequestModal from '../screens/driver/TripRequestModal';
import { useDriverStore } from '../stores/driver.store';
import { getSocket } from '../services/socket.client';
import { tlog, tlogError } from '../config/reactotron';

const Stack = createStackNavigator<DriverStackParamList>();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function DriverSocketListener(): null {
  const { isOnline, activeTrip, setPendingRequest } = useDriverStore();
  const latRef = useRef(19.4326);
  const lngRef = useRef(-99.1332);

  useEffect(() => {
    if (!isOnline) return;

    const socket = getSocket('driver');
    tlog('socket:init', { connected: socket.connected, id: socket.id });

    socket.on('connect', () => tlog('socket:connect', { id: socket.id }));
    socket.on('connect_error', (err) => tlogError('socket:connect_error', err));
    socket.on('disconnect', (reason) => tlog('socket:disconnect', { reason }));

    socket.on('trip:requested', (data: {
      id: string;
      originAddress: string;
      destinationAddress: string;
      estimatedDistanceKm: number;
      estimatedTotal: number;
      passengerId: string;
      originLat: number;
      originLng: number;
      destinationLat: number;
      destinationLng: number;
    }) => {
      // Si hay viaje activo, el ETA parte del punto de entrega del viaje actual
      const fromLat = activeTrip ? activeTrip.destinationLat : latRef.current;
      const fromLng = activeTrip ? activeTrip.destinationLng : lngRef.current;
      const distToOriginKm = haversineKm(fromLat, fromLng, data.originLat, data.originLng);
      const etaMinutes = Math.max(1, Math.ceil(distToOriginKm / 30 * 60));
      tlog('trip:requested', { id: data.id, etaMinutes, fromActiveTrip: !!activeTrip });
      setPendingRequest({
        id: data.id,
        originAddress: data.originAddress,
        destinationAddress: data.destinationAddress,
        estimatedDistanceKm: data.estimatedDistanceKm,
        estimatedTotal: data.estimatedTotal,
        passengerId: data.passengerId,
        originLat: data.originLat,
        originLng: data.originLng,
        destinationLat: data.destinationLat,
        destinationLng: data.destinationLng,
        etaMinutes,
      });
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('trip:requested');
    };
  }, [isOnline, setPendingRequest]);

  return null;
}

export default function DriverStack(): React.JSX.Element {
  return (
    <>
      <DriverSocketListener />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Online" component={OnlineScreen} />
        <Stack.Screen name="SessionMenu" component={SessionMenuScreen} />
        <Stack.Screen name="DriverActiveTrip" component={ActiveTripScreen} />
        <Stack.Screen name="CustodyEvent" component={CustodyEventScreen} />
        <Stack.Screen name="TemperatureLog" component={TemperatureLogScreen} />
      </Stack.Navigator>
      <TripRequestModal />
    </>
  );
}
