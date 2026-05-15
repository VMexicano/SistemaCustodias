import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { apiClient } from '../../services/api.client';
import { useAuthStore } from '../../stores/auth.store';
import type { CustodyOperatorStackParamList } from '../../navigation/types';

type NavProp = StackNavigationProp<CustodyOperatorStackParamList, 'CustodyActiveOrder'>;
type RouteType = RouteProp<CustodyOperatorStackParamList, 'CustodyActiveOrder'>;

interface Address {
  street: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
}

interface OrderDTO {
  id: string;
  orderNumber: string;
  status: string;
  pickupAddress: Address;
  deliveryAddress: Address;
  custodioId: string | null;
  copilotoId: string | null;
}

interface Waypoint {
  lat: number;
  lng: number;
  label?: string;
}

interface RouteDTO {
  id: string;
  orderId: string;
  status: string;
  totalDistanceKm: number | null;
  estimatedDurationMin: number | null;
  waypoints: Waypoint[];
}

interface StatusAction {
  label: string;
  endpoint: string;
  needsSignature: boolean;
  custodioOnly?: boolean;
}

const STATUS_ACTIONS: Partial<Record<string, StatusAction>> = {
  ASSIGNED:           { label: 'Confirmar asignación', endpoint: 'confirm-crew',    needsSignature: false },
  REASSIGNED:         { label: 'Confirmar asignación', endpoint: 'confirm-crew',    needsSignature: false },
  CREW_CONFIRMED:     { label: 'Partir',               endpoint: 'depart',          needsSignature: false, custodioOnly: true },
  EN_ROUTE_TO_PICKUP: { label: 'Llegué al pickup',     endpoint: 'arrive-pickup',   needsSignature: false },
  AT_PICKUP:          { label: 'Confirmar pickup',     endpoint: 'pickup',          needsSignature: true },
  IN_TRANSIT:         { label: 'Llegué a entrega',     endpoint: 'arrive-delivery', needsSignature: false },
  AT_DELIVERY:        { label: 'Confirmar entrega',    endpoint: 'deliver',         needsSignature: true },
};

const PANIC_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_DELIVERY',
]);

const CDMX = { lat: 19.4326, lng: -99.1332 };

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50:  '#F4F9FD',
  success:    '#28A745',
  danger:     '#DC3545',
  neutral:    '#6C757D',
};

