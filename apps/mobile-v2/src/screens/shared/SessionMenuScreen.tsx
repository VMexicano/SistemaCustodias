import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuthStore } from '../../stores/auth.store';
import { useTripStore } from '../../stores/trip.store';
import { useDriverStore } from '../../stores/driver.store';
import { disconnectSocket } from '../../services/socket.client';

type AppNav = NavigationProp<Record<string, object | undefined>>;

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
  success: '#28A745',
  warning: '#FFC107',
  error: '#DC3545',
};

function maskToken(token: string | null): string {
  if (!token) return 'No disponible';
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

export default function SessionMenuScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNav>();
  const { userId, role, accessToken, refreshToken, logout } = useAuthStore();
  const { activeTrip: passengerTrip, tripStatus, clearTrip } = useTripStore();
  const {
    isOnline,
    activeTrip: driverTrip,
    setActiveTrip,
    setPendingRequest,
    setOnline,
  } = useDriverStore();

  const isPassenger = role === 'passenger';
  const isDriver = role === 'driver';

  function handleLogout(): void {
    disconnectSocket();
    clearTrip();
    setActiveTrip(null);
    setPendingRequest(null);
    setOnline(false);
    logout();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Menu de sesion</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Perfil</Text>
        <Text style={styles.row}><Text style={styles.label}>Rol:</Text> {role ?? 'No definido'}</Text>
        <Text style={styles.row}><Text style={styles.label}>Usuario:</Text> {userId ?? 'No definido'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sesion</Text>
        <Text style={styles.row}><Text style={styles.label}>Autenticado:</Text> {accessToken ? 'Si' : 'No'}</Text>
        <Text style={styles.row}><Text style={styles.label}>Access token:</Text> {maskToken(accessToken)}</Text>
        <Text style={styles.row}><Text style={styles.label}>Refresh token:</Text> {maskToken(refreshToken)}</Text>
      </View>

      {isPassenger && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Viaje (pasajero)</Text>
          <Text style={styles.row}><Text style={styles.label}>Activo:</Text> {passengerTrip ? 'Si' : 'No'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Trip ID:</Text> {passengerTrip?.id ?? 'Sin viaje activo'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {tripStatus ?? 'Sin estado'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Destino:</Text> {passengerTrip?.stops[passengerTrip.stops.length - 1]?.address ?? 'Sin destino'}</Text>
        </View>
      )}

      {isDriver && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Viaje (conductor)</Text>
          <Text style={styles.row}><Text style={styles.label}>Disponible:</Text> {isOnline ? 'Si' : 'No'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Trip ID:</Text> {driverTrip?.id ?? 'Sin viaje activo'}</Text>
          <Text style={styles.row}><Text style={styles.label}>Estado:</Text> {driverTrip?.status ?? 'Sin estado'}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primary]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Volver</Text>
        </TouchableOpacity>

        {isPassenger && (
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => navigation.navigate('Home')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Ir a inicio</Text>
          </TouchableOpacity>
        )}

        {isDriver && (
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => navigation.navigate('Online')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Ir a panel conductor</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.danger]}
          onPress={handleLogout}
          accessibilityRole="button"
        >
          <Text style={styles.dangerText}>Cerrar sesion</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.primary50,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary900,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary900,
    marginBottom: 8,
  },
  row: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
  },
  label: {
    fontWeight: '700',
    color: colors.neutral,
  },
  actions: {
    marginTop: 4,
    gap: 10,
  },
  button: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primary: {
    backgroundColor: colors.primary600,
  },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.primary600,
  },
  danger: {
    backgroundColor: colors.error,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryText: {
    color: colors.primary600,
    fontSize: 15,
    fontWeight: '700',
  },
  dangerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  statusGood: {
    color: colors.success,
  },
  statusWarn: {
    color: colors.warning,
  },
});
