// ---------------------------------------------------------------------------
// geofence.utils.ts — Haversine distance + route deviation helpers
// ---------------------------------------------------------------------------

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Compute the great-circle distance between two geographic points using the
 * Haversine formula. Returns distance in meters.
 */
export function haversineDistance(p1: Point, p2: Point): number {
  const dLat = toRadians(p2.lat - p1.lat);
  const dLng = toRadians(p2.lng - p1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(p1.lat)) *
      Math.cos(toRadians(p2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Compute the minimum perpendicular distance (in meters) from a point to a
 * polyline segment defined by endpoints A and B.
 *
 * Uses the closest point on the segment (not the extended line) so that
 * endpoints are handled correctly.
 */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  // Convert to approximate Cartesian using equirectangular projection
  const refLat = toRadians((a.lat + b.lat) / 2);
  const cosLat = Math.cos(refLat);

  const px = (point.lng - a.lng) * cosLat;
  const py = point.lat - a.lat;
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * cosLat;
  const by = b.lat - a.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestLat = a.lat + t * (b.lat - a.lat);
  const closestLng = a.lng + t * (b.lng - a.lng);

  return haversineDistance(point, { lat: closestLat, lng: closestLng });
}

/**
 * Compute the minimum distance in meters from a point to any segment of a
 * polyline.
 *
 * Returns Infinity if the polyline has fewer than 2 points (degenerate case).
 */
export function distanceToPolyline(point: Point, polyline: Point[]): number {
  if (polyline.length < 2) {
    return polyline.length === 1 ? haversineDistance(point, polyline[0]!) : Infinity;
  }

  let minDistance = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(point, polyline[i]!, polyline[i + 1]!);
    if (d < minDistance) {
      minDistance = d;
    }
  }

  return minDistance;
}

/**
 * Returns true if the given point is further than `thresholdMeters` from the
 * nearest point on the polyline.
 */
export function isOutsideRoute(
  point: Point,
  polyline: Point[],
  thresholdMeters: number,
): boolean {
  return distanceToPolyline(point, polyline) > thresholdMeters;
}
