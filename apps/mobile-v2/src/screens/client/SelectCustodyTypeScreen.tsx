import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { apiClient } from '../../services/api.client';
import type { CustodyType } from '../../stores/custody.store';
import { useCustodyStore } from '../../stores/custody.store';
import type { CustodyClientStackParamList } from '../../navigation/types';

type NavProp = StackNavigationProp<CustodyClientStackParamList, 'SelectCustodyType'>;

export default function SelectCustodyTypeScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const { setDraft } = useCustodyStore();
  const [types, setTypes] = useState<CustodyType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<{ data: CustodyType[] }>('/custody-types');
        setTypes(res.data.data);
      } catch {
        Alert.alert('Error', 'No se pudieron cargar los tipos de custodia');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleSelect(type: CustodyType): void {
    setDraft({
      custodyTypeId: type.id,
      custodyTypeName: type.name,
      valueDeclarationSchema: type.valueDeclarationSchema,
    });
    navigation.navigate('NewCustodyOrder');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Tipo de custodia</Text>
      <Text style={styles.subtitle}>Selecciona qué necesitas transportar</Text>
      <FlatList
        data={types}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleSelect(item)}
            testID={`custody-type-${item.slug}`}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.description ? (
              <Text style={styles.cardDesc}>{item.description}</Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', margin: 20, color: '#1a1a2e' },
  subtitle: { fontSize: 14, color: '#666', marginHorizontal: 20, marginBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  cardDesc: { fontSize: 13, color: '#777', marginTop: 4 },
});
