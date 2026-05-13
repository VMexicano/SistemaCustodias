import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { apiClient } from '../../services/api.client';
import { useDriverStore } from '../../stores/driver.store';
import LocationService from '../../services/location.service';

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  success: '#28A745',
  error: '#DC3545',
  neutral: '#6C757D',
};

const COUNTDOWN_SECONDS = 30;

export default function TripRequestModal(): React.JSX.Element {
  const { pendingRequest, setPendingRequest, activeTrip, setActiveTrip, setQueuedTrip } = useDriverStore();
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!pendingRequest) {
      setCountdown(COUNTDOWN_SECONDS);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingRequest]);

  useEffect(() => {
    if (countdown === 0 && pendingRequest) {
      setPendingRequest(null);
    }
  }, [countdown, pendingRequest, setPendingRequest]);

  async function handleAccept(): Promise<void> {
    if (!pendingRequest) return;
    setAccepting(true);
    try {
      await apiClient.patch(`/trips/${pendingRequest.id}/accept`);
      const newTrip = {
        id: pendingRequest.id,
        status: 'ACCEPTED',
        originLat: pendingRequest.originLat,
        originLng: pendingRequest.originLng,
        destinationLat: pendingRequest.destinationLat,
        destinationLng: pendingRequest.destinationLng,
      };
      if (activeTrip) {
        // Stacking: mantiene el viaje activo actual, encola el nuevo
        setQueuedTrip(newTrip);
      } else {
        setActiveTrip(newTrip);
        await LocationService.startTracking(pendingRequest.id);
      }
      setPendingRequest(null);
    } catch {
      Alert.alert('Error', 'No se pudo aceptar el viaje.');
      setPendingRequest(null);
    } finally {
      setAccepting(false);
    }
  }

  if (!pendingRequest) return <></>;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => setPendingRequest(null)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.countdownRow}>
            <Text style={styles.countdownLabel}>Tiempo restante</Text>
            <Text style={[styles.countdown, countdown <= 10 && styles.countdownUrgent]}>
              {countdown}s
            </Text>
          </View>

          <Text style={styles.cardTitle}>Nueva solicitud</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Origen:</Text>
            <Text style={styles.infoValue}>{pendingRequest.originAddress}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Destino:</Text>
            <Text style={styles.infoValue}>{pendingRequest.destinationAddress}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Distancia:</Text>
            <Text style={styles.infoValue}>{pendingRequest.estimatedDistanceKm.toFixed(1)} km</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tarifa:</Text>
            <Text style={styles.infoValue}>${pendingRequest.estimatedTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.infoRow, styles.etaRow]}>
            <Text style={styles.etaIcon}>🕐</Text>
            <Text style={styles.etaText}>~{pendingRequest.etaMinutes} min para llegar al origen</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={() => setPendingRequest(null)}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>Rechazar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={handleAccept}
              disabled={accepting}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  countdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  countdownLabel: { fontSize: 14, color: colors.neutral },
  countdown: { fontSize: 18, fontWeight: 'bold', color: colors.primary900 },
  countdownUrgent: { color: colors.error },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: colors.primary900, marginBottom: 16 },
  infoRow: { flexDirection: 'row', marginBottom: 8 },
  infoLabel: { width: 80, fontSize: 14, color: colors.neutral },
  infoValue: { flex: 1, fontSize: 14, color: colors.primary900, fontWeight: '500' },
  etaRow: { marginTop: 4, backgroundColor: '#EBF3FB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  etaIcon: { fontSize: 14, marginRight: 6 },
  etaText: { fontSize: 14, color: colors.primary600, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  acceptBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.error },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
