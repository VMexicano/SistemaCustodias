import type { LatLng, PricingSnapshot, PriceEstimate, FactorApplied, PricingModel } from './pricing.types.js';

// ---------------------------------------------------------------------------
// Types used internally to represent DB rows passed in from the service
// ---------------------------------------------------------------------------

export interface TripTypeRow {
  id: string;
  region_id: string;
  base_fare: number;
  cost_per_km: number;
  cost_per_minute: number;
  min_fare: number;
}

export interface PricingFactorRow {
  id: string;
  code: string;
  type: 'fixed_amount' | 'percentage' | 'multiplier';
  value: number;
  priority: number;
  stackable: boolean;
}

interface FactorResult {
  factorApplied: FactorApplied;
  subtotal: number;
}

// ---------------------------------------------------------------------------
// PricingEngine — pure class, no DB dependencies
// ---------------------------------------------------------------------------

export class PricingEngine {
  /**
   * Calculate a full price estimate from raw DB rows.
   */
  estimate(params: {
    origin: LatLng;
    destination: LatLng;
    tripType: TripTypeRow;
    activeFactors: PricingFactorRow[];
    regionTaxPct: number;
    pricingModel?: PricingModel;
    weightKg?: number;
  }): PriceEstimate {
    const { origin, destination, tripType, activeFactors, regionTaxPct, pricingModel, weightKg } = params;

    const distanceKm = this.calculateDistanceKm(origin, destination);

    // Snapshot is always built from the trip type (immutable once created)
    const snapshot: PricingSnapshot = {
      trip_type_id: tripType.id,
      base_fare: Number(tripType.base_fare),
      cost_per_km: Number(tripType.cost_per_km),
      cost_per_minute: Number(tripType.cost_per_minute),
      min_fare: Number(tripType.min_fare),
      factors: activeFactors.map((f) => ({
        id: f.id,
        code: f.code,
        type: f.type,
        value: Number(f.value),
        priority: f.priority,
        stackable: f.stackable,
      })),
      region_id: tripType.region_id,
      tax_pct: regionTaxPct,
      captured_at: new Date().toISOString(),
    };

    // --- fixed_rate: flat fare, no distance/time calculation, no factors ---
    if (pricingModel === 'fixed_rate') {
      const fare = Math.max(Number(tripType.base_fare), Number(tripType.min_fare));
      return {
        estimated_distance_km: distanceKm,
        estimated_duration_min: 0,
        base_fare: Number(tripType.base_fare),
        factors_applied: [],
        subtotal: fare,
        tax_amount: 0,
        final_fare: fare,
        currency: 'MXN',
        pricing_snapshot: snapshot,
        pricing_model: 'fixed_rate',
      };
    }

    // --- per_weight_km: fare = weight * base_fare + distance * cost_per_km ---
    if (pricingModel === 'per_weight_km') {
      const weight = Math.max(weightKg ?? 1, 1); // minimum 1 kg
      const rawFare = weight * Number(tripType.base_fare) + distanceKm * Number(tripType.cost_per_km);
      const fare = Math.max(rawFare, Number(tripType.min_fare));
      return {
        estimated_distance_km: distanceKm,
        estimated_duration_min: 0,
        base_fare: Number(tripType.base_fare),
        factors_applied: [],
        subtotal: fare,
        tax_amount: 0,
        final_fare: fare,
        currency: 'MXN',
        pricing_snapshot: snapshot,
        pricing_model: 'per_weight_km',
        weight_kg: weight,
      };
    }

    // --- default: per_km_min (existing behavior, unchanged) ---
    const durationMin = (distanceKm / 30) * 60;

    const baseCalc =
      Number(tripType.base_fare) +
      Number(tripType.cost_per_km) * distanceKm +
      Number(tripType.cost_per_minute) * durationMin;

    const { factorsApplied, subtotal: subtotalBeforeMin } = this.applyFactors(baseCalc, activeFactors);

    const subtotal = Math.max(subtotalBeforeMin, Number(tripType.min_fare));
    const taxAmount = subtotal * regionTaxPct;
    const finalFare = subtotal + taxAmount;

    return {
      estimated_distance_km: distanceKm,
      estimated_duration_min: durationMin,
      base_fare: Number(tripType.base_fare),
      factors_applied: factorsApplied,
      subtotal,
      tax_amount: taxAmount,
      final_fare: finalFare,
      currency: 'MXN',
      pricing_snapshot: snapshot,
      pricing_model: 'per_km_min',
    };
  }

