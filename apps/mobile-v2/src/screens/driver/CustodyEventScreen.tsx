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
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../services/api.client';
import { DriverStackParamList } from '../../navigation/types';
import { tlog, tlogError } from '../../config/reactotron';
import { useVerticalStore, CustodyEventTypeConfig } from '../../stores/vertical.store';
import { SignaturePad } from '../../components/SignaturePad';

type CustodyEventRouteProp = RouteProp<DriverStackParamList, 'CustodyEvent'>;
type CustodyEventNavProp = StackNavigationProp<DriverStackParamList, 'CustodyEvent'>;

const DEFAULT_EVENT_TYPES: CustodyEventTypeConfig[] = [
  { code: 'pick_up', label: 'Recogida', requiresPhoto: false, requiresSignature: false },
  { code: 'handoff', label: 'Traspaso', requiresPhoto: false, requiresSignature: false },
  { code: 'delivery', label: 'Entrega', requiresPhoto: false, requiresSignature: false },
];

interface CustodyEvent {
  id: string;
  event_type: string;
  notes: string | null;
  photo_url: string | null;
  occurred_at: string;
  sequence: number;
  actor_name: string | null;
}

interface GetCustodyResponse {
  success: boolean;
  data: CustodyEvent[];
}

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary100: '#EBF3FB',
  primary50: '#F4F9FD',
  success: '#28A745',
  neutral: '#6C757D',
  error: '#DC3545',
};

