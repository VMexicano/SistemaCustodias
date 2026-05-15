import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { searchPlaces, reverseGeocode, type GeocodingFeature } from '../services/geocoding.service';
import type { AddressValue } from '../stores/custody.store';

export type { AddressValue };

interface Props {
  label: string;
  value: AddressValue | null;
  onChange: (address: AddressValue) => void;
  testID?: string;
}

const CDMX_CENTER: [number, number] = [-99.1332, 19.4326];
const STATE_RX = /^(CDMX|Jalisco|Nuevo León|Estado de México|Puebla|Querétaro|Veracruz|Guanajuato|Oaxaca|Chihuahua|Sonora|Sinaloa|Tamaulipas|Yucatán|Coahuila|Guerrero|Baja California)/i;

function parseFeature(feature: GeocodingFeature): AddressValue {
  const parts = feature.place_name.split(', ');
  const street = parts[0] ?? feature.place_name;
  const filtered = parts.filter((p) => p !== 'México' && p !== 'Mexico');
  const rawState = filtered.find((p) => STATE_RX.test(p.trim())) ?? filtered[filtered.length - 1] ?? '';
  const state = rawState.replace(/\s+\d{5}$/, '').trim() || 'CDMX';
  const rawCity = filtered.find((p) => /ciudad|municipio/i.test(p)) ?? (filtered.length > 2 ? filtered[filtered.length - 2] : '');
  const city = rawCity.replace(/\s+\d{5}$/, '').trim() || 'Ciudad de México';
  return { street, city, state, lat: feature.center[1], lng: feature.center[0] };
}

function parsePlaceName(placeName: string, lat: number, lng: number): AddressValue {
  const parts = placeName.split(', ');
  const street = parts[0] ?? placeName;
  const filtered = parts.filter((p) => p !== 'México' && p !== 'Mexico');
  const rawState = filtered.find((p) => STATE_RX.test(p.trim())) ?? filtered[filtered.length - 1] ?? '';
  const state = rawState.replace(/\s+\d{5}$/, '').trim() || 'CDMX';
  const rawCity = filtered.find((p) => /ciudad|municipio/i.test(p)) ?? (filtered.length > 2 ? filtered[filtered.length - 2] : '');
  const city = rawCity.replace(/\s+\d{5}$/, '').trim() || 'Ciudad de México';
  return { street, city, state, lat, lng };
}