  /**
   * Recalculate using an existing snapshot (no DB access needed).
   */
  recalculate(params: {
    newDestination: LatLng;
    currentOrigin: LatLng;
    snapshot: PricingSnapshot;
    regionTaxPct: number;
  }): PriceEstimate {
    const { newDestination, currentOrigin, snapshot, regionTaxPct } = params;

    const distanceKm = this.calculateDistanceKm(currentOrigin, newDestination);
    const durationMin = (distanceKm / 30) * 60;

    const baseCalc =
      snapshot.base_fare +
      snapshot.cost_per_km * distanceKm +
      snapshot.cost_per_minute * durationMin;

    // Reconstruct factor rows from snapshot
    const factorRows: PricingFactorRow[] = snapshot.factors.map((f) => ({
      id: f.id,
      code: f.code,
      type: f.type,
      value: f.value,
      priority: f.priority,
      stackable: f.stackable,
    }));

    const { factorsApplied, subtotal: subtotalBeforeMin } = this.applyFactors(baseCalc, factorRows);

    const subtotal = Math.max(subtotalBeforeMin, snapshot.min_fare);
    const taxAmount = subtotal * regionTaxPct;
    const finalFare = subtotal + taxAmount;

    // Do NOT modify the original snapshot — return it as-is
    return {
      estimated_distance_km: distanceKm,
      estimated_duration_min: durationMin,
      base_fare: snapshot.base_fare,
      factors_applied: factorsApplied,
      subtotal,
      tax_amount: taxAmount,
      final_fare: finalFare,
      currency: 'MXN',
      pricing_snapshot: snapshot,
    };
  }

  /**
   * Haversine formula — inline, no external libraries (ADR-023).
   */
  calculateDistanceKm(a: LatLng, b: LatLng): number {
    const R = 6371; // km
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /**
   * Apply pricing factors in fixed order: fixed_amount → percentage → multiplier.
   * For stackable=false factors: only the first one (lowest index, highest priority)
   * within each type is applied.
   */
  applyFactors(
    base: number,
    factors: PricingFactorRow[],
  ): { factorsApplied: FactorApplied[]; subtotal: number } {
    const factorsApplied: FactorApplied[] = [];
    let accumulated = base;

    // Sort by type order, then priority (ascending = higher priority)
    const typeOrder: Record<string, number> = {
      fixed_amount: 0,
      percentage: 1,
      multiplier: 2,
    };

    const sorted = [...factors].sort((a, b) => {
      const typeDiff = typeOrder[a.type]! - typeOrder[b.type]!;
      if (typeDiff !== 0) return typeDiff;
      return a.priority - b.priority;
    });

    // Track which non-stackable types have already been applied
    const appliedNonStackableTypes = new Set<string>();

    for (const factor of sorted) {
      // Skip non-stackable factors if we already applied one of that type
      if (!factor.stackable) {
        if (appliedNonStackableTypes.has(factor.type)) {
          continue;
        }
        appliedNonStackableTypes.add(factor.type);
      }

      const value = Number(factor.value);
      let impact = 0;

      if (factor.type === 'fixed_amount') {
        impact = value;
        accumulated += impact;
      } else if (factor.type === 'percentage') {
        impact = accumulated * value;
        accumulated += impact;
      } else if (factor.type === 'multiplier') {
        const newAccumulated = accumulated * value;
        impact = newAccumulated - accumulated;
        accumulated = newAccumulated;
      }

      factorsApplied.push({
        code: factor.code,
        type: factor.type,
        value,
        impact_amount: impact,
      });
    }

    return { factorsApplied, subtotal: accumulated };
  }
}
