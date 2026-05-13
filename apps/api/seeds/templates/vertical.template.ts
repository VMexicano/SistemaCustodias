/**
 * Seed template para un nuevo vertical.
 * Copiar este archivo a apps/api/seeds/11_mi_vertical.ts y ajustar los valores.
 *
 * ORDEN DE INSERCIÓN (respetar por FKs):
 *   1. verticals
 *   2. trip_types  (FK → region, sin FK a vertical directa)
 *   3. document_requirements  (FK → region + vertical)
 *
 * Los IDs se resuelven en runtime mediante queries por slug/code — NO usar IDs hardcodeados.
 */

import type { Knex } from 'knex';

// ── Configurar aquí ──────────────────────────────────────────────────────────
const VERTICAL_SLUG = 'mi_vertical';        // único en la tabla verticals
const VERTICAL_NAME = 'Mi Vertical';
const VERTICAL_DESCRIPTION = 'Descripción del servicio';
const REGION_CODE = 'MX';                   // debe existir en region_config

// Features disponibles (boolean) y modelo de tarifa
const FEATURES = {
  scheduling: false,          // viajes programados con despacho anticipado
  multiStop: false,           // múltiples paradas por viaje
  cargoDeclaration: false,    // formulario de declaración de carga al solicitar
  chainOfCustody: false,      // registro inmutable de eventos de custodia
  temperatureLog: false,      // monitoreo de temperatura (hypertable)
  b2bAccounts: false,         // cuentas empresariales (companies)
  // Modelo de tarifa — elegir uno:
  //   per_km_min       → base_fare + cost_per_km + cost_per_minute  (taxi)
  //   fixed_rate       → base_fare fijo sin variables  (custody)
  //   per_weight_km    → base_fare + cost_per_km × weight_kg  (cold-chain)
  //   per_declared_value → porcentaje sobre declared_value del cargo
  pricingModel: 'per_km_min' as const,
};
// ── Fin configuración ────────────────────────────────────────────────────────

export async function seed(knex: Knex): Promise<void> {
  // 1. Resolver region_id en runtime
  const region = await knex('region_config').where({ country_code: REGION_CODE }).first<{ id: string }>();
  if (!region) throw new Error(`region_config con country_code='${REGION_CODE}' no existe`);
  const regionId = region.id;

  // 2. INSERT vertical
  await knex('verticals')
    .insert({
      slug: VERTICAL_SLUG,
      name: VERTICAL_NAME,
      description: VERTICAL_DESCRIPTION,
      features: JSON.stringify(FEATURES),
      config: JSON.stringify({}),   // configuración extendida opcional
      active: true,
    })
    .onConflict('slug')
    .merge(['name', 'description', 'features', 'config', 'active']);

  // Resolver id del vertical recién insertado
  const vertical = await knex('verticals').where({ slug: VERTICAL_SLUG }).first<{ id: string }>();
  if (!vertical) throw new Error(`vertical '${VERTICAL_SLUG}' no se pudo insertar`);
  const verticalId = vertical.id;

  // 3. INSERT trip_types
  //    Ajustar tarifas según el pricingModel elegido.
  await knex('trip_types')
    .insert([
      {
        region_id: regionId,
        code: `${VERTICAL_SLUG}_standard`,
        name: 'Estándar',
        base_fare: 50.00,       // tarifa base en MXN
        cost_per_km: 10.00,     // 0 si fixed_rate
        cost_per_minute: 2.00,  // 0 si fixed_rate o per_weight_km
        min_fare: 50.00,
        service_mode: 'cargo',  // 'people' | 'cargo' | 'mixed'
        // weight_capacity_kg: 500,  // descomentar si pricingModel = per_weight_km
      },
      // Agregar más tipos de viaje si el vertical lo requiere:
      // {
      //   region_id: regionId,
      //   code: `${VERTICAL_SLUG}_express`,
      //   name: 'Express',
      //   base_fare: 80.00,
      //   cost_per_km: 15.00,
      //   cost_per_minute: 3.00,
      //   min_fare: 80.00,
      //   service_mode: 'cargo',
      // },
    ])
    .onConflict(['region_id', 'code'])
    .merge(['name', 'base_fare', 'cost_per_km', 'cost_per_minute', 'min_fare', 'service_mode']);

  // 4. INSERT document_requirements con vertical_id
  //    Estos requisitos solo aplican a conductores de este vertical.
  //    NULL en vertical_id = aplica a todos los verticales.
  await knex('document_requirements')
    .insert([
      {
        region_id: regionId,
        vertical_id: verticalId,
        code: `${VERTICAL_SLUG}_license`,       // código único dentro del vertical
        name: 'Licencia específica del vertical',
        required: true,
        active: true,
      },
      // Agregar más documentos según el vertical:
      // {
      //   region_id: regionId,
      //   vertical_id: verticalId,
      //   code: `${VERTICAL_SLUG}_certification`,
      //   name: 'Certificación de manejo seguro',
      //   required: true,
      //   active: true,
      // },
    ])
    .onConflict(['region_id', 'code', 'vertical_id'])
    .ignore();

  console.log(`✓ Vertical '${VERTICAL_SLUG}' insertado (id: ${verticalId})`);
  console.log(`  trip_types: ${VERTICAL_SLUG}_standard`);
  console.log(`  document_requirements: ${VERTICAL_SLUG}_license`);
}
