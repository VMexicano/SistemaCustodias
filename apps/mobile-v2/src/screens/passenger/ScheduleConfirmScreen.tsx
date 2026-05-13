import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import type { PassengerStackParamList } from '../../navigation/types';

type ScheduleConfirmRouteProp = RouteProp<PassengerStackParamList, 'ScheduleConfirm'>;
type ScheduleConfirmNavProp = StackNavigationProp<PassengerStackParamList>;

interface ScheduleTripBody {
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  tripTypeId: string;
  scheduledFor: string;
}

interface ScheduleTripResponse {
  trip_id: string;
  scheduled_for: string;
  estimated_fare: number;
  currency: string;
}

interface ApiError {
  response?: {
    data?: {
      error?: {
        code?: string;
      };
    };
  };
}

type MutationState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'error'; error: unknown }
  | { status: 'success' };

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary100: '#EBF3FB',
  primary50: '#F4F9FD',
  success: '#28A745',
  warning: '#FFC107',
  error: '#DC3545',
  neutral: '#6C757D',
};

const MIN_ADVANCE_MS = 30 * 60 * 1000; // 30 minutes

function getErrorMessage(error: unknown): string {
  const apiError = error as ApiError;
  const code = apiError?.response?.data?.error?.code;
  if (code === 'SCHEDULED_TOO_SOON') {
    return 'El horario debe ser al menos 30 minutos en el futuro';
  }
  if (code === 'PASSENGER_HAS_ACTIVE_TRIP') {
    return 'Ya tienes un viaje activo o programado';
  }
  return 'No se pudo programar el viaje. Intenta de nuevo';
}

