import type { Knex } from 'knex';

/**
 * Seed 11 — Enable requiresApproval for custody and cold-chain verticals.
 * Idempotent: uses JSONB merge operator (||), so re-running has no additional effect.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex('verticals')
    .whereIn('slug', ['custody', 'cold-chain'])
    .update({
      features: knex.raw('features || ?::jsonb', [JSON.stringify({ requiresApproval: true })]),
      updated_at: new Date(),
    });
}
