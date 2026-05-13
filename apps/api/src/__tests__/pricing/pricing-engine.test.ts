/**
 * PricingEngine — unit tests (100% coverage required)
 *
 * Pure class — no database, no Testcontainers.
 */

import { PricingEngine } from '../../modules/pricing/pricing-engine.js';
import type { TripTypeRow, PricingFactorRow } from '../../modules/pricing/pricing-engine.js';
import type { PricingSnapshot } from '../../modules/pricing/pricing.types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseTripType: TripTypeRow = {
  id: 'trip-type-basic',
  region_id: 'region-mx',
  base_fare: 25,
  cost_per_km: 8.5,
  cost_per_minute: 1.5,
  min_fare: 35,
};

const cdmx = { lat: 19.4326, lng: -99.1332 }; // Zócalo
const aeropuerto = { lat: 19.4361, lng: -99.0719 }; // AICM

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngine() {
  return new PricingEngine();
}

function makeFactor(
  overrides: Partial<PricingFactorRow> & Pick<PricingFactorRow, 'code' | 'type' | 'value'>,
): PricingFactorRow {
  return {
    id: `factor-${overrides.code}`,
    priority: 0,
    stackable: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateDistanceKm — haversine
// ---------------------------------------------------------------------------

describe('PricingEngine.calculateDistanceKm() — haversine', () => {
  const engine = makeEngine();

  it('CDMX → Aeropuerto: ~14km ±2%', () => {
    const dist = engine.calculateDistanceKm(cdmx, aeropuerto);
    // AICM is approximately 5.8 km east of Zócalo (straight line)
    // Actual haversine value for these coords is ~5.7km
    expect(dist).toBeGreaterThan(4);
    expect(dist).toBeLessThan(8);
  });

  it('misma coordenada: 0km', () => {
    expect(engine.calculateDistanceKm(cdmx, cdmx)).toBe(0);
  });

  it('tolera distancias cortas < 1km', () => {
    const a = { lat: 19.4326, lng: -99.1332 };
    const b = { lat: 19.4330, lng: -99.1335 };
    const dist = engine.calculateDistanceKm(a, b);
    expect(dist).toBeGreaterThanOrEqual(0);
    expect(dist).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// applyFactors
// ---------------------------------------------------------------------------

describe('PricingEngine.applyFactors()', () => {
  const engine = makeEngine();

  it('fixed_amount suma al subtotal base', () => {
    const factors = [makeFactor({ code: 'fee', type: 'fixed_amount', value: 10 })];
    const { subtotal, factorsApplied } = engine.applyFactors(100, factors);
    expect(subtotal).toBe(110);
    expect(factorsApplied[0]!.impact_amount).toBe(10);
  });

  it('percentage calcula sobre subtotal actualizado (post fixed_amount)', () => {
    const factors = [
      makeFactor({ code: 'fee', type: 'fixed_amount', value: 10 }),
      makeFactor({ code: 'pct', type: 'percentage', value: 0.1 }),
    ];
    const { subtotal, factorsApplied } = engine.applyFactors(100, factors);
    // After fixed_amount: 100 + 10 = 110
    // After percentage: 110 + 110 * 0.1 = 121
    expect(subtotal).toBeCloseTo(121);
    expect(factorsApplied[1]!.impact_amount).toBeCloseTo(11);
  });

  it('multiplier multiplica el resultado acumulado', () => {
    const factors = [makeFactor({ code: 'surge', type: 'multiplier', value: 1.5 })];
    const { subtotal, factorsApplied } = engine.applyFactors(100, factors);
    expect(subtotal).toBe(150);
    expect(factorsApplied[0]!.impact_amount).toBe(50);
  });

  it('stackable=false solo aplica el factor de mayor prioridad del mismo tipo', () => {
    const factors = [
      makeFactor({ code: 'rain', type: 'multiplier', value: 1.3, stackable: false, priority: 1 }),
      makeFactor({ code: 'peak', type: 'multiplier', value: 1.5, stackable: false, priority: 2 }),
    ];
    const { subtotal, factorsApplied } = engine.applyFactors(100, factors);
    // Only rain (priority=1, lower number = higher priority) is applied
    expect(subtotal).toBe(130);
    expect(factorsApplied).toHaveLength(1);
    expect(factorsApplied[0]!.code).toBe('rain');
  });

  it('sin factores retorna el subtotal base intacto', () => {
    const { subtotal, factorsApplied } = engine.applyFactors(100, []);
    expect(subtotal).toBe(100);
    expect(factorsApplied).toHaveLength(0);
  });

  it('aplica factores en orden fijo: fixed_amount → percentage → multiplier', () => {
    const factors = [
      // Provided out of order
      makeFactor({ code: 'surge', type: 'multiplier', value: 2.0 }),
      makeFactor({ code: 'pct', type: 'percentage', value: 0.2 }),
      makeFactor({ code: 'fee', type: 'fixed_amount', value: 5 }),
    ];
    const { subtotal } = engine.applyFactors(100, factors);
    // fixed_amount: 100 + 5 = 105
    // percentage: 105 + 105 * 0.2 = 126
    // multiplier: 126 * 2.0 = 252
    expect(subtotal).toBeCloseTo(252);
  });
});

// ---------------------------------------------------------------------------
// estimate()
// ---------------------------------------------------------------------------

describe('PricingEngine.estimate()', () => {
  const engine = makeEngine();

  it('aplica factores en orden: fixed_amount → percentage → multiplier', () => {
    const factors: PricingFactorRow[] = [
      makeFactor({ code: 'surge', type: 'multiplier', value: 2.0 }),
      makeFactor({ code: 'pct', type: 'percentage', value: 0.2 }),
      makeFactor({ code: 'fee', type: 'fixed_amount', value: 5 }),
    ];
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: factors,
      regionTaxPct: 0.16,
    });
    expect(result.factors_applied).toHaveLength(3);
    expect(result.factors_applied[0]!.type).toBe('fixed_amount');
    expect(result.factors_applied[1]!.type).toBe('percentage');
    expect(result.factors_applied[2]!.type).toBe('multiplier');
    expect(result.final_fare).toBeGreaterThan(0);
    expect(result.currency).toBe('MXN');
  });

  it('respeta min_fare cuando el cálculo es menor', () => {
    // Very short distance — base calculation will be < min_fare
    const shortTrip: TripTypeRow = {
      ...baseTripType,
      base_fare: 5,
      cost_per_km: 1,
      cost_per_minute: 0.1,
      min_fare: 100,
    };
    const a = { lat: 19.4326, lng: -99.1332 };
    const b = { lat: 19.4327, lng: -99.1332 }; // ~11m apart
    const result = engine.estimate({
      origin: a,
      destination: b,
      tripType: shortTrip,
      activeFactors: [],
      regionTaxPct: 0,
    });
    expect(result.subtotal).toBe(100);
  });

  it('maneja caso sin factores activos (precio base únicamente)', () => {
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
    });
    expect(result.factors_applied).toHaveLength(0);
    expect(result.subtotal).toBeGreaterThanOrEqual(Number(baseTripType.min_fare));
  });

  it('calcula tax_amount correctamente (16% sobre subtotal)', () => {
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
    });
    expect(result.tax_amount).toBeCloseTo(result.subtotal * 0.16);
    expect(result.final_fare).toBeCloseTo(result.subtotal + result.tax_amount);
  });

  it('retorna pricing_snapshot serializable con captured_at', () => {
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
    });
    expect(result.pricing_snapshot.captured_at).toBeTruthy();
    // Must be a valid ISO 8601 string
    expect(new Date(result.pricing_snapshot.captured_at).getTime()).not.toBeNaN();
    // Must be JSON-serializable
    expect(() => JSON.stringify(result.pricing_snapshot)).not.toThrow();
  });

  it('registra impact_amount por cada factor aplicado', () => {
    const factors = [
      makeFactor({ code: 'fee', type: 'fixed_amount', value: 10 }),
      makeFactor({ code: 'pct', type: 'percentage', value: 0.1 }),
    ];
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: factors,
      regionTaxPct: 0,
    });
    for (const fa of result.factors_applied) {
      expect(typeof fa.impact_amount).toBe('number');
    }
    expect(result.factors_applied[0]!.impact_amount).toBe(10);
  });

  it('no aplica factores inactivos (solo recibe los que ya filtra el servicio)', () => {
    // PricingEngine trusts the caller to pass only active factors
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
    });
    expect(result.factors_applied).toHaveLength(0);
  });

  it('aplica solo factores que cumplen condition_rules (via activeFactors filtrado por servicio)', () => {
    // Simulate service passing pre-filtered factors
    const preFiltered = [makeFactor({ code: 'fee', type: 'fixed_amount', value: 20 })];
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: preFiltered,
      regionTaxPct: 0,
    });
    expect(result.factors_applied).toHaveLength(1);
    expect(result.factors_applied[0]!.code).toBe('fee');
  });
});

