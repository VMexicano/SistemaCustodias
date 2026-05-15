import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import { useCustodyStore } from '../../stores/custody.store';
import type { CustodyClientStackParamList } from '../../navigation/types';
import AddressPickerField, { type AddressValue } from '../../components/AddressPickerField';

type NavProp = StackNavigationProp<CustodyClientStackParamList, 'NewCustodyOrder'>;

interface OrderResponse {
  data: { id: string; status: string };
}

export default function NewCustodyOrderScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const { draft, setDraft, setActiveOrderId } = useCustodyStore();

  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState<AddressValue | null>(draft.pickupAddress ?? null);
  const [delivery, setDelivery] = useState<AddressValue | null>(draft.deliveryAddress ?? null);

  async function handleNext(): Promise<void> {
    if (!pickup?.street.trim()) {
      Alert.alert('Dirección requerida', 'Selecciona la dirección de recolección');
      return;
    }
    if (!delivery?.street.trim()) {
      Alert.alert('Dirección requerida', 'Selecciona la dirección de entrega');
      return;
    }
    if (!draft.custodyTypeId) {
      Alert.alert('Error', 'Selecciona un tipo de custodia primero');
      navigation.goBack();
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<OrderResponse>('/orders', {
        custodyTypeId: draft.custodyTypeId,
        pickupAddress: pickup,
        deliveryAddress: delivery,
      });
      const orderId = res.data.data.id;
      setActiveOrderId(orderId);
      setDraft({ pickupAddress: pickup, deliveryAddress: delivery });
      navigation.navigate('ValueDeclaration', { orderId });
    } catch {
      Alert.alert('Error', 'No se pudo crear la orden. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const canContinue = Boolean(pickup?.street && delivery?.street);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Nueva orden</Text>
        <Text style={styles.subtitle}>{draft.custodyTypeName ?? '—'}</Text>

        <AddressPickerField
          label="Recolección"
          value={pickup}
          onChange={setPickup}
          testID="input-pickup"
        />

        <AddressPickerField
          label="Entrega"
          value={delivery}
          onChange={setDelivery}
          testID="input-delivery"
        />

        <TouchableOpacity
          style={[styles.btn, (!canContinue || loading) && styles.btnDisabled]}
          onPress={() => void handleNext()}
          disabled={!canContinue || loading}
          testID="btn-next"
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Continuar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F9FD' },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 2, color: '#1F3864' },
  subtitle: { fontSize: 14, color: '#6C757D', marginBottom: 24 },
  btn: {
    backgroundColor: '#1F3864',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
