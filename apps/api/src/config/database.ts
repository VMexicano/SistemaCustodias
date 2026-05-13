import knex from 'knex';
import { env } from './environment.js';

export const db = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
  },
});

export type Database = typeof db;
