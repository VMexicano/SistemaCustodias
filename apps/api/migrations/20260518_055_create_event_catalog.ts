import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('event_catalog', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('vertical_slug', 50)
      .notNullable()
      .references('slug')
      .inTable('custody_types')
      .onDelete('RESTRICT');
    t.string('code', 50).notNullable();
    t.string('label', 100).notNullable();
    t.boolean('requires_photo').notNullable().defaultTo(false);
    t.boolean('requires_audio').notNullable().defaultTo(false);
    t.boolean('requires_signature').notNullable().defaultTo(false);
    t.jsonb('payload_schema').notNullable();
    t.integer('interval_minutes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['vertical_slug', 'code'], { indexName: 'event_catalog_vertical_code_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_catalog');
}
