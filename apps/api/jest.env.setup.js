/**
 * jest.env.setup.js
 *
 * Loaded via `setupFiles` (before the test framework and before modules are imported).
 * Sets required environment variables so that environment.ts validation passes
 * without needing a live database or Stripe account during unit tests.
 *
 * Uses plain require/CommonJS because setupFiles run in a context where
 * ESM transforms may not yet be available.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env.test — this file contains deterministic test values.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Fallback values in case .env.test is missing or incomplete.
const defaults = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://uber_test:uber_test@localhost:5432/uber_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-minimum-32-characters-long-for-testing',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-long-test',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',
  APP_URL: 'http://localhost:3333',
  CORS_ORIGIN: 'http://localhost:3000',
  TEST_MODE: 'true',
  LOG_LEVEL: 'error',
  OTP_PROVIDER: 'log',
  STRIPE_SECRET_KEY: 'sk_test_placeholder_for_unit_tests_only',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
