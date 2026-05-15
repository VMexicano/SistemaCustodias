import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { apiClient } from '../../services/api.client';
import { useAuthStore, type UserRole } from '../../stores/auth.store';
import { useVerticalStore } from '../../stores/vertical.store';
import NotificationService from '../../services/notification.service';
import { ENV } from '../../config/env';
import { tlog } from '../../config/reactotron';

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
};

type LoginStep = 'phone' | 'otp';

const DEV_ACTORS = [
  { label: 'Cliente',     phone: '+525500000099', color: '#2E75B6' },
  { label: 'Supervisor',  phone: '+525500000098', color: '#7B2D8B' },
  { label: 'Dispatcher',  phone: '+525500000097', color: '#1D6A2B' },
  { label: 'Custodio',    phone: '+525500000096', color: '#C0392B' },
  { label: 'Copiloto',    phone: '+525500000095', color: '#E67E22' },
  { label: 'Pasajero',    phone: '+525500000001', color: '#6C757D' },
  { label: 'Conductor',   phone: '+525500000002', color: '#6C757D' },
] as const;

function resolveRole(roles: string[]): UserRole {
  if (roles.includes('custodio')) return 'custodio';
  if (roles.includes('copiloto')) return 'copiloto';
  if (roles.includes('client')) return 'client';
  if (roles.includes('dispatcher')) return 'dispatcher';
  if (roles.includes('supervisor')) return 'supervisor';
  if (roles.includes('driver')) return 'driver';
  return 'passenger';
}

export default function LoginScreen(): React.JSX.Element {
  const { name: verticalName, loaded } = useVerticalStore();
  const appTitle = loaded ? verticalName : ENV.appName;
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { setTokens, setUser } = useAuthStore();

  async function handleSendOtp(): Promise<void> {
    if (!phone.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await apiClient.post('/auth/login', { phone: phone.trim() });
      setStep('otp');
    } catch {
      setErrorMsg('No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(): Promise<void> {
    if (!otp.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        roles: string[];
        user: { id: string };
      }>('/auth/verify-phone', { phone: phone.trim(), otp: otp.trim() });
      const { accessToken, refreshToken, roles, user } = res.data;
      const role = resolveRole(roles);
      tlog('auth:login', { userId: user.id, roles, resolvedRole: role });
      setTokens(accessToken, refreshToken);
      setUser(user.id, role);
      void NotificationService.registerToken();
    } catch {
      setErrorMsg('Código incorrecto. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{appTitle}</Text>
      <Text style={styles.subtitle}>
        {step === 'phone' ? 'Ingresa tu número de teléfono' : 'Ingresa el código OTP'}
      </Text>

      {step === 'phone' ? (
        <TextInput
          testID="login-phone-input"
          style={styles.input}
          placeholder="+52 55 1234 5678"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoFocus
          accessibilityLabel="Número de teléfono"
        />
      ) : (
        <TextInput
          testID="login-otp-input"
          style={styles.input}
          placeholder="123456"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          accessibilityLabel="Código OTP"
        />
      )}

      {errorMsg ? (
        <Text testID="login-error-msg" style={styles.errorText}>{errorMsg}</Text>
      ) : null}

      <TouchableOpacity
        testID={step === 'phone' ? 'login-send-otp-btn' : 'login-verify-btn'}
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
        disabled={loading}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {step === 'phone' ? 'Enviar código' : 'Verificar'}
          </Text>
        )}
      </TouchableOpacity>

      {step === 'otp' && (
        <TouchableOpacity onPress={() => setStep('phone')}>
          <Text style={styles.link}>Cambiar número</Text>
        </TouchableOpacity>
      )}

      {__DEV__ && (
        <View style={styles.devPanel}>
          <Text style={styles.devLabel}>DEV — acceso rápido (OTP: 123456)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.devRow}>
            {DEV_ACTORS.map((actor) => (
              <TouchableOpacity
                key={actor.phone}
                style={[styles.devBtn, { borderColor: actor.color }]}
                onPress={() => {
                  setPhone(actor.phone);
                  setOtp('123456');
                  setErrorMsg('');
                  setStep('phone');
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.devBtnText, { color: actor.color }]}>{actor.label}</Text>
                <Text style={styles.devBtnPhone}>{actor.phone.slice(-4)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary900,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.neutral,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 18,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: colors.primary600,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  link: { color: colors.primary600, fontSize: 14, textDecorationLine: 'underline' },
  errorText: { color: '#c0392b', fontSize: 14, marginBottom: 8, textAlign: 'center' },

  devPanel: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  devLabel: {
    fontSize: 11,
    color: colors.neutral,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  devRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  devBtn: {
    minWidth: 72,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
  },
  devBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  devBtnPhone: {
    fontSize: 10,
    color: colors.neutral,
    marginTop: 1,
  },
});
