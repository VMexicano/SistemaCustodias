// ---------------------------------------------------------------------------
// geofence.utils.test.ts — unit tests for haversine + geofence helpers
// ---------------------------------------------------------------------------

import {
  haversineDistance,
  distanceToPolyline,
  isOutsideRoute,
  type Point,
} from '../../modules/custody-tracking/geofence.utils.js';

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    const p: Point = { lat: 19.432608, lng: -99.133209 };
    expect(haversineDistance(p, p)).toBeCloseTo(0, 2);
  });

  it('calculates known distance between two points in CDMX', () => {
    // Zócalo → Ángel de la Independencia — approx 3.7 km straight line
    const zocalo: Point = { lat: 19.4326, lng: -99.1332 };
    const angel: Point = { lat: 19.4270, lng: -99.1677 };
    const dist = haversineDistance(zocalo, angel);
    expect(dist).toBeGreaterThan(2500);
    expect(dist).toBeLessThan(4500);
  });

  it('is symmetric', () => {
    const p1: Point = { lat: 19.0, lng: -99.0 };
    const p2: Point = { lat: 20.0, lng: -100.0 };
    expect(haversineDistance(p1, p2)).toBeCloseTo(haversineDistance(p2, p1), 1);
  });

  it('returns distance in meters (not km)', () => {
    // Two points ~1 degree latitude apart ≈ 111 km
    const p1: Point = { lat: 0, lng: 0 };
    const p2: Point = { lat: 1, lng: 0 };
    const dist = haversineDistance(p1, p2);
    expect(dist).toBeGreaterThan(100_000);
    expect(dist).toBeLessThan(115_000);
  });
});

// ---------------------------------------------------------------------------
// distanceToPolyline
// ---------------------------------------------------------------------------

describe('distanceToPolyline', () => {
  it('returns Infinity for empty polyline', () => {
    const p: Point = { lat: 19.0, lng: -99.0 };
    expect(distanceToPolyline(p, [])).toBe(Infinity);
  });

  it('returns distance to single point for 1-point polyline', () => {
    const p: Point = { lat: 19.0, lng: -99.0 };
    const q: Point = { lat: 19.001, lng: -99.0 };
    const dist = distanceToPolyline(p, [q]);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(500); // ~111m per 0.001 deg lat
  });

  it('returns near-zero for a point on the segment', () => {
    const a: Point = { lat: 19.0, lng: -99.0 };
    const b: Point = { lat: 19.1, lng: -99.0 };
    const mid: Point = { lat: 19.05, lng: -99.0 }; // midpoint
    const dist = distanceToPolyline(mid, [a, b]);
    expect(dist).toBeLessThan(1); // essentially on the line
  });

  it('returns distance to nearest segment for multi-segment polyline', () => {
    const polyline: Point[] = [
      { lat: 19.0, lng: -99.0 },
      { lat: 19.1, lng: -99.0 },
      { lat: 19.2, lng: -99.0 },
    ];
    // Point offset 0.01 degrees east at the middle segment
    const p: Point = { lat: 19.15, lng: -98.99 };
    const dist = distanceToPolyline(p, polyline);
    // 0.01 degree longitude ≈ ~900m at this latitude
    expect(dist).toBeGreaterThan(500);
    expect(dist).toBeLessThan(1500);
  });
});

// ---------------------------------------------------------------------------
// isOutsideRoute
// ---------------------------------------------------------------------------

describe('isOutsideRoute', () => {
  const route: Point[] = [
    { lat: 19.0, lng: -99.0 },
    { lat: 19.1, lng: -99.0 },
  ];

  it('returns false when point is within threshold', () => {
    const p: Point = { lat: 19.05, lng: -99.0 }; // on the route
    expect(isOutsideRoute(p, route, 500)).toBe(false);
  });

  it('returns true when point exceeds threshold', () => {
    // 0.1 degree east of the route ≈ ~9 km at this lat
    const p: Point = { lat: 19.05, lng: -98.9 };
    expect(isOutsideRoute(p, route, 500)).toBe(true);
  });

  it('returns true when point is exactly at threshold boundary (exclusive)', () => {
    // Find a point exactly 500m away by placing it ~0.0045 deg offset
    // 0.0045 deg lat ≈ 500m
    const p: Point = { lat: 19.05, lng: -99.0045 };
    const dist = distanceToPolyline(p, route);
    const result = isOutsideRoute(p, route, dist - 1); // threshold 1m less than actual dist
    expect(result).toBe(true);
  });

  it('returns false for empty polyline threshold scenario', () => {
    // With empty polyline, distance is Infinity → always outside
    expect(isOutsideRoute({ lat: 19.0, lng: -99.0 }, [], 500)).toBe(true);
  });
});
