import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { useDriverStore } from '../../stores/driver.store';
import { useVerticalFeatures } from '../../hooks/useVerticalFeatures';
import LocationService from '../../services/location.service';
import { DriverStackParamList } from '../../navigation/types';
import SessionMenuButton from '../../components/SessionMenuButton';
import { tlog, tlogError } from '../../config/reactotron';
import { ENV } from '../../config/env';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
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
    const json = await res.json() as { code?: string; message?: string; routes?: { geometry: { coordinates: [number, number][] } }[] };
    tlog('fetchRoute:response', { code: json.code, message: json.message, routeCount: json.routes?.length, tokenOk: !!ENV.mapboxToken });
    return json.routes?.[0]?.geometry?.coordinates ?? [[fromLng, fromLat], [toLng, toLat]];
  } catch (err) {
    tlogError('fetchRoute:error', err);
    return [[fromLng, fromLat], [toLng, toLat]];
  }
}

type DriverActiveTripNavProp = StackNavigationProp<DriverStackParamList, 'DriverActiveTrip'>;

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  success: '#28A745',
  neutral: '#6C757D',
};

type DriverTripStatus = 'ACCEPTED' | 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';

const STATUS_ACTIONS: Record<string, { label: string; nextStatus: DriverTripStatus } | null> = {
  ACCEPTED: { label: 'Ir al origen', nextStatus: 'DRIVER_EN_ROUTE' },
  DRIVER_EN_ROUTE: { label: 'Llegué al origen', nextStatus: 'DRIVER_ARRIVED' },
  DRIVER_ARRIVED: { label: 'Iniciar viaje', nextStatus: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Completar viaje', nextStatus: 'COMPLETED' },
  COMPLETED: null,
};

const CDMX = { lat: 19.4326, lng: -99.1332 };

export default function ActiveTripScreen(): React.JSX.Element {
  const navigation = useNavigation<DriverActiveTripNavProp>();
  const { activeTrip, setActiveTrip, setOnline, pendingRequest, queuedTrip, setQueuedTrip } = useDriverStore();
  const features = useVerticalFeatures();
  const [loading, setLoading] = useState(false);
  const [driverLat, setDriverLat] = useState(CDMX.lat);
  const [driverLng, setDriverLng] = useState(CDMX.lng);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [destRouteCoords, setDestRouteCoords] = useState<[number, number][]>([]);
  const [pendingRouteCoords, setPendingRouteCoords] = useState<[number, number][]>([]);
  const [locationReady, setLocationReady] = useState(false);
  const [distToOriginM, setDistToOriginM] = useState<number>(Infinity);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const driverLatRef = useRef(CDMX.lat);
  const driverLngRef = useRef(CDMX.lng);
  const zoomRef = useRef(17);

  useEffect(() => {
    tlog('ActiveTrip:mount', {
      tripId: activeTrip?.id,
      status: activeTrip?.status,
      chainOfCustody: features.chainOfCustody,
      temperatureLog: features.temperatureLog,
    });
  }, [activeTrip, features]);

  useEffect(() => {
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({});
      driverLatRef.current = pos.coords.latitude;
      driverLngRef.current = pos.coords.longitude;
      setDriverLat(pos.coords.latitude);
      setDriverLng(pos.coords.longitude);
      setLocationReady(true);
      if (activeTrip) {
        setDistToOriginM(haversineMeters(pos.coords.latitude, pos.coords.longitude, activeTrip.originLat, activeTrip.originLng));
      }
      cameraRef.current?.setCamera({ centerCoordinate: [pos.coords.longitude, pos.coords.latitude], zoomLevel: 17, animationDuration: 500 });

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (update) => {
          setDriverLat(update.coords.latitude);
          setDriverLng(update.coords.longitude);
          driverLatRef.current = update.coords.latitude;
          driverLngRef.current = update.coords.longitude;
          if (activeTrip) {
            setDistToOriginM(haversineMeters(update.coords.latitude, update.coords.longitude, activeTrip.originLat, activeTrip.originLng));
          }
          cameraRef.current?.setCamera({
            centerCoordinate: [update.coords.longitude, update.coords.latitude],
            zoomLevel: 17,
            animationDuration: 800,
          });
        },
      );
    })();

    return () => {
      locationSubRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeTrip) return;
    // Para DRIVER_EN_ROUTE necesitamos la posición GPS real antes de calcular la ruta
    if (activeTrip.status === 'DRIVER_EN_ROUTE' && !locationReady) return;

    const { status, originLat, originLng, destinationLat, destinationLng } = activeTrip;

    if (status === 'DRIVER_EN_ROUTE') {
      void (async () => {
        const [toOrigin, toDest] = await Promise.all([
          fetchRoute(driverLngRef.current, driverLatRef.current, originLng, originLat),
          fetchRoute(originLng, originLat, destinationLng, destinationLat),
        ]);
        setRouteCoords(toOrigin);       // gris punteada: conductor → origen
        setDestRouteCoords(toDest);     // azul tenue: origen → destino (preview)
      })();
    } else if (status === 'IN_PROGRESS') {
      void (async () => {
        const coords = await fetchRoute(driverLngRef.current, driverLatRef.current, destinationLng, destinationLat);
        setRouteCoords(coords);         // azul sólida: conductor → destino
        setDestRouteCoords([]);
      })();
    } else {
      setRouteCoords([]);
      setDestRouteCoords([]);
    }
  }, [activeTrip?.status, locationReady]);

  // Ruta del viaje entrante: destino_actual → nuevo_origen → nuevo_destino
  useEffect(() => {
    if (!pendingRequest || !activeTrip) {
      setPendingRouteCoords([]);
      // Restaurar cámara al conductor
      if (driverLatRef.current && driverLngRef.current) {
        cameraRef.current?.setCamera({
          centerCoordinate: [driverLngRef.current, driverLatRef.current],
          zoomLevel: 17,
          animationDuration: 600,
        });
      }
      return;
    }
    void (async () => {
      const [leg1, leg2] = await Promise.all([
        fetchRoute(activeTrip.destinationLng, activeTrip.destinationLat, pendingRequest.originLng, pendingRequest.originLat),
        fetchRoute(pendingRequest.originLng, pendingRequest.originLat, pendingRequest.destinationLng, pendingRequest.destinationLat),
      ]);
      const combined = [...leg1, ...leg2];
      setPendingRouteCoords(combined);

      // fitBounds para mostrar: conductor + destino actual + nuevo origen + nuevo destino
      const allLngs = [driverLngRef.current, activeTrip.destinationLng, pendingRequest.originLng, pendingRequest.destinationLng];
      const allLats = [driverLatRef.current, activeTrip.destinationLat, pendingRequest.originLat, pendingRequest.destinationLat];
      const ne: [number, number] = [Math.max(...allLngs) + 0.01, Math.max(...allLats) + 0.01];
      const sw: [number, number] = [Math.min(...allLngs) - 0.01, Math.min(...allLats) - 0.01];
      setTimeout(() => cameraRef.current?.fitBounds(ne, sw, [80, 40, 320, 40], 800), 300);
    })();
  }, [pendingRequest, activeTrip]);

  async function handleStatusAction(nextStatus: DriverTripStatus): Promise<void> {
    if (!activeTrip) return;
    setLoading(true);
    tlog('ActiveTrip:statusAction', { tripId: activeTrip.id, nextStatus });
    try {
      await apiClient.patch(`/trips/${activeTrip.id}/status`, { status: nextStatus });
      if (nextStatus === 'COMPLETED') {
        tlog('ActiveTrip:completed', { tripId: activeTrip.id, hasQueued: !!queuedTrip });
        if (queuedTrip) {
          await LocationService.startTracking(queuedTrip.id);
          setActiveTrip(queuedTrip);
          setQueuedTrip(null);
        } else {
          await LocationService.stopTracking();
          setActiveTrip(null);
          setOnline(false);
          navigation.navigate('Online');
        }
      } else {
        setActiveTrip({ ...activeTrip, status: nextStatus });
        tlog('ActiveTrip:statusUpdated', { tripId: activeTrip.id, status: nextStatus });
      }
    } catch (err) {
      tlogError('ActiveTrip:statusAction', err);
      Alert.alert('Error', 'No se pudo actualizar el estado del viaje.');
    } finally {
      setLoading(false);
    }
  }

  if (!activeTrip) {
    return (
      <View style={styles.center}>
        <Text style={styles.noTrip}>Sin viaje activo</Text>
      </View>
    );
  }

  const action = STATUS_ACTIONS[activeTrip.status as DriverTripStatus] ?? null;
  const arrivedProximityOk = activeTrip.status !== 'DRIVER_EN_ROUTE' || distToOriginM <= 50;
  const distLabel = activeTrip.status === 'DRIVER_EN_ROUTE' && distToOriginM > 50
    ? `${distToOriginM < 1000 ? Math.round(distToOriginM) + ' m' : (distToOriginM / 1000).toFixed(1) + ' km'} al origen`
    : null;

  return (
    <View style={styles.container}>
      <SessionMenuButton
        testID="session-menu-btn-driver-trip"
        onPress={() => navigation.navigate('SessionMenu')}
      />

      <MapboxGL.MapView style={styles.map}>
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={17}
          centerCoordinate={[driverLng, driverLat]}
          animationMode="none"
        />

        {/* Preview origen→destino (visible durante DRIVER_EN_ROUTE) */}
        {destRouteCoords.length > 1 && (
          <MapboxGL.ShapeSource
            id="destPreviewRoute"
            shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: destRouteCoords }, properties: {} }}
          >
            <MapboxGL.LineLayer
              id="destPreviewRouteLine"
              style={{ lineColor: '#2E75B6', lineWidth: 3, lineOpacity: 0.4 }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Ruta activa (conductor→origen en EN_ROUTE / conductor→destino en IN_PROGRESS) */}
        {routeCoords.length > 1 && (
          <MapboxGL.ShapeSource
            id="activeRoute"
            shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords }, properties: {} }}
          >
            <MapboxGL.LineLayer
              id="activeRouteLine"
              style={{
                lineColor: activeTrip?.status === 'DRIVER_EN_ROUTE' ? '#6C757D' : '#2E75B6',
                lineWidth: 4,
                lineDasharray: activeTrip?.status === 'DRIVER_EN_ROUTE' ? [3, 2] : undefined,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Marcador origen */}
        {activeTrip && (
          <MapboxGL.PointAnnotation id="originPin" coordinate={[activeTrip.originLng, activeTrip.originLat]}>
            <View style={[styles.markerDot, { backgroundColor: '#28A745' }]} />
          </MapboxGL.PointAnnotation>
        )}

        {/* Marcador destino */}
        {activeTrip && activeTrip.status === 'IN_PROGRESS' && (
          <MapboxGL.PointAnnotation id="destinationPin" coordinate={[activeTrip.destinationLng, activeTrip.destinationLat]}>
            <View style={[styles.markerDot, { backgroundColor: '#DC3545' }]} />
          </MapboxGL.PointAnnotation>
        )}

        {/* Ruta + marcadores del viaje entrante — solo mientras el modal está activo */}
        {pendingRequest && (
          <>
            {pendingRouteCoords.length > 1 && (
              <MapboxGL.ShapeSource
                id="pendingRoute"
                shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: pendingRouteCoords }, properties: {} }}
              >
                <MapboxGL.LineLayer
                  id="pendingRouteLine"
                  style={{ lineColor: '#9C27B0', lineWidth: 3, lineDasharray: [4, 2], lineOpacity: 0.8 }}
                />
              </MapboxGL.ShapeSource>
            )}
            <MapboxGL.PointAnnotation id="pendingOrigin" coordinate={[pendingRequest.originLng, pendingRequest.originLat]}>
              <View style={[styles.markerDot, { backgroundColor: '#FFC107' }]} />
            </MapboxGL.PointAnnotation>
            <MapboxGL.PointAnnotation id="pendingDest" coordinate={[pendingRequest.destinationLng, pendingRequest.destinationLat]}>
              <View style={[styles.markerDot, { backgroundColor: '#FF5722' }]} />
            </MapboxGL.PointAnnotation>
          </>
        )}

        {/* Marcador conductor */}
        <MapboxGL.PointAnnotation id="driverPos" coordinate={[driverLng, driverLat]}>
          <View style={styles.driverDot} />
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      {/* Controles de zoom */}
      <View style={styles.zoomControls}>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => {
            zoomRef.current = Math.min(zoomRef.current + 1, 20);
            cameraRef.current?.setCamera({ zoomLevel: zoomRef.current, animationDuration: 300 });
          }}
        >
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => {
            zoomRef.current = Math.max(zoomRef.current - 1, 5);
            cameraRef.current?.setCamera({ zoomLevel: zoomRef.current, animationDuration: 300 });
          }}
        >
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        {queuedTrip && (
          <View style={styles.queuedBanner}>
            <Text style={styles.queuedBannerText}>🔜 Próximo viaje aceptado en cola</Text>
          </View>
        )}

        <View style={styles.statusChip}>
          <Text style={styles.statusText}>{activeTrip.status}</Text>
        </View>

        {action && (
          <>
            {distLabel && (
              <View style={styles.distBanner}>
                <Text style={styles.distText}>📍 {distLabel}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, !arrivedProximityOk && styles.actionBtnDisabled]}
              onPress={() => void handleStatusAction(action.nextStatus)}
              disabled={loading || !arrivedProximityOk}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>
                  {arrivedProximityOk ? action.label : 'Acércate al origen'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {features.chainOfCustody &&
          (activeTrip.status === 'DRIVER_ARRIVED' || activeTrip.status === 'IN_PROGRESS') && (
            <TouchableOpacity
              testID="custody-event-btn"
              style={styles.verticalBtn}
              onPress={() => navigation.navigate('CustodyEvent', { tripId: activeTrip.id })}
              accessibilityRole="button"
            >
              <Text style={styles.verticalBtnText}>Cadena de custodia</Text>
            </TouchableOpacity>
          )}

        {features.temperatureLog &&
          activeTrip.status === 'IN_PROGRESS' && (
            <TouchableOpacity
              testID="temperature-log-btn"
              style={styles.verticalBtn}
              onPress={() =>
                navigation.navigate('TemperatureLog', { tripId: activeTrip.id })
              }
              accessibilityRole="button"
            >
              <Text style={styles.verticalBtnText}>Temperatura</Text>
            </TouchableOpacity>
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noTrip: { fontSize: 16, color: colors.neutral },
  map: { flex: 1 },
  panel: {
    backgroundColor: colors.primary50,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  statusChip: {
    backgroundColor: colors.primary600,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtn: {
    backgroundColor: colors.success,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  actionBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  verticalBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.primary600,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  verticalBtnText: { color: colors.primary600, fontSize: 15, fontWeight: '600' },
  driverDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary600, borderWidth: 2, borderColor: '#fff' },
  markerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  zoomControls: {
    position: 'absolute',
    right: 12,
    top: '40%',
    gap: 4,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  zoomBtnText: { fontSize: 22, fontWeight: '600', color: colors.primary900, lineHeight: 26 },
  actionBtnDisabled: { backgroundColor: colors.neutral },
  queuedBanner: { backgroundColor: '#EDE7F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, alignItems: 'center' },
  queuedBannerText: { fontSize: 13, color: '#6A1B9A', fontWeight: '600' },
  distBanner: { backgroundColor: '#EBF3FB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, alignItems: 'center' },
  distText: { fontSize: 13, color: colors.primary600, fontWeight: '600' },
});
