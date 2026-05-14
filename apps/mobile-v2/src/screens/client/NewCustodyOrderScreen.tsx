import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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

type NavProp = StackNavigationProp<CustodyClientStackParamList, 'NewCustodyOrder'>;

interface OrderResponse {
  data: { id: string; status: string };
}

export default function NewCustodyOrderScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const { draft, setDraft, setActiveOrderId } = useCustodyStore();

  const [loading, setLoading] = useState(false);
  const [pickupStreet, setPickupStreet] = useState(draft.pickupStreet ?? '');
  const [pickupCity, setPickupCity] = useState(draft.pickupCity ?? 'Ciudad de México');
  const [pickupState, setPickupState] = useState(draft.pickupState ?? 'CDMX');
  const [deliveryStreet, setDeliveryStreet] = useState(draft.deliveryStreet ?? '');
  const [deliveryCity, setDeliveryCity] = useState(draft.deliveryCity ?? 'Ciudad de México');
  const [deliveryState, setDeliveryState] = useState(draft.deliveryState ?? 'CDMX');

  async function handleNext(): Promise<void> {
    if (!pickupStreet.trim() || !deliveryStreet.trim()) {
      Alert.alert('Campos requeridos', 'Ingresa las direcciones de recolección y entrega');
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
        pickupAddress: { street: pickupStreet, city: pickupCity, state: pickupState },
        deliveryAddress: { street: deliveryStreet, city: deliveryCity, state: deliveryState },
      });

      const orderId = res.data.data.id;
      setActiveOrderId(orderId);
      setDraft({ pickupStreet, pickupCity, pickupState, deliveryStreet, deliveryCity, deliveryState });
      navigation.navigate('ValueDeclaration', { orderId });
    } catch {
      Alert.alert('Error', 'No se pudo crear la orden. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Nueva orden</Text>
        <Text style={styles.label}>Tipo: {draft.custodyTypeName ?? '—'}</Text>

        <Text style={styles.sectionTitle}>Recolección</Text>
        <TextInput
          style={styles.input}
          placeholder="Calle y número"
          value={pickupStreet}
          onChangeText={setPickupStreet}
          testID="input-pickup-street"
        />
        <TextInput
          style={styles.input}
          placeholder="Ciudad"
          value={pickupCity}
          onChangeText={setPickupCity}
        />
        <TextInput
          style={styles.input}
          placeholder="Estado"
          value={pickupState}
          onChangeText={setPickupState}
        />

        <Text style={styles.sectionTitle}>Entrega</Text>
        <TextInput
          style={styles.input}
          placeholder="Calle y número"
          value={deliveryStreet}
          onChangeText={setDeliveryStreet}
          testID="input-delivery-street"
        />
        <TextInput
          style={styles.input}
          placeholder="Ciudad"
          value={deliveryCity}
          onChangeText={setDeliveryCity}
        />
        <TextInput
          style={styles.input}
          placeholder="Estado"
          value={deliveryState}
          onChangeText={setDeliveryState}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleNext()}
          disabled={loading}
          testID="btn-next"
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4, color: '#1a1a2e' },
  label: { fontSize: 14, color: '#555', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 10,
  },
  btn: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
