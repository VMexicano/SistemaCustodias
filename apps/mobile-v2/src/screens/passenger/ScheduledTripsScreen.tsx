import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api.client';

interface ScheduledTrip {
  id: string;
  trip_id: string;
  scheduled_for: string;
  origin_address: string;
  destination_address: string;
  estimated_fare: number | null;
  trip_type_name: string;
}

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary100: '#EBF3FB',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
  error: '#DC3545',
  errorBg: '#FFF5F5',
  border: '#D1D5DB',
  white: '#FFFFFF',
  separator: '#E5E7EB',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFare(fare: number | null): string {
  return fare != null ? `$${fare.toFixed(2)} MXN` : '— MXN';
}

export default function ScheduledTripsScreen(): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ScheduledTrip[]>({
    queryKey: ['scheduled-trips'],
    queryFn: () =>
      apiClient.get('/trips/scheduled').then((r) => r.data.data as ScheduledTrip[]),
    refetchOnWindowFocus: true,
  });

  const cancelMutation = useMutation({
    mutationFn: (tripId: string) => apiClient.delete(`/trips/scheduled/${tripId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-trips'] });
    },
    onError: () => {
      Alert.alert('Error', 'No se pudo cancelar el viaje');
    },
  });

  function handleCancel(tripId: string): void {
    Alert.alert(
      '¿Cancelar viaje?',
      'Esta acción no se puede deshacer.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(tripId),
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center} testID="scheduled-trips-loading">
        <ActivityIndicator size="large" color={colors.primary600} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center} testID="scheduled-trips-error">
        <Text style={styles.errorText}>No se pudieron cargar tus viajes programados.</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void refetch()}
          accessibilityRole="button"
          testID="scheduled-trips-retry-btn"
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const trips = data ?? [];

  return (
    <FlatList
      testID="scheduled-trips-list"
      style={styles.list}
      contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.listContent}
      data={trips}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          colors={[colors.primary600]}
          tintColor={colors.primary600}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyState} testID="scheduled-trips-empty">
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>No tienes viajes programados aún</Text>
          <Text style={styles.emptySubtitle}>
            Programa un viaje desde la pantalla de estimación de tarifa.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card} testID={`scheduled-trip-card-${item.id}`}>
          {/* Service type badge */}
          <View style={styles.cardHeader}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{item.trip_type_name}</Text>
            </View>
            <Text style={styles.fareText}>{formatFare(item.estimated_fare)}</Text>
          </View>

          {/* Route */}
          <View style={styles.routeRow}>
            <View style={styles.routeConnector}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary600 }]} />
              <View style={styles.routeLine} />
              <View style={[styles.routeDot, styles.routeDotSquare, { backgroundColor: colors.primary900 }]} />
            </View>
            <View style={styles.routeAddresses}>
              <Text style={styles.routeLabel}>Origen</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {item.origin_address}
              </Text>
              <View style={styles.routeSpacer} />
              <Text style={styles.routeLabel}>Destino</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {item.destination_address}
              </Text>
            </View>
          </View>

          {/* Date and time */}
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Fecha</Text>
            <Text style={styles.dateValue}>
              {formatDate(item.scheduled_for)} · {formatTime(item.scheduled_for)}
            </Text>
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(item.trip_id)}
            disabled={cancelMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Cancelar viaje programado"
            testID={`cancel-trip-btn-${item.trip_id}`}
          >
            {cancelMutation.isPending && cancelMutation.variables === item.trip_id ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancelar viaje</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.primary50,
  },
  listContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  // Center container (loading / error)
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.primary50,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    fontSize: 15,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: colors.primary600,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary900,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.neutral,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Trip card
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  // Card header — badge + fare
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  typeBadge: {
    backgroundColor: colors.primary100,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fareText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary900,
  },

  // Route connector
  routeRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  routeConnector: {
    width: 20,
    alignItems: 'center',
    paddingTop: 16,
    marginRight: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeDotSquare: {
    borderRadius: 2,
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  routeAddresses: {
    flex: 1,
  },
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
  routeSpacer: {
    height: 14,
  },

  // Date row
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: 12,
    marginBottom: 14,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.neutral,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 8,
    paddingTop: 1,
  },
  dateValue: {
    flex: 1,
    fontSize: 13,
    color: colors.primary900,
    fontWeight: '500',
    lineHeight: 18,
  },

  // Cancel button
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelBtnText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
