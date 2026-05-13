import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { useTripStore } from '../../stores/trip.store';
import { useVerticalFeatures } from '../../hooks/useVerticalFeatures';
import { PassengerStackParamList } from '../../navigation/types';

type EstimateRouteProp = RouteProp<PassengerStackParamList, 'Estimate'>;
type EstimateNavProp = StackNavigationProp<PassengerStackParamList, 'Estimate'>;

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary100: '#EBF3FB',
  primary50: '#F4F9FD',
  success: '#28A745',
  neutral: '#6C757D',
  error: '#DC3545',
};

interface TripType {
  id: string;
  name: string;
  description: string;
  base_fare: number;
}

interface PriceEstimate {
  subtotal: number;
  tax: number;
  total: number;
  estimatedDistanceKm: number;
}

type EstimateState = PriceEstimate | 'loading' | 'error';

export default function EstimateScreen(): React.JSX.Element {
  const route = useRoute<EstimateRouteProp>();
  const navigation = useNavigation<EstimateNavProp>();
  const { originLat, originLng, originAddress, stops } = route.params;
  const finalStop = stops[stops.length - 1];
  const { setActiveTrip } = useTripStore();
  const features = useVerticalFeatures();

  const [tripTypes, setTripTypes] = useState<TripType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typesError, setTypesError] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, EstimateState>>({});
  const [creating, setCreating] = useState(false);

  const mapBounds = {
    ne: [Math.max(originLng, finalStop.lng) + 0.005, Math.max(originLat, finalStop.lat) + 0.005] as [number, number],
    sw: [Math.min(originLng, finalStop.lng) - 0.005, Math.min(originLat, finalStop.lat) - 0.005] as [number, number],
  };

  async function loadTripTypes(): Promise<void> {
    setLoadingTypes(true);
    setTypesError(false);
    try {
      const res = await apiClient.get<TripType[]>('/trip-types');
      setTripTypes(res.data);
    } catch {
      setTypesError(true);
    } finally {
      setLoadingTypes(false);
    }
  }

  useEffect(() => {
    void loadTripTypes();
  }, []);

  // Pre-fetch all estimates in parallel as soon as trip types load
  useEffect(() => {
    if (tripTypes.length === 0) return;

    const initial: Record<string, EstimateState> = {};
    tripTypes.forEach((t) => { initial[t.id] = 'loading'; });
    setEstimates(initial);

    tripTypes.forEach((type) => {
      apiClient
        .post<{
          subtotal: number;
          tax_amount: number;
          final_fare: number;
          estimated_distance_km: number;
        }>('/trips/estimate', {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: finalStop.lat, lng: finalStop.lng },
          trip_type_id: type.id,
        })
        .then((res) => {
          setEstimates((prev) => ({
            ...prev,
            [type.id]: {
              subtotal: res.data.subtotal,
              tax: res.data.tax_amount,
              total: res.data.final_fare,
              estimatedDistanceKm: res.data.estimated_distance_km,
            },
          }));
        })
        .catch(() => {
          setEstimates((prev) => ({ ...prev, [type.id]: 'error' }));
        });
    });
  }, [tripTypes, originLat, originLng, finalStop.lat, finalStop.lng]);

  async function handleConfirm(): Promise<void> {
    if (!selectedTypeId) return;
    const est = estimates[selectedTypeId];
    if (!est || est === 'loading' || est === 'error') return;

    if (features.cargoDeclaration) {
      navigation.navigate('CargoDeclaration', {
        tripTypeId: selectedTypeId,
        originLat,
        originLng,
        originAddress,
        stops,
        estimatedFare: est.total,
      });
      return;
    }

    setCreating(true);
    try {
      const res = await apiClient.post<{ id: string; status: string }>('/trips', {
        origin: { lat: originLat, lng: originLng, address: originAddress },
        destination: { lat: finalStop.lat, lng: finalStop.lng, address: finalStop.address },
        trip_type_id: selectedTypeId,
      });
      setActiveTrip({
        id: res.data.id,
        status: res.data.status,
        originLat,
        originLng,
        originAddress,
        stops,
        estimatedTotal: est.total,
      });
      navigation.navigate('ActiveTrip');
    } catch {
      Alert.alert('Error', 'No se pudo crear el viaje. Intenta de nuevo.');
    } finally {
      setCreating(false);
    }
  }

  if (loadingTypes) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary600} />
      </View>
    );
  }

  if (typesError) {
    return (
      <View style={styles.center}>
        <Text testID="estimate-types-error" style={styles.errorText}>
          No se pudieron cargar los servicios.
        </Text>
        <TouchableOpacity
          testID="estimate-types-retry-btn"
          style={styles.retryBtn}
          onPress={() => void loadTripTypes()}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectedEstState: EstimateState | null =
    selectedTypeId ? (estimates[selectedTypeId] ?? null) : null;
  const selectedEst =
    selectedEstState && selectedEstState !== 'loading' && selectedEstState !== 'error'
      ? selectedEstState
      : null;
  const selectedType = tripTypes.find((t) => t.id === selectedTypeId);
  const canConfirm = !!selectedTypeId && !!selectedEst;

  return (
    <View style={styles.container}>
      {/* Mapa con origen y destino */}
      <MapboxGL.MapView style={styles.map} scrollEnabled={false} zoomEnabled={false}>
        <MapboxGL.Camera
          bounds={mapBounds}
          padding={{ paddingTop: 32, paddingBottom: 32, paddingLeft: 32, paddingRight: 32 }}
          animationMode="none"
        />
        <MapboxGL.PointAnnotation id="est-origin" coordinate={[originLng, originLat]}>
          <View style={[styles.mapPin, { backgroundColor: colors.primary600 }]} />
        </MapboxGL.PointAnnotation>
        <MapboxGL.PointAnnotation id="est-dest" coordinate={[finalStop.lng, finalStop.lat]}>
          <View style={[styles.mapPin, styles.mapPinSquare, { backgroundColor: colors.primary900 }]} />
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      <ScrollView testID="estimate-screen" style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Resumen de ruta */}
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeConnector}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary600 }]} />
              <View style={styles.routeLine} />
              <View style={[styles.routeDot, styles.routeDotSquare, { backgroundColor: colors.primary900 }]} />
            </View>
            <View style={styles.routeAddresses}>
              <Text style={styles.routeLabel}>Origen</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>{originAddress}</Text>
              <View style={styles.routeSpacer} />
              <Text style={styles.routeLabel}>Destino</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>{finalStop.address}</Text>
            </View>
          </View>
        </View>

        {/* Selección de servicio con precio inline */}
        <Text style={styles.sectionTitle}>Elige tu servicio</Text>
        {tripTypes.map((type, idx) => {
          const est = estimates[type.id];
          const isSelected = selectedTypeId === type.id;

          return (
            <TouchableOpacity
              key={type.id}
              testID={`estimate-card-${idx}`}
              style={[styles.typeCard, isSelected && styles.typeCardSelected]}
              onPress={() => setSelectedTypeId(type.id)}
              accessibilityRole="button"
              accessibilityLabel={type.name}
            >
              <View style={styles.typeCardHeader}>
                <View style={styles.typeCardLeft}>
                  <Text style={styles.typeName}>{type.name}</Text>
                  {type.description ? (
                    <Text style={styles.typeDesc}>{type.description}</Text>
                  ) : null}
                </View>
                <View style={styles.typeCardRight}>
                  {!est || est === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.primary600} />
                  ) : est === 'error' ? (
                    <Text style={styles.priceError}>—</Text>
                  ) : (
                    <Text style={[styles.priceTotal, isSelected && styles.priceTotalSelected]}>
                      ${est.total.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Desglose expandido al seleccionar */}
              {isSelected && est && est !== 'loading' && est !== 'error' && (
                <View style={styles.breakdown}>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Distancia estimada</Text>
                    <Text style={styles.breakdownValue}>{est.estimatedDistanceKm.toFixed(1)} km</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Subtotal</Text>
                    <Text style={styles.breakdownValue}>${est.subtotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>IVA (16%)</Text>
                    <Text style={styles.breakdownValue}>${est.tax.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer fijo */}
      <View style={styles.footer}>
        <TouchableOpacity
          testID="estimate-confirm-btn"
          style={[styles.button, !canConfirm && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm || creating}
          accessibilityRole="button"
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {canConfirm && selectedEst
                ? `Confirmar — $${selectedEst.total.toFixed(2)}`
                : selectedTypeId && selectedEstState === 'loading'
                  ? 'Calculando...'
                  : 'Selecciona un servicio'}
            </Text>
          )}
        </TouchableOpacity>

        {selectedType && features.scheduling && (
          <TouchableOpacity
            testID="estimate-schedule-btn"
            style={styles.scheduleButton}
            onPress={() =>
              navigation.navigate('ScheduleConfirm', {
                originLat,
                originLng,
                originAddress,
                stops,
                tripTypeId: selectedType.id,
                tripTypeName: selectedType.name,
                estimatedFare:
                  selectedEst && typeof selectedEst === 'object' ? selectedEst.total : 0,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Programar para después"
          >
            <Text style={styles.scheduleButtonText}>Programar para después</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>Cambiar ruta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  map: { height: 220 },

  mapPin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 3,
  },
  mapPinSquare: { borderRadius: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  routeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
  },
  routeRow: { flexDirection: 'row' },
  routeConnector: {
    width: 20,
    alignItems: 'center',
    paddingTop: 18,
    marginRight: 12,
  },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeDotSquare: { borderRadius: 2 },
  routeLine: { flex: 1, width: 2, backgroundColor: '#D1D5DB', marginVertical: 4 },
  routeAddresses: { flex: 1 },
  routeLabel: { fontSize: 11, color: colors.neutral, textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddress: { fontSize: 14, color: colors.primary900, fontWeight: '500', marginTop: 2 },
  routeSpacer: { height: 16 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary900,
    marginBottom: 10,
  },

  typeCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 1,
  },
  typeCardSelected: { borderColor: colors.primary600, backgroundColor: colors.primary100 },

  typeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeCardLeft: { flex: 1, marginRight: 12 },
  typeCardRight: { alignItems: 'flex-end', minWidth: 70 },

  typeName: { fontSize: 15, fontWeight: '600', color: colors.primary900 },
  typeDesc: { fontSize: 13, color: colors.neutral, marginTop: 2 },

  priceTotal: { fontSize: 16, fontWeight: '700', color: colors.primary900 },
  priceTotalSelected: { color: colors.primary600 },
  priceError: { fontSize: 16, color: colors.neutral },

  breakdown: { marginTop: 10 },
  breakdownDivider: { height: 1, backgroundColor: '#D1E8F8', marginBottom: 10 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  breakdownLabel: { fontSize: 13, color: colors.neutral },
  breakdownValue: { fontSize: 13, color: colors.primary900 },

  errorText: { color: colors.error, textAlign: 'center', marginVertical: 8 },

  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    elevation: 8,
  },
  button: {
    backgroundColor: colors.primary600,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scheduleButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.primary600,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  scheduleButtonText: {
    color: colors.primary600,
    fontSize: 15,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: { color: colors.neutral, fontSize: 14 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary600,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