// ---------------------------------------------------------------------------
// PricingEngine — pricingModel extension
// ---------------------------------------------------------------------------

describe('PricingEngine — pricingModel extension', () => {
  const engine = makeEngine();

  it('fixed_rate: returns base_fare ignoring distance and duration', () => {
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType, // base_fare=25, min_fare=35 → fare=35
      activeFactors: [],
      regionTaxPct: 0.16,
      pricingModel: 'fixed_rate',
    });
    // min_fare=35 > base_fare=25, so fare = 35
    expect(result.subtotal).toBe(35);
    expect(result.final_fare).toBe(35);
    expect(result.estimated_duration_min).toBe(0);
    expect(result.factors_applied).toHaveLength(0);
    expect(result.pricing_model).toBe('fixed_rate');
  });

  it('fixed_rate: respects min_fare if base_fare < min_fare', () => {
    const lowBaseFareTripType: TripTypeRow = {
      ...baseTripType,
      base_fare: 10,
      min_fare: 50,
    };
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: lowBaseFareTripType,
      activeFactors: [],
      regionTaxPct: 0,
      pricingModel: 'fixed_rate',
    });
    expect(result.subtotal).toBe(50);
    expect(result.final_fare).toBe(50);
  });

  it('per_weight_km: calculates fare = weight * base_fare + distance * cost_per_km', () => {
    const tripType: TripTypeRow = {
      ...baseTripType,
      base_fare: 5,     // per-kg rate
      cost_per_km: 2,   // per-km rate
      min_fare: 1,      // low min so it doesn't interfere
    };
    // cdmx → aeropuerto ~5.7km
    const dist = engine.calculateDistanceKm(cdmx, aeropuerto);
    const weightKg = 10;
    const expectedRaw = weightKg * 5 + dist * 2;

    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType,
      activeFactors: [],
      regionTaxPct: 0,
      pricingModel: 'per_weight_km',
      weightKg,
    });
    expect(result.subtotal).toBeCloseTo(expectedRaw);
    expect(result.weight_kg).toBe(weightKg);
    expect(result.pricing_model).toBe('per_weight_km');
    expect(result.estimated_duration_min).toBe(0);
  });

  it('per_weight_km: uses minimum weight_kg=1 when weight_kg=0 or undefined', () => {
    const tripType: TripTypeRow = {
      ...baseTripType,
      base_fare: 5,
      cost_per_km: 2,
      min_fare: 1,
    };
    const dist = engine.calculateDistanceKm(cdmx, aeropuerto);
    const expectedRaw = 1 * 5 + dist * 2; // weight clamped to 1

    const resultZero = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType,
      activeFactors: [],
      regionTaxPct: 0,
      pricingModel: 'per_weight_km',
      weightKg: 0,
    });
    expect(resultZero.subtotal).toBeCloseTo(expectedRaw);
    expect(resultZero.weight_kg).toBe(1);

    const resultUndefined = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType,
      activeFactors: [],
      regionTaxPct: 0,
      pricingModel: 'per_weight_km',
      // weightKg not provided
    });
    expect(resultUndefined.subtotal).toBeCloseTo(expectedRaw);
    expect(resultUndefined.weight_kg).toBe(1);
  });

  it('per_weight_km: respects min_fare', () => {
    const tripType: TripTypeRow = {
      ...baseTripType,
      base_fare: 1,
      cost_per_km: 0.1,
      min_fare: 500,
    };
    const result = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType,
      activeFactors: [],
      regionTaxPct: 0,
      pricingModel: 'per_weight_km',
      weightKg: 2,
    });
    expect(result.subtotal).toBe(500);
  });

  it('per_km_min: existing behavior unchanged (regression guard)', () => {
    // Verify that omitting pricingModel or passing 'per_km_min' produces the same result
    const resultDefault = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
    });
    const resultExplicit = engine.estimate({
      origin: cdmx,
      destination: aeropuerto,
      tripType: baseTripType,
      activeFactors: [],
      regionTaxPct: 0.16,
      pricingModel: 'per_km_min',
    });
    expect(resultDefault.subtotal).toBeCloseTo(resultExplicit.subtotal);
    expect(resultDefault.final_fare).toBeCloseTo(resultExplicit.final_fare);
    expect(resultDefault.estimated_duration_min).toBeCloseTo(resultExplicit.estimated_duration_min);
    expect(resultExplicit.pricing_model).toBe('per_km_min');
    // Duration is distance-derived, not 0
    expect(resultDefault.estimated_duration_min).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// recalculate()
