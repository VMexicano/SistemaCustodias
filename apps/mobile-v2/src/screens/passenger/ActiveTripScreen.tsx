import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { getSocket, disconnectSocket } from '../../services/socket.client';
import { useTripStore } from '../../stores/trip.store';
import { PassengerStackParamList } from '../../navigation/types';
import SessionMenuButton from '../../components/SessionMenuButton';

type ActiveTripNavProp = StackNavigationProp<PassengerStackParamList, 'ActiveTrip'>;

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary100: '#EBF3FB',
  primary50: '#F4F9FD',
  success: '#28A745',
  warning: '#FFC107',
  warningLight: '#FFF8E1',
  warningDark: '#F57C00',
  error: '#DC3545',
  neutral: '#6C757D',
};

const CANCELLABLE_STATUSES = new Set(['SEARCHING', 'ACCEPTED']);

export default function ActiveTripScreen(): React.JSX.Element {
  const navigation = useNavigation<ActiveTripNavProp>();
  const { activeTrip, driverLat, driverLng, tripStatus, updateDriverLocation, updateStatus, clearTrip } =
    useTripStore();

  useEffect(() => {
    const socket = getSocket('passenger');

    const endTripAndGoHome = (): void => {
      clearTrip();
      disconnectSocket('passenger');
      navigation.navigate('Home');
    };

    const handleCancelledTrip = (reason?: string): void => {
      const message = reason ?? 'No se encontro conductor a tiempo. Intenta solicitar de nuevo.';
      endTripAndGoHome();
      Alert.alert('Viaje cancelado', message);
    };

    socket.on('trip:driver_location', (data: { lat: number; lng: number }) => {
      updateDriverLocation(data.lat, data.lng);
    });

    socket.on('trip:status_changed', (data: { status?: string }) => {
      if (!data?.status) return;
      updateStatus(data.status);

      if (data.status === 'COMPLETED') {
        endTripAndGoHome();
      }

      if (data.status === 'CANCELLED') {
        handleCancelledTrip();
      }
    });

    socket.on('trip:accepted', (data: { status: string }) => {
      updateStatus(data.status);
    });

    socket.on('trip:completed', () => {
      endTripAndGoHome();
    });

    socket.on('trip:cancelled', (data?: { reason?: string }) => {
      handleCancelledTrip(data?.reason);
    });

    return () => {
      socket.off('trip:driver_location');
      socket.off('trip:status_changed');
      socket.off('trip:accepted');
      socket.off('trip:completed');
      socket.off('trip:cancelled');
    };
  }, [updateDriverLocation, updateStatus, clearTrip, navigation]);

  async function handleCancel(): Promise<void> {
    if (!activeTrip) return;
    try {
      await apiClient.patch(`/trips/${activeTrip.id}/cancel`, {
        reason: 'Cancelado por el pasajero',
      });
      clearTrip();
      disconnectSocket('passenger');
      navigation.navigate('Home');
    } catch {
      Alert.alert('Error', 'No se pudo cancelar el viaje.');
    }
  }

  const finalStop = activeTrip?.stops[activeTrip.stops.length - 1];

  if (!activeTrip || !finalStop) {
    return (
      <View style={styles.center}>
        <Text style={styles.noTrip}>No hay viaje activo</Text>
      </View>
    );
  }

  const canCancel = CANCELLABLE_STATUSES.has(tripStatus ?? '');

  function renderStatusBanner(): React.JSX.Element | null {
    switch (tripStatus) {
      case 'PENDING_APPROVAL':
        return (
          <View testID="status-banner-pending-approval" style={styles.pendingContainer}>
            <Text style={styles.pendingTitle}>Tu solicitud está en revisión</Text>
            <Text style={styles.pendingSubtitle}>
              Un despachador revisará tu solicitud en breve
            </Text>
            <ActivityIndicator
              testID="pending-activity-indicator"
              color={colors.warningDark}
              style={styles.activityIndicator}
            />
          </View>
        );

      case 'APPROVED':
        return (
          <View testID="status-banner-approved" style={styles.approvedContainer}>
            <Text style={styles.approvedTitle}>Solicitud aprobada</Text>
            <Text style={styles.approvedSubtitle}>
              Buscando conductor disponible...
            </Text>
            <ActivityIndicator
              testID="approved-activity-indicator"
              color={colors.primary600}
              style={styles.activityIndicator}
            />
          </View>
        );

      default:
        return null;
    }
  }

  return (
    <View testID="active-trip-screen" style={styles.container}>
      <SessionMenuButton
        testID="session-menu-btn-passenger-trip"
        onPress={() => navigation.navigate('SessionMenu')}
      />

      <MapboxGL.MapView style={styles.map}>
        <MapboxGL.Camera
          zoomLevel={14}
          centerCoordinate={[activeTrip.originLng, activeTrip.originLat]}
          animationMode="none"
        />
        <MapboxGL.PointAnnotation id="origin" coordinate={[activeTrip.originLng, activeTrip.originLat]}>
          <View style={[styles.marker, { backgroundColor: colors.primary600 }]} />
        </MapboxGL.PointAnnotation>
        <MapboxGL.PointAnnotation
          id="destination"
          coordinate={[finalStop.lng, finalStop.lat]}
        >
          <View style={[styles.marker, { backgroundColor: colors.success }]} />
        </MapboxGL.PointAnnotation>
        {driverLat !== null && driverLng !== null && (
          <MapboxGL.PointAnnotation id="driver" coordinate={[driverLng, driverLat]}>
            <View style={[styles.marker, { backgroundColor: colors.warning }]} />
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      <View style={styles.infoPanel}>
        {renderStatusBanner()}
        {tripStatus !== 'PENDING_APPROVAL' && tripStatus !== 'APPROVED' && (
          <View style={styles.statusChip}>
            <Text style={styles.statusText}>{tripStatus ?? 'BUSCANDO...'}</Text>
          </View>
        )}
        {activeTrip.estimatedTotal && (
          <Text style={styles.totalText}>Total estimado: ${activeTrip.estimatedTotal.toFixed(2)}</Text>
        )}
        {canCancel && (
          <TouchableOpacity
            testID="active-trip-cancel-btn"
            style={styles.cancelBtn}
            onPress={handleCancel}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancelar viaje</Text>
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
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  infoPanel: {
    backgroundColor: colors.primary50,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 5,
  },
  statusChip: {
    backgroundColor: colors.primary600,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  totalText: { fontSize: 16, color: colors.primary900, marginBottom: 12 },
  cancelBtn: {
    backgroundColor: colors.error,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pendingContainer: {
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.warningDark,
    marginBottom: 4,
  },
  pendingSubtitle: {
    fontSize: 14,
    color: colors.warningDark,
    marginBottom: 8,
  },
  approvedContainer: {
    backgroundColor: colors.primary100,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  approvedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary600,
    marginBottom: 4,
  },
  approvedSubtitle: {
    fontSize: 14,
    color: colors.primary600,
    marginBottom: 8,
  },
  activityIndicator: {
    alignSelf: 'flex-start',
  },
});
