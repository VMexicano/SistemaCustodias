import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../../services/api.client';
import { useAuthStore } from '../../stores/auth.store';
import { useVerticalStore } from '../../stores/vertical.store';
import NotificationService from '../../services/notification.service';
import { ENV } from '../../config/env';

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
  neutral: '#6C757D',
};

type LoginStep = 'phone' | 'otp';

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
      setTokens(accessToken, refreshToken);
      setUser(user.id, roles.includes('driver') ? 'driver' : 'passenger');
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
          <Text style={styles.devLabel}>DEV — acceso rápido</Text>
          <View style={styles.devRow}>
            <TouchableOpacity
              style={styles.devBtn}
              onPress={() => {
                setPhone('+525500000001');
                setErrorMsg('');
                if (step === 'otp') {
                  setOtp('123456');
                } else {
                  setStep('phone');
                }
              }}
              accessibilityRole="button"
            >
              <Text style={styles.devBtnText}>Pasajero</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.devBtn}
              onPress={() => {
                setPhone('+525500000002');
                setErrorMsg('');
                if (step === 'otp') {
                  setOtp('123456');
                } else {
                  setStep('phone');
                }
              }}
              accessibilityRole="button"
            >
              <Text style={styles.devBtnText}>Conductor</Text>
            </TouchableOpacity>
          </View>
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
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
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
    gap: 12,
  },
  devBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  devBtnText: {
    fontSize: 13,
    color: colors.neutral,
    fontWeight: '500',
  },
});
