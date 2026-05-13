# Snapshot — Módulo: pricing
> Última actualización: 2026-05-07 | Estado: ✅ Completo (Sprint 4 + Sprint 13)

## Estado
- Implementación: 100%
- Tests unitarios: 28/28 ✅ (pricing-engine.test.ts — 100% coverage) ← Sprint 13: +6 tests
- Tests integración: 6/6 ✅ (pricing.integration.test.ts — Testcontainers)
- Cobertura PricingEngine: 100% lines / 100% branches

## Archivos
```
apps/api/src/modules/pricing/
├── pricing-engine.ts       ← Clase pura: estimate(), recalculate(), haversine inline
├── pricing.types.ts        ← LatLng, PricingSnapshot, PriceEstimate, FactorApplied
├── pricing.repository.ts   ← findTripTypeById, findActiveFactors, findRegionConfig
├── pricing.service.ts      ← estimate() con validaciones
├── pricing.controller.ts
└── pricing.routes.ts       ← POST /trips/estimate
```

## Endpoints
| Método | Path | Auth |
|---|---|---|
| POST | /trips/estimate | JWT (cualquier rol) |

## Decisiones clave
- Orden de factores inamovible: fixed_amount → percentage → multiplier
- stackable=false: solo aplica el factor de mayor priority dentro del mismo tipo
- applyFactors() y calculateDistanceKm() son públicos (para 100% test coverage)
- JWT region = código de país 'MX', no UUID — service usa tripType.region_id de BD
- ADR-023: Haversine inline (sin dependencias externas de geodesia)
- ADR-009: pricing_snapshot inmutable — escrito una vez al crear el viaje

## Modelos de precio (Sprint 13 — ADR-042)

| pricingModel | Fórmula | Caso de uso |
|---|---|---|
| `per_km_min` | `base_fare + cost_per_km × km + cost_per_min × min` | Taxi (default Sprint 1–12) |
| `fixed_rate` | `base_fare` (sin variables) | Rutas fijas, mensajería |
| `per_weight_km` | `base_fare + cost_per_km × km × weight_kg` | Carga refrigerada |
| `per_declared_value` | `% sobre metadata.cargo.declared_value` | Custodia de valores |

El modelo se lee de `vertical.features.pricingModel` en `estimate()`. El switch está en `pricing-engine.ts`.

## Pendiente
- ADR-023 escritura formal en docs/13_decisions_log.md
