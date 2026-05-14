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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { apiClient } from '../../services/api.client';
import { useCustodyStore } from '../../stores/custody.store';
import type { CustodyClientStackParamList } from '../../navigation/types';

type NavProp = StackNavigationProp<CustodyClientStackParamList, 'ValueDeclaration'>;
type RoutePropType = RouteProp<CustodyClientStackParamList, 'ValueDeclaration'>;

interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  minLength?: number;
  maxLength?: number;
}

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
}

function isRequired(schema: JsonSchema, field: string): boolean {
  return schema.required?.includes(field) ?? false;
}

export default function ValueDeclarationScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { orderId } = route.params;
  const { draft, clearDraft } = useCustodyStore();

  const schema = (draft.valueDeclarationSchema ?? {}) as JsonSchema;
  const properties = schema.properties ?? {};
  const fieldNames = Object.keys(properties);

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fieldNames.map((k) => [k, ''])),
  );
  const [loading, setLoading] = useState(false);

  function handleChange(field: string, value: string): void {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(): Promise<void> {
    // Build declared_value from form — coerce numbers
    const declaredValue: Record<string, unknown> = {};
    for (const [key, rawVal] of Object.entries(values)) {
      const prop = properties[key];
      if (!prop) continue;
      if (prop.type === 'number' || prop.type === 'integer') {
        const num = Number(rawVal);
        if (!isNaN(num)) declaredValue[key] = num;
      } else if (prop.type === 'boolean') {
        declaredValue[key] = rawVal.toLowerCase() === 'true';
      } else {
        if (rawVal.trim()) declaredValue[key] = rawVal.trim();
      }
    }

    setLoading(true);
    try {
      // POST value-declaration
      await apiClient.post(`/orders/${orderId}/value-declaration`, { declaredValue });

      // PATCH submit
      await apiClient.patch(`/orders/${orderId}/submit`);

      Alert.alert(
        '¡Orden enviada!',
        'Tu orden está pendiente de aprobación. Te notificaremos cuando sea revisada.',
        [{ text: 'OK', onPress: () => { clearDraft(); navigation.popToTop(); } }],
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Error al enviar la declaración';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Declaración de valores</Text>
        <Text style={styles.subtitle}>Completa la información requerida para tu tipo de custodia</Text>

        {fieldNames.map((field) => {
          const prop = properties[field]!;
          const required = isRequired(schema, field);
          const label = prop.description ?? field;
          const enumValues = prop.enum;

          return (
            <View key={field} style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {label}
                {required ? <Text style={styles.required}> *</Text> : null}
              </Text>
              {enumValues ? (
                <View style={styles.enumContainer}>
                  {enumValues.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.enumOption, values[field] === opt && styles.enumSelected]}
                      onPress={() => handleChange(field, opt)}
                      testID={`enum-${field}-${opt}`}
                    >
                      <Text style={[styles.enumText, values[field] === opt && styles.enumTextSelected]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={values[field] ?? ''}
                  onChangeText={(v) => handleChange(field, v)}
                  keyboardType={
                    prop.type === 'number' || prop.type === 'integer' ? 'numeric' : 'default'
                  }
                  placeholder={prop.type === 'number' ? '0' : ''}
                  testID={`input-${field}`}
                />
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={loading}
          testID="btn-submit-order"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Enviar para aprobación</Text>
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
  subtitle: { fontSize: 14, color: '#555', marginBottom: 20 },
  fieldContainer: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 6 },
  required: { color: '#e53935' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  enumContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  enumOption: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  enumSelected: { borderColor: '#1a1a2e', backgroundColor: '#1a1a2e' },
  enumText: { fontSize: 13, color: '#555' },
  enumTextSelected: { color: '#fff' },
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