export default function AddressPickerField({ label, value, onChange, testID }: Props): React.JSX.Element {
  const [query, setQuery] = useState(value?.street ?? '');
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapInitCenter, setMapInitCenter] = useState<[number, number]>(CDMX_CENTER);
  const [confirmingMap, setConfirmingMap] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proximityRef = useRef<{ lng: number; lat: number } | undefined>(undefined);
  const mapCenterRef = useRef<[number, number]>(CDMX_CENTER);

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        void Location.getCurrentPositionAsync({}).then((pos) => {
          proximityRef.current = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        });
      }
    });
  }, []);

  // Sync display text when the value is set from outside
  useEffect(() => {
    if (value?.street && value.street !== query) {
      setQuery(value.street);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.street]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) return;
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      void searchPlaces(text, proximityRef.current)
        .then(setSuggestions)
        .finally(() => setSearching(false));
    }, 380);
  }, []);

  function handleSelect(feature: GeocodingFeature): void {
    const addr = parseFeature(feature);
    setQuery(addr.street);
    setSuggestions([]);
    onChange(addr);
  }

  function handleClear(): void {
    setQuery('');
    setSuggestions([]);
  }

  async function handleGps(): Promise<void> {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      proximityRef.current = { lng, lat };
      const placeName = await reverseGeocode(lng, lat);
      const addr = parsePlaceName(placeName, lat, lng);
      setQuery(addr.street);
      setSuggestions([]);
      onChange(addr);
    } finally {
      setGpsLoading(false);
    }
  }

  async function handleOpenMap(): Promise<void> {
    let center: [number, number] = CDMX_CENTER;
    if (value?.lat && value.lng) {
      center = [value.lng, value.lat];
    } else {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          center = [pos.coords.longitude, pos.coords.latitude];
        }
      } catch { /* use fallback */ }
    }
    mapCenterRef.current = center;
    setMapInitCenter(center);
    setMapVisible(true);
  }

  async function handleMapConfirm(): Promise<void> {
    setConfirmingMap(true);
    try {
      const [lng, lat] = mapCenterRef.current;
      const placeName = await reverseGeocode(lng, lat);
      const addr = parsePlaceName(placeName, lat, lng);
      setQuery(addr.street);
      setSuggestions([]);
      onChange(addr);
      setMapVisible(false);
    } finally {
      setConfirmingMap(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          style={styles.input}
          placeholder="Buscar dirección..."
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.inputAddon} />
        ) : query.length > 0 ? (
          <TouchableOpacity style={styles.inputAddon} onPress={handleClear} accessibilityLabel="Borrar">
            <Text style={styles.addonText}>✕</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => void handleGps()}
          disabled={gpsLoading}
          testID={testID ? `${testID}-gps` : undefined}
          accessibilityLabel="Usar ubicación actual"
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.addonText}>📍</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => void handleOpenMap()}
          testID={testID ? `${testID}-map` : undefined}
          accessibilityLabel="Elegir en mapa"
        >
          <Text style={styles.addonText}>🗺</Text>
        </TouchableOpacity>
      </View>

      {value?.lat !== undefined && (
        <Text style={styles.coordHint} testID={testID ? `${testID}-coords` : undefined}>
          {value.city}, {value.state}{'  '}
          <Text style={styles.coordDim}>
            {value.lat.toFixed(5)}, {value.lng?.toFixed(5)}
          </Text>
        </Text>
      )}

      {suggestions.length > 0 && (
        <FlatList
          style={styles.dropdown}
          data={suggestions}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.suggestion}
              onPress={() => handleSelect(item)}
              accessibilityRole="button"
            >
              <Text style={styles.suggestionText} numberOfLines={2}>{item.place_name}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <Modal visible={mapVisible} animationType="slide" statusBarTranslucent onRequestClose={() => setMapVisible(false)}>
        <View style={styles.mapContainer}>
          <MapboxGL.MapView
            style={styles.mapView}
            onRegionDidChange={(feature) => {
              const coords = (feature as unknown as { geometry: { coordinates: [number, number] } })
                .geometry.coordinates;
              if (coords) mapCenterRef.current = coords;
            }}
          >
            <MapboxGL.Camera
              zoomLevel={15}
              centerCoordinate={mapInitCenter}
              animationDuration={300}
            />
          </MapboxGL.MapView>

          {/* Crosshair fijo en el centro de la pantalla */}
          <View style={styles.crosshairWrap} pointerEvents="none">
            <Text style={styles.crosshairPin}>📍</Text>
          </View>

          <View style={styles.mapTopBar}>
            <TouchableOpacity
              style={styles.mapCancelBtn}
              onPress={() => setMapVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.mapCancelText}>✕  Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.mapHint}>Mueve el mapa para posicionar el pin</Text>
          </View>

          <View style={styles.mapBottomBar}>
            <TouchableOpacity
              style={styles.mapConfirmBtn}
              onPress={() => void handleMapConfirm()}
              disabled={confirmingMap}
              accessibilityRole="button"
            >
              {confirmingMap
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.mapConfirmText}>Confirmar ubicación</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const colors = {
  primary: '#2E75B6',
  primary900: '#1F3864',
  neutral: '#6C757D',
  border: '#D1D5DB',
  bg: '#fff',
  hint: '#A0AEC0',
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: colors.primary900, marginBottom: 6 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.primary900,
    paddingVertical: 0,
  },
  inputAddon: {
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  addonText: { fontSize: 16 },

  coordHint: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  coordDim: { color: colors.hint },

  dropdown: {
    maxHeight: 200,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 4,
  },
  suggestion: { padding: 12 },
  suggestionText: { fontSize: 14, color: colors.primary900, lineHeight: 20 },
  separator: { height: 1, backgroundColor: '#F0F4F8' },

  // Map modal
  mapContainer: { flex: 1 },
  mapView: { flex: 1 },
  crosshairWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairPin: {
    fontSize: 36,
    marginBottom: 36, // offset so tip of pin lands on center
  },
  mapTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(31,56,100,0.85)',
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mapCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapCancelText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  mapHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1 },
  mapBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
  },
  mapConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
