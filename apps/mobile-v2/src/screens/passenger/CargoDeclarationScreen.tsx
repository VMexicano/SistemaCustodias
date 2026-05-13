import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { useTripStore } from '../../stores/trip.store';
import { PassengerStackParamList } from '../../navigation/types';
import { useVerticalStore, CargoFieldConfig } from '../../stores/vertical.store';

type CargoDeclarationRouteProp = RouteProp<PassengerStackParamList, 'CargoDeclaration'>;
type CargoDeclarationNavProp = StackNavigationProp<PassengerStackParamList, 'CargoDeclaration'>;

const DEFAULT_CARGO_FIELDS: CargoFieldConfig[] = [
  { key: 'cargo_description', label: 'Descripción de la carga', type: 'text', required: true, placeholder: 'Ej. Documentos legales, paquete frágil...', multiline: true },
  { key: 'declared_value', label: 'Valor declarado (MXN)', type: 'number', required: false, placeholder: '0.00' },
  { key: 'recipient_name', label: 'Nombre del destinatario', type: 'text', required: false, placeholder: 'Nombre completo' },
  { key: 'recipient_phone', label: 'Teléfono del destinatario', type: 'phone', required: false, placeholder: '+52 55 0000 0000' },
];

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
  error: '#DC3545',
};

export default function CargoDeclarationScreen(): React.JSX.Element {
  const route = useRoute<CargoDeclarationRouteProp>();
  const navigation = useNavigation<CargoDeclarationNavProp>();
  const { tripTypeId, originLat, originLng, originAddress, stops, estimatedFare } = route.params;
  const { setActiveTrip } = useTripStore();
  const { features } = useVerticalStore();
  const cargoFields = features.cargoFields ?? DEFAULT_CARGO_FIELDS;

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const canConfirm = cargoFields
    .filter(f => f.required)
    .every(f => (formValues[f.key] ?? '').trim().length > 0);

  const finalStop = stops[stops.length - 1];

  function setField(key: string, value: string): void {
    setFormValues(prev => ({ ...prev, [key]: value }));
  }

  async function handleConfirm(): Promise<void> {
    if (!canConfirm) return;
    setCreating(true);
    try {
      const cargo: Record<string, unknown> = {};
      cargoFields.forEach(field => {
        const val = (formValues[field.key] ?? '').trim();
        if (val) {
          cargo[field.key] = field.type === 'number' ? parseFloat(val) : val;
        }
      });

      const res = await apiClient.post<{ id: string; status: string }>('/trips', {
        origin: { lat: originLat, lng: originLng, address: originAddress },
        destination: { lat: finalStop.lat, lng: finalStop.lng, address: finalStop.address },
        trip_type_id: tripTypeId,
        metadata: { cargo },
      });
      setActiveTrip({
        id: res.data.id,
        status: res.data.status,
        originLat,
        originLng,
        originAddress,
        stops,
        estimatedTotal: estimatedFare,
      });
      navigation.navigate('ActiveTrip');
    } catch {
      Alert.alert('Error', 'No se pudo crear el viaje. Intenta de nuevo.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Declaración de carga</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {cargoFields.map(field => (
          <View key={field.key} style={styles.fieldBlock}>
            <Text style={styles.label}>
              {field.label}
              {field.required ? <Text style={styles.required}> *</Text> : null}
            </Text>
            <TextInput
              testID={`${field.key.replace(/_/g, '-')}-input`}
              style={[styles.input, field.multiline && styles.inputMultiline]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.neutral}
              value={formValues[field.key] ?? ''}
              onChangeText={val => setField(field.key, val)}
              keyboardType={
                field.type === 'number' ? 'decimal-pad' :
                field.type === 'phone' ? 'phone-pad' : 'default'
              }
              multiline={field.multiline}
              numberOfLines={field.multiline ? 3 : 1}
              accessibilityLabel={field.label}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          testID="cargo-confirm-btn"
          style={[styles.button, !canConfirm && styles.buttonDisabled]}
          onPress={() => void handleConfirm()}
          disabled={!canConfirm || creating}
          accessibilityRole="button"
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {canConfirm
                ? `Confirmar y solicitar — $${(estimatedFare ?? 0).toFixed(2)}`
                : 'Completa los campos requeridos'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  fieldBlock: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.primary900, marginBottom: 6 },
  required: { color: colors.error },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.primary900,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
