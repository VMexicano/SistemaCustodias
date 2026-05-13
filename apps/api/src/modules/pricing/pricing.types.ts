export interface LatLng {
  lat: number;
  lng: number;
}

export interface PricingSnapshot {
  trip_type_id: string;
  base_fare: number;
  cost_per_km: number;
  cost_per_minute: number;
  min_fare: number;
  factors: Array<{
    id: string;
    code: string;
    type: 'fixed_amount' | 'percentage' | 'multiplier';
    value: number;
    priority: number;
    stackable: boolean;
  }>;
  region_id: string;
  tax_pct: number;
  captured_at: string;
}

export interface FactorApplied {
  code: string;
  type: 'fixed_amount' | 'percentage' | 'multiplier';
  value: number;
  impact_amount: number;
}

export type PricingModel = 'per_km_min' | 'fixed_rate' | 'per_weight_km';

export interface PriceEstimate {
  estimated_distance_km: number;
  estimated_duration_min: number;
  base_fare: number;
  factors_applied: FactorApplied[];
  subtotal: number;
  tax_amount: number;
  final_fare: number;
  currency: 'MXN';
  pricing_snapshot: PricingSnapshot;
  pricing_model?: PricingModel;
  weight_kg?: number;
}

export interface EstimateInput {
  origin: LatLng;
  destination: LatLng;
  trip_type_id: string;
  pricingModel?: PricingModel;
  weightKg?: number;
}
