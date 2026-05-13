import { ENV } from '../config/env';

export interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}

const BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const url =
    `${BASE}/${lng},${lat}.json` +
    `?access_token=${ENV.mapboxToken}` +
    `&language=es&types=address,place,poi&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = (await res.json()) as { features?: GeocodingFeature[] };
    return data.features?.[0]?.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}
const NEARBY_RADIUS_KM = 30;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function searchPlaces(
  query: string,
  proximity?: { lng: number; lat: number },
): Promise<GeocodingFeature[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const prox = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const url =
    `${BASE}/${encodeURIComponent(trimmed)}.json` +
    `?access_token=${ENV.mapboxToken}` +
    `&language=es&country=MX` +
    `&types=address,place,neighborhood,locality,poi` +
    `&limit=8${prox}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: GeocodingFeature[] };
    const features = data.features ?? [];

    if (!proximity) return features.slice(0, 5);

    const withDist = features.map((f) => ({
      feature: f,
      km: haversineKm(proximity.lat, proximity.lng, f.center[1], f.center[0]),
    }));

    const nearby = withDist
      .filter((x) => x.km <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.feature);

    const farther = withDist
      .filter((x) => x.km > NEARBY_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.feature);

    return [...nearby, ...farther].slice(0, 5);
  } catch {
    return [];
  }
}
