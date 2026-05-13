import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { DriverStackParamList } from '../../navigation/types';

type TemperatureLogRouteProp = RouteProp<DriverStackParamList, 'TemperatureLog'>;
type TemperatureLogNavProp = StackNavigationProp<DriverStackParamList, 'TemperatureLog'>;

interface TemperatureReading {
  celsius: number;
  recorded_at: string;
  sensor_id: string | null;
}

interface GetTemperatureResponse {
  readings: TemperatureReading[];
  summary: {
    min: number;
    max: number;
    avg: number;
    out_of_range_count: number;
  } | null;
}

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  success: '#28A745',
  error: '#DC3545',
  neutral: '#6C757D',
};

const AUTO_INTERVAL_MS = 5 * 60 * 1000;

export default function TemperatureLogScreen(): React.JSX.Element {
  const route = useRoute<TemperatureLogRouteProp>();
  const navigation = useNavigation<TemperatureLogNavProp>();
  const { tripId, setpoints } = route.params;

  const [readings, setReadings] = useState<TemperatureReading[]>([]);
  const [celsiusInput, setCelsiusInput] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [posting, setPosting] = useState(false);
  const [nextReadingSec, setNextReadingSec] = useState(AUTO_INTERVAL_MS / 1000);

  const fetchHistory = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient.get<GetTemperatureResponse>(
        `/trips/${tripId}/temperature?limit=20`,
      );
      setReadings(res.data.readings ?? []);
    } catch {
      // silent — list stays stale
    } finally {
      setLoadingHistory(false);
    }
  }, [tripId]);

  useEffect(() => {
    void fetchHistory();

    const autoInterval = setInterval(() => {
      const val = parseFloat(celsiusInput);
      if (!isNaN(val)) {
        apiClient.post(`/trips/${tripId}/temperature`, { celsius: val }).then(() => {
          void fetchHistory();
        }).catch(() => { /* silent */ });
      }
      setNextReadingSec(AUTO_INTERVAL_MS / 1000);
    }, AUTO_INTERVAL_MS);

    const countdownInterval = setInterval(() => {
      setNextReadingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearInterval(autoInterval);
      clearInterval(countdownInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function handleManualPost(): Promise<void> {
    const val = parseFloat(celsiusInput);
    if (isNaN(val)) {
      Alert.alert('Error', 'Ingresa una temperatura válida.');
      return;
    }
    setPosting(true);
    try {
      await apiClient.post(`/trips/${tripId}/temperature`, { celsius: val });
      await fetchHistory();
      setNextReadingSec(AUTO_INTERVAL_MS / 1000);
    } catch {
      Alert.alert('Error', 'No se pudo enviar la lectura.');
    } finally {
      setPosting(false);
    }
  }

  function getIndicator(): { color: string; label: string } {
    const val = parseFloat(celsiusInput);
    if (isNaN(val) || !setpoints) {
      return { color: colors.neutral, label: 'Sin rango configurado' };
    }
    if (val >= setpoints.min_celsius && val <= setpoints.max_celsius) {
      return {
        color: colors.success,
        label: `✅ Dentro del rango (${setpoints.min_celsius}–${setpoints.max_celsius}°C)`,
      };
    }
    return {
      color: colors.error,
      label: `⚠️ Fuera del rango (${setpoints.min_celsius}–${setpoints.max_celsius}°C)`,
    };
  }

  const indicator = getIndicator();
  const nextMin = Math.ceil(nextReadingSec / 60);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Monitoreo de temperatura</Text>
          <Text style={styles.headerSub}>
            ● EN VIVO · Próx. lectura: {nextMin}m
          </Text>
        </View>
      </View>

      <View style={styles.currentCard}>
        <Text style={styles.currentLabel}>Temperatura actual</Text>
        <View style={styles.inputRow}>
          <TextInput
            testID="celsius-input"
            style={styles.celsiusInput}
            value={celsiusInput}
            onChangeText={setCelsiusInput}
            placeholder="0.0"
            placeholderTextColor={colors.neutral}
            keyboardType="decimal-pad"
            accessibilityLabel="Temperatura en Celsius"
          />
          <Text style={styles.celsiusUnit}>°C</Text>
          <TouchableOpacity
            testID="send-temperature-btn"
            style={styles.sendBtn}
            onPress={() => void handleManualPost()}
            disabled={posting}
            accessibilityRole="button"
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Enviar</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text
          testID="temperature-indicator"
          style={[styles.indicator, { color: indicator.color }]}
        >
          {indicator.label}
        </Text>
      </View>

      <Text style={styles.historyTitle}>Historial</Text>
      {loadingHistory ? (
        <ActivityIndicator color={colors.primary600} style={styles.loadingHistory} />
      ) : (
        <FlatList
          testID="temperature-list"
          data={readings}
          keyExtractor={(_, idx) => String(idx)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.readingRow}>
              <Text style={styles.readingTime}>
                {new Date(item.recorded_at).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.readingValue}>{item.celsius.toFixed(1)}°C</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Sin lecturas registradas aún.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    elevation: 2,
  },
  backButton: { paddingRight: 12, minHeight: 44, justifyContent: 'center' },
  backButtonText: { fontSize: 22, color: colors.primary600 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.primary900 },
  headerSub: { fontSize: 12, color: colors.success, marginTop: 2 },
  currentCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
  },
  currentLabel: { fontSize: 14, color: colors.neutral, marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  celsiusInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary900,
    minHeight: 44,
  },
  celsiusUnit: { fontSize: 18, color: colors.neutral, marginHorizontal: 8 },
  sendBtn: {
    backgroundColor: colors.primary600,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600' },
  indicator: { fontSize: 13, fontWeight: '500' },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary900,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  loadingHistory: { marginTop: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  readingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  readingTime: { fontSize: 14, color: colors.neutral },
  readingValue: { fontSize: 14, fontWeight: '600', color: colors.primary900 },
  emptyText: { textAlign: 'center', color: colors.neutral, marginTop: 20 },
});
