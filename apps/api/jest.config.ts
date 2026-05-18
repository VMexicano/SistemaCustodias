import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // NodeNext requires .js extensions in source, but ts-jest resolves .ts files.
    // This mapper strips the .js suffix so Jest can find the .ts source files.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // setupFiles runs before the test framework AND before module imports.
  // Used to populate process.env so that environment.ts validation passes.
  setupFiles: ['<rootDir>/jest.env.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    // app.ts is the DI composition root — integration-tested via buildIntegrationApp, not unit-testable
    '!src/app.ts',
    '!src/**/__tests__/**',
    '!src/shared/test/**',
    // External service clients — real integrations, not unit-testable without mocking the SDK
    '!src/modules/auth/otp/firebase-otp-channel.ts',
    '!src/modules/users/payment-methods/stripe.service.ts',
    // Infrastructure singletons — initialized at runtime, tested implicitly via integration tests
    '!src/config/database.ts',
    '!src/config/redis.ts',
    '!src/shared/middleware/request-logger.ts',
    // Admin + Scheduler — repositories/controllers/routes are integration-tested only (Sprint 6)
    '!src/modules/admin/admin.repository.ts',
    '!src/modules/admin/admin.controller.ts',
    '!src/modules/admin/admin.routes.ts',
    '!src/modules/admin/admin.middleware.ts',
    '!src/modules/admin/admin-config.repository.ts',
    '!src/modules/admin/admin-config.controller.ts',
    '!src/modules/admin/admin-config.routes.ts',
    '!src/modules/scheduled-trips/scheduled-trips.repository.ts',
    '!src/modules/scheduled-trips/scheduled-trips.controller.ts',
    '!src/modules/scheduled-trips/scheduled-trips.routes.ts',
    '!src/modules/scheduler/scheduler.repository.ts',
    // custody-scheduler: repository uses raw SQL — integration-tested only
    '!src/modules/custody-scheduler/custody-scheduler.repository.ts',
    // compliance: repository/controller/routes are integration-tested only
    '!src/modules/compliance/compliance.repository.ts',
    '!src/modules/compliance/compliance.controller.ts',
    '!src/modules/compliance/compliance.routes.ts',
    // custody-events: repository/controller/routes are integration-tested only
    '!src/modules/custody-events/custody-events.repository.ts',
    '!src/modules/custody-events/custody-events.controller.ts',
    '!src/modules/custody-events/custody-events.routes.ts',
    // monitor-engine: infrastructure files are integration-tested only (Sprint 15)
    '!src/modules/monitor-engine/monitor-engine.repository.ts',
    '!src/modules/monitor-engine/monitor-engine.queue.ts',
    '!src/modules/monitor-engine/monitor-engine.worker.ts',
    '!src/shared/gps/mock-gps.adapter.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 75,
      branches: 70,
      functions: 75,
      statements: 75,
    },
    // Critical modules — full coverage required
    './src/modules/trips/trip-state-machine.ts': {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    },
    './src/modules/pricing/pricing-engine.ts': {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    },
    // payment.service.ts — will be added when PaymentService module is implemented

  },
  testTimeout: 60000,
  verbose: true,
  // BullMQ workers and Testcontainers Docker processes keep the event loop alive briefly
  // after afterAll completes. forceExit is safe here because teardown() explicitly closes
  // all queues, DB connections, Redis, and containers before Jest exits.
  forceExit: true,
};

export default config;