export default function CustodyEventScreen(): React.JSX.Element {
  const route = useRoute<CustodyEventRouteProp>();
  const navigation = useNavigation<CustodyEventNavProp>();
  const { tripId } = route.params;
  const { features } = useVerticalStore();
  const eventTypes = features.custodyEventTypes ?? DEFAULT_EVENT_TYPES;

  const [events, setEvents] = useState<CustodyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  const selectedEventType = eventTypes.find((t) => t.code === selectedType);
  const requiresSignature = selectedEventType?.requiresSignature === true;
  const canSubmit = selectedType !== null && (!requiresSignature || signed);

  const fetchEvents = useCallback(async (): Promise<void> => {
    tlog('CustodyEvent:fetch', { tripId });
    try {
      const res = await apiClient.get<GetCustodyResponse>(`/trips/${tripId}/custody`);
      const list = res.data.data ?? [];
      setEvents(list);
      tlog('CustodyEvent:fetched', { tripId, count: list.length, events: list.map((e) => e.event_type) });
    } catch (err) {
      tlogError('CustodyEvent:fetch', err);
      // silent — list stays stale
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  async function handlePickPhoto(): Promise<void> {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    const payload = { event_type: selectedType, notes: notes.trim() || undefined, hasPhoto: !!photoUri };
    tlog('CustodyEvent:submit', { tripId, ...payload });
    try {
      await apiClient.post(`/trips/${tripId}/custody/events`, {
        event_type: selectedType,
        photo_url: photoUri ?? undefined,
        notes: notes.trim() || undefined,
      });
      tlog('CustodyEvent:submitted', { tripId, event_type: selectedType });
      setSelectedType(null);
      setPhotoUri(null);
      setNotes('');
      setSigned(false);
      await fetchEvents();
    } catch (err: unknown) {
      tlogError('CustodyEvent:submit', err);
      const axiosErr = err as { response?: { data?: { code?: string } } };
      if (axiosErr?.response?.data?.code === 'TRIP_NOT_ACTIVE') {
        setErrorMsg('El viaje ya no está activo. No se pueden agregar eventos.');
      } else {
        setErrorMsg('No se pudo registrar el evento. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

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
        <Text style={styles.headerTitle}>Cadena de custodia</Text>
      </View>

      {/* Historial de eventos */}
      {loading ? (
        <ActivityIndicator color={colors.primary600} style={styles.loadingIndicator} />
      ) : (
        <FlatList
          testID="custody-events-list"
          data={[...events].sort((a, b) => a.sequence - b.sequence)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.eventList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Sin eventos registrados.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.eventRow}>
              <View style={styles.eventBadge}>
                <Text style={styles.eventSeq}>{item.sequence}</Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventType}>
                  {eventTypes.find(t => t.code === item.event_type)?.label ?? item.event_type}
                </Text>
                <Text style={styles.eventTime}>
                  {new Date(item.occurred_at).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {item.notes ? (
                  <Text style={styles.eventNotes} numberOfLines={2}>{item.notes}</Text>
                ) : null}
              </View>
              {item.photo_url ? (
                <Text style={styles.photoIcon}>📷</Text>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>+ Agregar evento</Text>

              {/* Selector de tipo */}
              <View style={styles.typeRow}>
                {eventTypes.map((type) => (
                  <TouchableOpacity
                    key={type.code}
                    testID={`event-type-${type.code}`}
                    style={[
                      styles.typeBtn,
                      selectedType === type.code && styles.typeBtnSelected,
                    ]}
                    onPress={() => { setSelectedType(type.code); setSigned(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedType === type.code }}
                  >
                    <Text
                      style={[
                        styles.typeBtnText,
                        selectedType === type.code && styles.typeBtnTextSelected,
                      ]}
                    >
                      {type.label}
                    </Text>
                    {type.requiresSignature ? (
                      <Text style={styles.sigBadge}>✍️</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Firma digital — solo cuando el tipo seleccionado la requiere */}
              {requiresSignature && (
                <SignaturePad
                  onSign={(isSigned) => {
                    setSigned(isSigned);
                  }}
                />
              )}

              {/* Foto */}
              <TouchableOpacity
                testID="take-photo-btn"
                style={styles.photoBtn}
                onPress={() => void handlePickPhoto()}
                accessibilityRole="button"
              >
                <Text style={styles.photoBtnText}>
                  {photoUri ? '📷 Foto adjunta ✓' : '📷 Tomar foto'}
                </Text>
              </TouchableOpacity>

              {/* Notas */}
              <TextInput
                testID="custody-notes-input"
                style={styles.notesInput}
                placeholder="Notas (opcional)"
                placeholderTextColor={colors.neutral}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                accessibilityLabel="Notas del evento"
              />

              {errorMsg ? (
                <Text testID="custody-error-msg" style={styles.errorText}>{errorMsg}</Text>
              ) : null}

              <TouchableOpacity
                testID="custody-submit-btn"
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={() => void handleSubmit()}
                disabled={!canSubmit || submitting}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Registrar</Text>
                )}
              </TouchableOpacity>
            </View>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary900 },
  loadingIndicator: { marginTop: 40 },
  eventList: { padding: 16, paddingBottom: 4 },
  emptyText: { textAlign: 'center', color: colors.neutral, marginBottom: 16 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
  },
  eventBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  eventSeq: { color: '#fff', fontSize: 13, fontWeight: '700' },
  eventInfo: { flex: 1 },
  eventType: { fontSize: 14, fontWeight: '600', color: colors.primary900 },
  eventTime: { fontSize: 12, color: colors.neutral, marginTop: 2 },
  eventNotes: { fontSize: 12, color: colors.neutral, marginTop: 4 },
  photoIcon: { fontSize: 18, alignSelf: 'center' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    elevation: 2,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary900,
    marginBottom: 14,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  typeBtnSelected: {
    borderColor: colors.primary600,
    backgroundColor: colors.primary100,
  },
  typeBtnText: { fontSize: 13, color: colors.neutral, fontWeight: '500' },
  typeBtnTextSelected: { color: colors.primary600 },
  sigBadge: { fontSize: 10, marginTop: 2 },
  photoBtn: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  photoBtnText: { fontSize: 14, color: colors.primary600, fontWeight: '600' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.primary900,
    marginBottom: 12,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  errorText: { color: colors.error, fontSize: 13, marginBottom: 10 },
  submitBtn: {
    backgroundColor: colors.primary600,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
