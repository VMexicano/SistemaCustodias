import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import type { Feature } from 'geojson';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { PassengerStackParamList } from '../../navigation/types';
import { useTripStore } from '../../stores/trip.store';
import { useVerticalFeatures } from '../../hooks/useVerticalFeatures';
import { searchPlaces, reverseGeocode, type GeocodingFeature } from '../../services/geocoding.service';
import SessionMenuButton from '../../components/SessionMenuButton';

type HomeNavProp = StackNavigationProp<PassengerStackParamList, 'Home'>;
type ActiveField = 'origin' | 'dest';

const CDMX = { lat: 19.4326, lng: -99.1332 };

const colors = {
  primary900: '#1F3864',
  primary600: '#2E75B6',
  primary50: '#F4F9FD',
};

export default function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<HomeNavProp>();
  const features = useVerticalFeatures();

  const [lat, setLat] = useState(CDMX.lat);
  const [lng, setLng] = useState(CDMX.lng);

  const [originAddress, setOriginAddress] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [destAddress, setDestAddress] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [activeField, setActiveField] = useState<ActiveField | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);

  const [pickingField, setPickingField] = useState<ActiveField | null>(null);
  const [reversing, setReversing] = useState(false);

  const { activeTrip } = useTripStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void Location.requestForegroundPermissionsAsync();
  }, []);

  const handleUserLocationUpdate = useCallback(
    (loc: { coords: { latitude: number; longitude: number } }) => {
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      setOriginAddress((prev) => (prev === '' ? 'Mi ubicación' : prev));
    },
    [],
  );

  useEffect(() => {
    if (activeTrip) navigation.navigate('ActiveTrip');
  }, [activeTrip, navigation]);

  const triggerSearch = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (text.trim().length < 3) {
        setSuggestions([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void searchPlaces(text, { lng, lat }).then(setSuggestions);
      }, 300);
    },
    [lat, lng],
  );

  const handleOriginChange = (text: string) => {
    setOriginAddress(text);
    setOriginCoords(null);
    setActiveField('origin');
    triggerSearch(text);
  };

  const handleDestChange = (text: string) => {
    setDestAddress(text);
    setDestCoords(null);
    setActiveField('dest');
    triggerSearch(text);
  };

  const handleOriginFocus = () => {
    setActiveField('origin');
    if (originAddress === 'Mi ubicación') {
      setOriginAddress('');
      setSuggestions([]);
    }
  };

  const handleOriginBlur = () => {
    if (originAddress.trim() === '' && originCoords === null) {
      setOriginAddress('Mi ubicación');
    }
    if (suggestions.length === 0) setActiveField(null);
  };

  const handleSelect = (feature: GeocodingFeature) => {
    if (activeField === 'origin') {
      setOriginAddress(feature.place_name);
      setOriginCoords({ lng: feature.center[0], lat: feature.center[1] });
    } else {
      setDestAddress(feature.place_name);
      setDestCoords({ lng: feature.center[0], lat: feature.center[1] });
    }
    setSuggestions([]);
    setActiveField(null);
  };

  const handlePickOnMap = (field: ActiveField) => {
    setSuggestions([]);
    setActiveField(null);
    setPickingField(field);
  };

  const handleMapPress = useCallback(
    async (e: Feature) => {
      if (!pickingField || e.geometry.type !== 'Point') return;
      const [pLng, pLat] = e.geometry.coordinates as [number, number];
      setReversing(true);
      const address = await reverseGeocode(pLng, pLat);
      setReversing(false);
      if (pickingField === 'origin') {
        setOriginAddress(address);
        setOriginCoords({ lat: pLat, lng: pLng });
      } else {
        setDestAddress(address);
        setDestCoords({ lat: pLat, lng: pLng });
      }
      setPickingField(null);
    },
    [pickingField],
  );

  const effectiveOriginLat = originCoords?.lat ?? lat;
  const effectiveOriginLng = originCoords?.lng ?? lng;
  const stops = destCoords
    ? [{ lat: destCoords.lat, lng: destCoords.lng, address: destAddress }]
    : [];
  const canRequest = stops.length > 0;

  return (
    <View testID="home-map" style={styles.container}>
      <SessionMenuButton
        testID="session-menu-btn-passenger-home"
        onPress={() => navigation.navigate('SessionMenu')}
      />

      <MapboxGL.MapView
        style={styles.map}
        onPress={pickingField ? (e) => { void handleMapPress(e); } : undefined}
      >
        {pickingField ? (
          <MapboxGL.Camera
            zoomLevel={14}
            centerCoordinate={[lng, lat]}
            animationMode="none"
          />
        ) : (
          <MapboxGL.Camera
            followUserLocation
            followZoomLevel={14}
            animationMode="flyTo"
            animationDuration={500}
          />
        )}
        <MapboxGL.UserLocation
          visible
          androidRenderMode="gps"
          onUpdate={handleUserLocationUpdate}
        />
        {originCoords && (
          <MapboxGL.PointAnnotation
            id="origin-pin"
            coordinate={[originCoords.lng, originCoords.lat]}
          >
            <View style={[styles.mapPin, { backgroundColor: colors.primary600 }]} />
          </MapboxGL.PointAnnotation>
        )}
        {destCoords && (
          <MapboxGL.PointAnnotation
            id="dest-pin"
            coordinate={[destCoords.lng, destCoords.lat]}
          >
            <View style={[styles.mapPin, { backgroundColor: colors.primary900 }]} />
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* Modo selección en mapa */}
      {pickingField && (
        <View style={styles.pickingBanner}>
          <Text style={styles.pickingText}>
            Toca el mapa para seleccionar{' '}
            {pickingField === 'origin' ? 'el origen' : 'el destino'}
          </Text>
          {reversing && (
            <ActivityIndicator color="#fff" style={styles.pickingSpinner} />
          )}
          <TouchableOpacity
            style={styles.pickingCancelBtn}
            onPress={() => setPickingField(null)}
            accessibilityRole="button"
          >
            <Text style={styles.pickingCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Panel normal */}
      {!pickingField && (
        <>
          {suggestions.length > 0 && panelHeight > 0 && (
            <FlatList
              style={[styles.suggestionsOverlay, { bottom: panelHeight }]}
              data={suggestions}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {item.place_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View
              style={styles.bottomPanel}
              onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
            >
              <View style={styles.inputsRow}>
                <View style={styles.connector}>
                  <View style={styles.dotOrigin} />
                  <View style={styles.connectorLine} />
                  <View style={styles.dotDest} />
                </View>

                <View style={styles.fields}>
                  <View style={styles.inputRow}>
                    <TextInput
                      testID="home-origin-input"
                      style={styles.input}
                      placeholder="Ingresa origen"
                      value={originAddress}
                      onChangeText={handleOriginChange}
                      onFocus={handleOriginFocus}
                      onBlur={handleOriginBlur}
                      accessibilityLabel="Origen"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.mapBtn}
                      onPress={() => handlePickOnMap('origin')}
                      accessibilityRole="button"
                      accessibilityLabel="Seleccionar origen en mapa"
                    >
                      <Text style={styles.mapBtnText}>Mapa</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.fieldDivider} />

                  <View style={styles.inputRow}>
                    <TextInput
                      testID="home-dest-input"
                      style={styles.input}
                      placeholder="Ingresa tu destino"
                      value={destAddress}
                      onChangeText={handleDestChange}
                      onFocus={() => setActiveField('dest')}
                      accessibilityLabel="Destino"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.mapBtn}
                      onPress={() => handlePickOnMap('dest')}
                      accessibilityRole="button"
                      accessibilityLabel="Seleccionar destino en mapa"
                    >
                      <Text style={styles.mapBtnText}>Mapa</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                testID="home-request-btn"
                style={[styles.button, !canRequest && styles.buttonDisabled]}
                onPress={() => {
                  if (stops.length === 0) return;
                  navigation.navigate('Estimate', {
                    originLat: effectiveOriginLat,
                    originLng: effectiveOriginLng,
                    originAddress,
                    stops,
                  });
                }}
                disabled={!canRequest}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Cotizar viaje</Text>
              </TouchableOpacity>

              {features.scheduling && (
                <TouchableOpacity
                  testID="home-scheduled-trips-btn"
                  style={styles.scheduledButton}
                  onPress={() => navigation.navigate('ScheduledTrips')}
                  accessibilityRole="button"
                  accessibilityLabel="Mis viajes programados"
                >
                  <Text style={styles.scheduledButtonText}>Mis programados</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 3,
  },

  // Banner de selección en mapa
  pickingBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.primary900,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    alignItems: 'center',
  },
  pickingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  pickingSpinner: { marginTop: 8 },
  pickingCancelBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickingCancelText: { color: '#fff', fontSize: 15 },

  // Overlay de sugerencias
  suggestionsOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxHeight: 240,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  suggestionText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  bottomPanel: {
    backgroundColor: colors.primary50,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  connector: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    marginRight: 8,
  },
  dotOrigin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary600,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
  },
  connectorLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#D1D5DB',
    marginVertical: 4,
  },
  dotDest: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.primary900,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
  },
  fields: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 15,
    backgroundColor: '#fff',
    minHeight: 44,
  },
  mapBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary600,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapBtnText: {
    color: colors.primary600,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldDivider: { height: 8 },
  button: {
    backgroundColor: colors.primary600,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  scheduledButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.primary600,
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  scheduledButtonText: {
    color: colors.primary600,
    fontSize: 15,
    fontWeight: '600',
  },
});