export default function ScheduleConfirmScreen(): React.JSX.Element {
  const route = useRoute<ScheduleConfirmRouteProp>();
  const navigation = useNavigation<ScheduleConfirmNavProp>();

  const {
    originLat,
    originLng,
    originAddress,
    stops,
    tripTypeId,
    tripTypeName,
    estimatedFare,
  } = route.params;

  const destination = stops[0];

  // Initial date: 31 minutes from now
  const [selectedDate, setSelectedDate] = useState<Date>(
    new Date(Date.now() + 31 * 60 * 1000)
  );

  // Android requires two separate pickers: date then time
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [showPicker, setShowPicker] = useState(false);

  const minDate = new Date(Date.now() + MIN_ADVANCE_MS);
  const isValid = selectedDate >= minDate;

  const [mutationState, setMutationState] = useState<MutationState>({ status: 'idle' });

  async function scheduleTrip(body: ScheduleTripBody): Promise<void> {
    setMutationState({ status: 'pending' });
    try {
      await apiClient.post<ScheduleTripResponse>('/trips/schedule', body);
      setMutationState({ status: 'success' });
      navigation.replace('ScheduledTrips');
    } catch (err: unknown) {
      setMutationState({ status: 'error', error: err });
    }
  }

  function handlePickerDismiss(): void {
    setShowPicker(false);
  }

  function handlePickerValueChange(_event: DateTimePickerChangeEvent, date: Date): void {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (pickerMode === 'date') {
        const merged = new Date(selectedDate);
        merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setSelectedDate(merged);
        setPickerMode('time');
        setShowPicker(true);
      } else {
        const merged = new Date(selectedDate);
        merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setSelectedDate(merged);
        setPickerMode('date');
      }
    } else {
      setSelectedDate(date);
    }
  }

  function openPicker(): void {
    setPickerMode('date');
    setShowPicker(true);
  }

  function handleConfirm(): void {
    if (!isValid || mutationState.status === 'pending') return;
    void scheduleTrip({
      origin: { lat: originLat, lng: originLng, address: originAddress },
      destination: { lat: destination.lat, lng: destination.lng, address: destination.address },
      tripTypeId,
      scheduledFor: selectedDate.toISOString(),
    });
  }

  const formattedDate = selectedDate.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = selectedDate.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.container}>
      <ScrollView
        testID="schedule-confirm-screen"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Trip summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Resumen del viaje</Text>

          <View style={styles.serviceRow}>
            <Text style={styles.serviceLabel}>Servicio</Text>
            <Text style={styles.serviceValue}>{tripTypeName}</Text>
          </View>

          <View style={styles.divider} />

          {/* Route: origin -> destination */}
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
              <Text style={styles.routeAddress} numberOfLines={2}>{destination.address}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Tarifa estimada</Text>
            <Text style={styles.fareValue} testID="schedule-fare">
              ${(estimatedFare ?? 0).toFixed(2)} MXN
            </Text>
          </View>
        </View>

        {/* Date & time picker section */}
        <Text style={styles.sectionTitle}>Fecha y hora de recogida</Text>

        <TouchableOpacity
          testID="schedule-datetime-btn"
          style={styles.dateTimeCard}
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Seleccionar fecha y hora"
        >
          <View style={styles.dateTimeContent}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateTimeLabel}>Fecha</Text>
              <Text style={styles.dateTimeValue} testID="schedule-date-display">
                {formattedDate}
              </Text>
            </View>
            <View style={styles.dateTimeSeparator} />
            <View style={styles.timeBlock}>
              <Text style={styles.dateTimeLabel}>Hora</Text>
              <Text style={styles.dateTimeValue} testID="schedule-time-display">
                {formattedTime}
              </Text>
            </View>
          </View>
          <Text style={styles.changeText}>Cambiar</Text>
        </TouchableOpacity>

        {/* Android: show picker only when triggered; iOS: can use inline */}
        {showPicker && (
          <DateTimePicker
            testID="schedule-datetime-picker"
            value={selectedDate}
            mode={pickerMode}
            display={Platform.OS === 'android' ? 'spinner' : 'default'}
            minimumDate={pickerMode === 'date' ? new Date() : undefined}
            onValueChange={handlePickerValueChange}
            onDismiss={handlePickerDismiss}
          />
        )}

        {/* Inline validation error */}
        {!isValid && (
          <Text testID="schedule-validation-error" style={styles.validationError}>
            Selecciona al menos 30 minutos en el futuro
          </Text>
        )}

        {/* API error */}
        {mutationState.status === 'error' && (
          <Text testID="schedule-api-error" style={styles.validationError}>
            {getErrorMessage(mutationState.error)}
          </Text>
        )}
      </ScrollView>

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          testID="schedule-confirm-btn"
          style={[
            styles.button,
            (!isValid || mutationState.status === 'pending') && styles.buttonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!isValid || mutationState.status === 'pending'}
          accessibilityRole="button"
          accessibilityLabel="Confirmar programación"
        >
          {mutationState.status === 'pending' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Confirmar programación</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary50 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary900,
    marginBottom: 12,
  },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  serviceLabel: { fontSize: 14, color: colors.neutral },
  serviceValue: { fontSize: 14, fontWeight: '600', color: colors.primary900 },

  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },

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
  routeLabel: {
    fontSize: 11,
    color: colors.neutral,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: 14,
    color: colors.primary900,
    fontWeight: '500',
    marginTop: 2,
  },
  routeSpacer: { height: 16 },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: { fontSize: 14, color: colors.neutral },
  fareValue: { fontSize: 18, fontWeight: '700', color: colors.primary600 },

  // Date/time picker card
  dateTimeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTimeContent: { flexDirection: 'row', flex: 1 },
  dateBlock: { flex: 1 },
  timeBlock: { flex: 1 },
  dateTimeSeparator: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
    alignSelf: 'stretch',
  },
  dateTimeLabel: {
    fontSize: 11,
    color: colors.neutral,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateTimeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary900,
  },
  changeText: {
    fontSize: 13,
    color: colors.primary600,
    fontWeight: '600',
    marginLeft: 12,
    minWidth: 44,
    textAlign: 'right',
  },

  validationError: {
    color: colors.error,
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },

  // Footer
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
  backBtn: {
    alignItems: 'center',
    marginTop: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: { color: colors.neutral, fontSize: 14 },
});
