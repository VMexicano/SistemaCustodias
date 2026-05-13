import type { Knex } from 'knex';
import 'dotenv/config';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env['DATABASE_URL'],
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },
  test: {
    client: 'pg',
    connection: process.env['DATABASE_URL'],
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },
  production: {
    client: 'pg',
    connection: process.env['DATABASE_URL'],
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
