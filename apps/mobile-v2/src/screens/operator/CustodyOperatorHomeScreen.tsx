import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import type { CustodyOperatorStackParamList } from '../../navigation/types';

type NavProp = StackNavigationProp<CustodyOperatorStackParamList, 'CustodyOperatorHome'>;

interface Address {
  street: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
}

interface ActiveOrder {
  id: string;
  orderNumber: string;
  status: string;
  pickupAddress: Address;
  deliveryAddress: Address;
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Asignado',
  REASSIGNED: 'Reasignado',
  CREW_CONFIRMED: 'Tripulación confirmada',
  EN_ROUTE_TO_PICKUP: 'En ruta a pickup',
  AT_PICKUP: 'En pickup',
  IN_TRANSIT: 'En tránsito',
  AT_DELIVERY: 'En punto de entrega',
  INCIDENT: 'Incidente',
};

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
  danger: '#DC3545',
};

export default function CustodyOperatorHomeScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<{ data: ActiveOrder[] }>('/orders/my');
        setOrders(res.data.data);
      } catch {
        setError('No se pudieron cargar las órdenes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary600} testID="loading-indicator" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="error-text">{error}</Text>
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText} testID="empty-text">Sin órdenes activas</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis órdenes activas</Text>
      </View>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`order-card-${item.id}`}
            style={styles.card}
            onPress={() => navigation.navigate('CustodyActiveOrder', { orderId: item.id })}
            accessibilityRole="button"
          >
            <View style={styles.cardHeader}>
              <Text style={styles.orderNumber}>{item.orderNumber}</Text>
              <View style={styles.statusChip}>
                <Text style={styles.statusText}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>Pickup</Text>
              <Text style={styles.addressValue} numberOfLines={1}>
                {item.pickupAddress.street}, {item.pickupAddress.city}
              </Text>
            </View>
            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>Entrega</Text>
              <Text style={styles.addressValue} numberOfLines={1}>
                {item.deliveryAddress.street}, {item.deliveryAddress.city}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  header: { padding: 16, backgroundColor: colors.primary900 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderNumber: { fontSize: 15, fontWeight: '700', color: colors.primary900 },
  statusChip: { backgroundColor: colors.primary600, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  addressRow: { flexDirection: 'row', marginBottom: 4 },
  addressLabel: { width: 52, fontSize: 13, fontWeight: '600', color: colors.neutral },
  addressValue: { flex: 1, fontSize: 13, color: colors.primary900 },
  errorText: { fontSize: 16, color: colors.danger, textAlign: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: colors.neutral },
});
