/**
 * build-integration-app.ts
 *
 * Helper that constructs a Fastify instance wired to the provided Postgres and
 * Redis connections. Used exclusively by integration tests so that each test
 * suite gets its own isolated DB / Redis from Testcontainers.
 *
 * The function mirrors the wiring in app.ts but accepts injected connections
 * instead of relying on the module-level singletons.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import knex from 'knex';
import Redis from 'ioredis';

import { BusinessError } from '../errors/business-error.js';
import { TechnicalError } from '../errors/technical-error.js';

import { JWTService } from '../../modules/auth/jwt.service.js';
import { UserAuthRepository } from '../../modules/auth/user-auth.repository.js';
import { UsersRepository } from '../../modules/users/users.repository.js';
import { AuthService } from '../../modules/auth/auth.service.js';
import { authRoutes } from '../../modules/auth/auth.routes.js';
import type { OTPChannel } from '../../modules/auth/otp/otp-channel.interface.js';

import { UsersService } from '../../modules/users/users.service.js';
import { usersRoutes } from '../../modules/users/users.routes.js';

import { PaymentMethodsRepository } from '../../modules/users/payment-methods/payment-methods.repository.js';
import { PaymentMethodsService } from '../../modules/users/payment-methods/payment-methods.service.js';
import { paymentMethodsRoutes } from '../../modules/users/payment-methods/payment-methods.routes.js';

// A minimal StripeService mock we can inject in integration tests to avoid
// needing a real Stripe key.
import type { SetupIntentResult } from '../../modules/users/payment-methods/stripe.service.js';

import { DriversRepository } from '../../modules/drivers/drivers.repository.js';
import { DocumentsRepository } from '../../modules/drivers/documents/documents.repository.js';
import { VehiclesRepository } from '../../modules/drivers/vehicles/vehicles.repository.js';
import { DriversService } from '../../modules/drivers/drivers.service.js';
import { driversRoutes } from '../../modules/drivers/drivers.routes.js';
import { AdminDocumentsService } from '../../modules/admin/documents/admin-documents.service.js';
import { adminDocumentsRoutes } from '../../modules/admin/documents/admin-documents.routes.js';
import { PricingRepository } from '../../modules/pricing/pricing.repository.js';
import { PricingEngine } from '../../modules/pricing/pricing-engine.js';
import { PricingService } from '../../modules/pricing/pricing.service.js';
import { pricingRoutes } from '../../modules/pricing/pricing.routes.js';
import { TripsRepository } from '../../modules/trips/trips.repository.js';
import { TripStateMachine } from '../../modules/trips/trip-state-machine.js';
import { TripsService } from '../../modules/trips/trips.service.js';
import { tripsRoutes } from '../../modules/trips/trips.routes.js';
import { registerTripsWorkers } from '../../modules/trips/trips.workers.js';
import { initTripsQueue, tripsQueue } from '../../modules/trips/trips.queue.js';
import { initPaymentQueue, paymentQueue } from '../../modules/payments/payment.queue.js';
import { initNotificationQueue, notificationQueue } from '../../modules/notifications/notification.queue.js';
import { VerticalsRepository } from '../../modules/verticals/verticals.repository.js';
import { VerticalsService } from '../../modules/verticals/verticals.service.js';
import { verticalsRoutes } from '../../modules/verticals/verticals.routes.js';
import { CompaniesRepository } from '../../modules/companies/companies.repository.js';
import { CompaniesService } from '../../modules/companies/companies.service.js';
import { companiesRoutes } from '../../modules/companies/companies.routes.js';
import { ConfigurationsRepository } from '../../modules/companies/configurations.repository.js';
import { ConfigurationsService } from '../../modules/companies/configurations.service.js';
import { configurationsRoutes } from '../../modules/companies/configurations.routes.js';

export interface FakeStripeService {
  createSetupIntent(): Promise<SetupIntentResult>;
}

export interface BuildIntegrationAppOptions {
  postgresUrl: string;
  redisUrl: string;
  otpChannel: OTPChannel;
  stripeService?: FakeStripeService;
}

export async function buildIntegrationApp(
  options: BuildIntegrationAppOptions,
): Promise<{ app: FastifyInstance; db: ReturnType<typeof knex>; redis: Redis; teardown: () => Promise<void> }> {
  const { postgresUrl, redisUrl, otpChannel } = options;

  // ---- Connections -------------------------------------------------------

  const db = knex({
    client: 'pg',
    connection: postgresUrl,
    pool: { min: 1, max: 5, acquireTimeoutMillis: 30000 },
    migrations: {
      directory: '../../migrations',
      extension: 'ts',
    },
  });

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // Run migrations so schema is ready.
  await db.migrate.latest({
    directory: 'migrations',
    extension: 'ts',
  });

  // Run seeds so reference data (region_config, trip_types, etc.) is available.
  await db.seed.run({
    directory: 'seeds',
    extension: 'ts',
  });

  // ---- Fastify app -------------------------------------------------------

  const app = Fastify({ logger: false });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: '*' });
  await app.register(rateLimit, { max: 1_000_000, timeWindow: '1 minute', allowList: ['127.0.0.1'] });
  await app.register(sensible);

  // Global error handler (mirrors app.ts)
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BusinessError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }

    if (error instanceof TechnicalError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, statusCode: error.statusCode },
      });
    }

    if (error.validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 422,
          details: error.validation,
        },
      });
    }

    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error', statusCode: 500 },
    });
  });

  // ---- Dependency wiring -------------------------------------------------

  const jwtService = new JWTService();
  const userAuthRepo = new UserAuthRepository(db);
  const usersRepo = new UsersRepository(db);

  const authService = new AuthService(usersRepo, redis, otpChannel, jwtService, userAuthRepo);
  await app.register(authRoutes, { prefix: '/auth', authService });

  const usersService = new UsersService(usersRepo, db);
  await app.register(usersRoutes, { prefix: '/users', usersService });

  const paymentMethodsRepo = new PaymentMethodsRepository(db);

  // Use the injected stripe service or a default mock that throws to avoid
  // real network calls during integration tests.
  const stripeService = options.stripeService ?? {
    createSetupIntent: async (): Promise<SetupIntentResult> => ({
      clientSecret: 'seti_test_secret_mock',
      setupIntentId: 'seti_test_mock',
    }),
  };

  const paymentMethodsService = new PaymentMethodsService(
    stripeService as never,
    paymentMethodsRepo,
  );
  await app.register(paymentMethodsRoutes, { prefix: '/users/me', paymentMethodsService });

  // ---- Drivers module --------------------------------------------------------

  const driversRepo = new DriversRepository(db);
  const documentsRepo = new DocumentsRepository(db);
  const vehiclesRepo = new VehiclesRepository(db);
  const driversService = new DriversService(driversRepo, documentsRepo, vehiclesRepo, usersRepo, redis, db);
  await app.register(driversRoutes, { prefix: '/drivers', driversService });

  const adminDocumentsService = new AdminDocumentsService(documentsRepo, driversRepo, db);
  await app.register(adminDocumentsRoutes, { prefix: '/admin', adminDocumentsService });

  // ---- Pricing module --------------------------------------------------------

  const pricingRepo = new PricingRepository(db);
  const pricingEngine = new PricingEngine();
  const pricingService = new PricingService(pricingRepo, pricingEngine);
  await app.register(pricingRoutes, { pricingService });

  // ---- Trips module ----------------------------------------------------------

  initTripsQueue(redis);
  initPaymentQueue(redis);
  initNotificationQueue(redis);
  const tripsRepo = new TripsRepository(db);
  const tripStateMachine = new TripStateMachine();
  const tripsService = new TripsService(tripsRepo, pricingService, pricingEngine, tripStateMachine, db, driversRepo);
  registerTripsWorkers(tripsService);
  await app.register(tripsRoutes, { prefix: '/trips', tripsService });

  // ---- Verticals module ----------------------------------------------------------

  const verticalsRepo = new VerticalsRepository(db);
  const verticalsService = new VerticalsService(verticalsRepo, redis, 'taxi');
  await app.register(verticalsRoutes, { verticalsService });

  // ---- Companies + Configurations modules ----------------------------------------

  const companiesRepo = new CompaniesRepository(db);
  const companiesService = new CompaniesService(companiesRepo);
  await app.register(companiesRoutes, { prefix: '/admin', companiesService });

  const configurationsRepo = new ConfigurationsRepository(db);
  const configurationsService = new ConfigurationsService(configurationsRepo);
  await app.register(configurationsRoutes, { prefix: '/config', configurationsService });

  async function teardown(): Promise<void> {
    await tripsQueue.clearAll();
    await paymentQueue.close();
    await notificationQueue.close();
    await app.close();
    await db.destroy();
    redis.disconnect();
  }

  return { app, db, redis, teardown };
}