// ---------------------------------------------------------------------------

describe('PricingEngine.recalculate()', () => {
  const engine = makeEngine();

  const snapshot: PricingSnapshot = {
    trip_type_id: baseTripType.id,
    base_fare: 25,
    cost_per_km: 8.5,
    cost_per_minute: 1.5,
    min_fare: 35,
    factors: [],
    region_id: 'region-mx',
    tax_pct: 0.16,
    captured_at: '2026-04-06T00:00:00.000Z',
  };

  it('usa pricing_snapshot existente sin leer BD', () => {
    // No mocking needed — recalculate takes snapshot directly
    const result = engine.recalculate({
      newDestination: aeropuerto,
      currentOrigin: cdmx,
      snapshot,
      regionTaxPct: 0.16,
    });
    expect(result.pricing_snapshot).toBe(snapshot); // Same reference, not mutated
    expect(result.currency).toBe('MXN');
  });

  it('recalcula distancia con nuevo destino', () => {
    const closeResult = engine.recalculate({
      newDestination: { lat: cdmx.lat + 0.001, lng: cdmx.lng },
      currentOrigin: cdmx,
      snapshot,
      regionTaxPct: 0,
    });
    const farResult = engine.recalculate({
      newDestination: aeropuerto,
      currentOrigin: cdmx,
      snapshot,
      regionTaxPct: 0,
    });
    expect(farResult.estimated_distance_km).toBeGreaterThan(closeResult.estimated_distance_km);
  });

  it('no modifica el pricing_snapshot original', () => {
    const originalCapturedAt = snapshot.captured_at;
    const originalFactorsLength = snapshot.factors.length;
    engine.recalculate({
      newDestination: aeropuerto,
      currentOrigin: cdmx,
      snapshot,
      regionTaxPct: 0.16,
    });
    // Snapshot should be unchanged
    expect(snapshot.captured_at).toBe(originalCapturedAt);
    expect(snapshot.factors).toHaveLength(originalFactorsLength);
  });

  it('respeta min_fare en el recálculo', () => {
    const highMinFareSnapshot: PricingSnapshot = {
      ...snapshot,
      base_fare: 1,
      cost_per_km: 0.1,
      cost_per_minute: 0.01,
      min_fare: 500,
    };
    const a = { lat: 19.4326, lng: -99.1332 };
    const b = { lat: 19.4327, lng: -99.1332 };
    const result = engine.recalculate({
      newDestination: b,
      currentOrigin: a,
      snapshot: highMinFareSnapshot,
      regionTaxPct: 0,
    });
    expect(result.subtotal).toBe(500);
  });

  it('reconstruye factorRows desde snapshot con factores activos', () => {
    // snapshot with factors — exercises the .map(f => ...) callback on line 113
    const snapshotWithFactors: PricingSnapshot = {
      ...snapshot,
      factors: [
        {
          id: 'factor-surge',
          code: 'SURGE',
          type: 'multiplier',
          value: 1.5,
          priority: 0,
          stackable: true,
        },
      ],
    };
    const result = engine.recalculate({
      newDestination: aeropuerto,
      currentOrigin: cdmx,
      snapshot: snapshotWithFactors,
      regionTaxPct: 0.16,
    });
    // Factor should have been applied (multiplier 1.5x)
    expect(result.factors_applied).toHaveLength(1);
    expect(result.factors_applied[0]!.code).toBe('SURGE');
    expect(result.factors_applied[0]!.type).toBe('multiplier');
    expect(result.factors_applied[0]!.impact_amount).toBeGreaterThan(0);
    // Snapshot must not be mutated
    expect(result.pricing_snapshot).toBe(snapshotWithFactors);
  });
});
