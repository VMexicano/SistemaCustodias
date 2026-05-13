// Global test setup
// NOTE: Environment variables are loaded in jest.env.setup.js (setupFiles),
// which runs before module imports. This file only sets non-env configuration.
process.env['NODE_ENV'] = 'test';
process.env['TEST_MODE'] = 'true';