export default function CustodyActiveOrderScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { orderId } = route.params;
  const { role } = useAuthStore();

  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [custodyRoute, setCustodyRoute] = useState<RouteDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [signatureModal, setSignatureModal] = useState(false);
  const [signature, setSignature] = useState('');
  const [pendingEndpoint, setPendingEndpoint] = useState<string | null>(null);

  const [operatorLat, setOperatorLat] = useState(CDMX.lat);
  const [operatorLng, setOperatorLng] = useState(CDMX.lng);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [orderRes, routeRes] = await Promise.allSettled([
          apiClient.get<OrderDTO>(`/orders/${orderId}`),
          apiClient.get<RouteDTO>(`/orders/${orderId}/route`),
        ]);

        if (orderRes.status === 'fulfilled') {
          setOrder(orderRes.value.data);
        }
        if (routeRes.status === 'fulfilled') {
          setCustodyRoute(routeRes.value.data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  useEffect(() => {
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({});
      setOperatorLat(pos.coords.latitude);
      setOperatorLng(pos.coords.longitude);
      cameraRef.current?.setCamera({
        centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
        zoomLevel: 14,
        animationDuration: 500,
      });

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (update) => {
          setOperatorLat(update.coords.latitude);
          setOperatorLng(update.coords.longitude);
        },
      );
    })();

    return () => { locationSubRef.current?.remove(); };
  }, []);

  async function executeAction(endpoint: string, body?: Record<string, string>): Promise<void> {
    setActionLoading(true);
    try {
      const res = await apiClient.patch<OrderDTO>(`/orders/${orderId}/${endpoint}`, body);
      setOrder(res.data);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el estado de la orden.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleActionPress(action: StatusAction): void {
    if (action.needsSignature) {
      setPendingEndpoint(action.endpoint);
      setSignature('');
      setSignatureModal(true);
    } else {
      void executeAction(action.endpoint);
    }
  }

  async function handleSignatureSubmit(): Promise<void> {
    if (!pendingEndpoint || signature.trim().length === 0) {
      Alert.alert('Requerido', 'Ingresa la firma digital para continuar.');
      return;
    }
    setSignatureModal(false);
    await executeAction(pendingEndpoint, { digitalSignature: signature.trim() });
    setPendingEndpoint(null);
    setSignature('');
  }

  async function handlePanic(): Promise<void> {
    Alert.alert(
      'Reportar incidente',
      '¿Confirmas que hay un incidente en curso?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reportar',
          style: 'destructive',
          onPress: () => {
            void executeAction('report-incident', { description: 'Incidente reportado desde la app móvil.' });
          },
        },
      ],
    );
  }

  function buildRouteCoords(): [number, number][] {
    if (custodyRoute && custodyRoute.waypoints.length >= 2) {
      return custodyRoute.waypoints.map((w) => [w.lng, w.lat] as [number, number]);
    }
    if (order) {
      const { pickupAddress, deliveryAddress } = order;
      if (pickupAddress.lat && pickupAddress.lng && deliveryAddress.lat && deliveryAddress.lng) {
        return [
          [pickupAddress.lng, pickupAddress.lat],
          [deliveryAddress.lng, deliveryAddress.lat],
        ];
      }
    }
    return [];
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary600} testID="loading-indicator" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="error-text">Orden no encontrada</Text>
      </View>
    );
  }

  const action = STATUS_ACTIONS[order.status];
  const showAction = action && !(action.custodioOnly && role !== 'custodio');
  const routeCoords = buildRouteCoords();
  const pickupCoord: [number, number] | null =
    order.pickupAddress.lat && order.pickupAddress.lng
      ? [order.pickupAddress.lng, order.pickupAddress.lat]
      : null;
  const deliveryCoord: [number, number] | null =
    order.deliveryAddress.lat && order.deliveryAddress.lng
      ? [order.deliveryAddress.lng, order.deliveryAddress.lat]
      : null;

  return (
    <View style={styles.container}>
      <MapboxGL.MapView style={styles.map} testID="mapbox-map-view">
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={[operatorLng, operatorLat]}
          animationMode="none"
        />

        {routeCoords.length >= 2 && (
          <MapboxGL.ShapeSource
            id="custodyRoute"
            shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords }, properties: {} }}
          >
            <MapboxGL.LineLayer
              id="custodyRouteLine"
              style={{ lineColor: colors.primary600, lineWidth: 4 }}
            />
          </MapboxGL.ShapeSource>
        )}

        {pickupCoord && (
          <MapboxGL.PointAnnotation id="pickupPin" coordinate={pickupCoord}>
            <View style={[styles.markerDot, { backgroundColor: colors.success }]} />
          </MapboxGL.PointAnnotation>
        )}

        {deliveryCoord && (
          <MapboxGL.PointAnnotation id="deliveryPin" coordinate={deliveryCoord}>
            <View style={[styles.markerDot, { backgroundColor: colors.danger }]} />
          </MapboxGL.PointAnnotation>
        )}

        <MapboxGL.PointAnnotation id="operatorPos" coordinate={[operatorLng, operatorLat]}>
          <View style={styles.operatorDot} />
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <TouchableOpacity
          testID="back-btn"
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.backBtnText}>← Mis órdenes</Text>
        </TouchableOpacity>

        <Text style={styles.orderNumber} testID="order-number">{order.orderNumber}</Text>

        <View style={styles.statusChip}>
          <Text style={styles.statusText} testID="order-status">{order.status}</Text>
        </View>

        {custodyRoute && custodyRoute.totalDistanceKm !== null && (
          <View style={styles.routeInfo}>
            <Text style={styles.routeInfoText}>
              {custodyRoute.totalDistanceKm.toFixed(1)} km · {custodyRoute.estimatedDurationMin ?? '--'} min
            </Text>
          </View>
        )}

        <View style={styles.addressSection}>
          <Text style={styles.addressLabel}>Pickup</Text>
          <Text style={styles.addressValue}>
            {order.pickupAddress.street}, {order.pickupAddress.city}
          </Text>
          <Text style={styles.addressLabel}>Entrega</Text>
          <Text style={styles.addressValue}>
            {order.deliveryAddress.street}, {order.deliveryAddress.city}
          </Text>
        </View>

        {showAction && (
          <TouchableOpacity
            testID="action-btn"
            style={styles.actionBtn}
            onPress={() => handleActionPress(action)}
            disabled={actionLoading}
            accessibilityRole="button"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>{action.label}</Text>
            )}
          </TouchableOpacity>
        )}

        {PANIC_STATUSES.has(order.status) && (
          <TouchableOpacity
            testID="panic-btn"
            style={styles.panicBtn}
            onPress={() => void handlePanic()}
            accessibilityRole="button"
          >
            <Text style={styles.panicBtnText}>🚨 Reportar incidente</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        visible={signatureModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSignatureModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Firma digital</Text>
            <Text style={styles.modalSubtitle}>
              Ingresa tu firma para confirmar esta acción
            </Text>
            <TextInput
              testID="signature-input"
              style={styles.signatureInput}
              value={signature}
              onChangeText={setSignature}
              placeholder="Firma digital..."
              multiline
              maxLength={512}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                testID="signature-cancel"
                style={styles.modalCancelBtn}
                onPress={() => { setSignatureModal(false); setPendingEndpoint(null); }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="signature-confirm"
                style={styles.modalConfirmBtn}
                onPress={() => void handleSignatureSubmit()}
              >
                <Text style={styles.modalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  map: { flex: 1 },
  panel: {
    maxHeight: 340,
    backgroundColor: colors.primary50,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  panelContent: { padding: 16 },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.primary600, fontSize: 14 },
  orderNumber: { fontSize: 18, fontWeight: '700', color: colors.primary900, marginBottom: 6 },
  statusChip: {
    backgroundColor: colors.primary600,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  routeInfo: { backgroundColor: '#E8F0FB', borderRadius: 8, padding: 8, marginBottom: 10 },
  routeInfoText: { fontSize: 13, color: colors.primary600, fontWeight: '600' },
  addressSection: { marginBottom: 12 },
  addressLabel: { fontSize: 12, fontWeight: '700', color: colors.neutral, marginTop: 4 },
  addressValue: { fontSize: 14, color: colors.primary900 },
  actionBtn: {
    backgroundColor: colors.success,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    minHeight: 44,
  },
  actionBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  panicBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  panicBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  operatorDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary600, borderWidth: 2, borderColor: '#fff' },
  markerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  errorText: { fontSize: 16, color: colors.danger, textAlign: 'center', paddingHorizontal: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.primary900, marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: colors.neutral, marginBottom: 14 },
  signatureInput: {
    borderWidth: 1,
    borderColor: '#CDD5E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.neutral, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: colors.neutral, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, backgroundColor: colors.primary600, borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
