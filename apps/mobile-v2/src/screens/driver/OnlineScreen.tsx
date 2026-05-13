import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { useDriverStore } from '../../stores/driver.store';
import { DriverStackParamList } from '../../navigation/types';
import { tlog, tlogError } from '../../config/reactotron';
import SessionMenuButton from '../../components/SessionMenuButton';
import { ENV } from '../../config/env';

type OnlineNavProp = StackNavigationProp<DriverStackParamList, 'Online'>;

const CDMX = { lat: 19.4326, lng: -99.1332 };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchRoute(
  fromLng: number, fromLat: number,
  toLng: number, toLat: number,
): Promise<[number, number][]> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full&access_token=${ENV.mapboxToken}`;
    const res = await fetch(url);
    const json = await res.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
    return json.routes?.[0]?.geometry?.coordinates ?? [[fromLng, fromLat], [toLng, toLat]];
  } catch {
    return [[fromLng, fromLat], [toLng, toLat]];
  }
}

const colors = {
  primary900: '#1F3864',
  primary50: '#F4F9FD',
  success: '#28A745',
  neutral: '#6C757D',
};

export default function OnlineScreen(): React.JSX.Element {
  const navigation = useNavigation<OnlineNavProp>();
  const { isOnline, setOnline, pendingRequest, activeTrip, setActiveTrip } = useDriverStore();
  const [lat, setLat] = useState(CDMX.lat);
  const [lng, setLng] = useState(CDMX.lng);
  const [toggling, setToggling] = useState(false);
  const [routeToOrigin, setRouteToOrigin] = useState<[number, number][]>([]);
  const [routeToDestination, setRouteToDestination] = useState<[number, number][]>([]);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  useEffect(() => { latRef.current = lat; }, [lat]);
  useEffect(() => { lngRef.current = lng; }, [lng]);

  useEffect(() => {
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    })();
  }, []);

  // Sincronizar estado online y viaje activo con el backend al montar
  useEffect(() => {
    void (async () => {
      try {
        const [driverRes, tripRes] = await Promise.all([
          apiClient.get<{ online: boolean }>('/drivers/me'),
          apiClient.get<{
            id: string; status: string;
            origin_lat: number; origin_lng: number;
            destination_lat: number; destination_lng: number;
          } | null>('/trips/driver/active'),
        ]);
        setOnline(driverRes.data.online);
        if (tripRes.data) {
          const t = tripRes.data;
          setActiveTrip({
            id: t.id,
            status: t.status,
            originLat: t.origin_lat,
            originLng: t.origin_lng,
            destinationLat: t.destination_lat,
            destinationLng: t.destination_lng,
          });
        }
      } catch {
        // Sin conectividad — mantiene el estado local
      }
    })();
  }, [setOnline, setActiveTrip]);

  // Fetch routes + fit camera when a new pending request arrives
  useEffect(() => {
    if (!pendingRequest) {
      setRouteToOrigin([]);
      setRouteToDestination([]);
      return;
    }

    const driverFar = haversineKm(latRef.current, lngRef.current, pendingRequest.originLat, pendingRequest.originLng) >= 50;

    // Fit camera immediately (don't wait for routes)
    const lngs = driverFar
      ? [pendingRequest.originLng, pendingRequest.destinationLng]
      : [lngRef.current, pendingRequest.originLng, pendingRequest.destinationLng];
    const lats = driverFar
      ? [pendingRequest.originLat, pendingRequest.destinationLat]
      : [latRef.current, pendingRequest.originLat, pendingRequest.destinationLat];

    const ne: [number, number] = [Math.max(...lngs) + 0.01, Math.max(...lats) + 0.01];
    const sw: [number, number] = [Math.min(...lngs) - 0.01, Math.min(...lats) - 0.01];

    setTimeout(() => {
      cameraRef.current?.fitBounds(ne, sw, [80, 40, 220, 40], 700);
    }, 300);

    // Fetch actual routes
    void (async () => {
      const [r1, r2] = await Promise.all([
        driverFar
          ? Promise.resolve<[number, number][]>([])
          : fetchRoute(lngRef.current, latRef.current, pendingRequest.originLng, pendingRequest.originLat),
        fetchRoute(pendingRequest.originLng, pendingRequest.originLat, pendingRequest.destinationLng, pendingRequest.destinationLat),
      ]);
      setRouteToOrigin(r1);
      setRouteToDestination(r2);
    })();
  }, [pendingRequest]);

  useEffect(() => {
    if (activeTrip) navigation.navigate('DriverActiveTrip');
  }, [activeTrip, navigation]);

  async function handleToggle(value: boolean): Promise<void> {
    tlog('toggle:start', { value });
    setToggling(true);
    try {
      if (value) {
        await apiClient.post('/drivers/me/go-online');
        setOnline(true);
        tlog('toggle:online', { success: true });
      } else {
        await apiClient.post('/drivers/me/go-offline');
        setOnline(false);
        tlog('toggle:offline', { success: true });
      }
    } catch (err) {
      tlogError('toggle:error', err);
    } finally {
      setToggling(false);
    }
  }


  return (
    <View testID="driver-online-screen" style={styles.container}>
      <SessionMenuButton
        testID="session-menu-btn-driver-online"
        onPress={() => navigation.navigate('SessionMenu')}
      />

      <View testID="driver-map" style={styles.mapContainer}>
        <MapboxGL.MapView style={styles.map}>
          <MapboxGL.Camera
            ref={cameraRef}
            zoomLevel={14}
            centerCoordinate={[lng, lat]}
            animationMode="none"
          />

          {/* Posición del conductor */}
          <MapboxGL.PointAnnotation id="driverLocation" coordinate={[lng, lat]}>
            <View style={[styles.markerDot, { backgroundColor: isOnline ? colors.success : colors.neutral }]} />
          </MapboxGL.PointAnnotation>

          {pendingRequest && (
            <>
              {/* Ruta conductor → origen */}
              {routeToOrigin.length > 1 && (
                <MapboxGL.ShapeSource
                  id="driverToOrigin"
                  shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeToOrigin }, properties: {} }}
                >
                  <MapboxGL.LineLayer
                    id="driverToOriginLine"
                    style={{ lineColor: '#6C757D', lineWidth: 3, lineDasharray: [3, 2] }}
                  />
                </MapboxGL.ShapeSource>
              )}

              {/* Ruta origen → destino */}
              {routeToDestination.length > 1 && (
                <MapboxGL.ShapeSource
                  id="tripRoute"
                  shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeToDestination }, properties: {} }}
                >
                  <MapboxGL.LineLayer
                    id="tripRouteLine"
                    style={{ lineColor: '#2E75B6', lineWidth: 4 }}
                  />
                </MapboxGL.ShapeSource>
              )}

              <MapboxGL.PointAnnotation id="originPin" coordinate={[pendingRequest.originLng, pendingRequest.originLat]}>
                <View style={[styles.markerDot, { backgroundColor: '#28A745' }]} />
              </MapboxGL.PointAnnotation>
              <MapboxGL.PointAnnotation id="destinationPin" coordinate={[pendingRequest.destinationLng, pendingRequest.destinationLat]}>
                <View style={[styles.markerDot, { backgroundColor: '#DC3545' }]} />
              </MapboxGL.PointAnnotation>
            </>
          )}
        </MapboxGL.MapView>
      </View>

      <View style={styles.statusBar}>
        <Text
          testID={isOnline ? 'driver-status-online' : 'driver-status-offline'}
          style={styles.statusLabel}
        >
          {isOnline ? 'Disponible' : 'No disponible'}
        </Text>
        <Switch
          testID="driver-online-switch"
          value={isOnline}
          onValueChange={(v) => void handleToggle(v)}
          disabled={toggling}
          trackColor={{ false: '#767577', true: colors.success }}
          thumbColor="#fff"
          accessibilityLabel="Toggle disponibilidad"
        />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  markerDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary50,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  statusLabel: { fontSize: 18, fontWeight: 'bold', color: colors.primary900 },
});
