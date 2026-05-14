import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/environment.js';
import { db } from './config/database.js';
import { redis } from './config/redis.js';
import { BusinessError } from './shared/errors/business-error.js';
import { TechnicalError } from './shared/errors/technical-error.js';
import { JWTService } from './modules/auth/jwt.service.js';
import { UserAuthRepository } from './modules/auth/user-auth.repository.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { LogOTPChannel } from './modules/auth/otp/log-otp-channel.js';
import { FirebaseOTPChannel } from './modules/auth/otp/firebase-otp-channel.js';
import type { OTPChannel } from './modules/auth/otp/otp-channel.interface.js';
import { UsersService } from './modules/users/users.service.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { PaymentMethodsRepository } from './modules/users/payment-methods/payment-methods.repository.js';
import { StripeService } from './modules/users/payment-methods/stripe.service.js';
import { PaymentMethodsService } from './modules/users/payment-methods/payment-methods.service.js';
import { paymentMethodsRoutes } from './modules/users/payment-methods/payment-methods.routes.js';
import { DriversRepository } from './modules/drivers/drivers.repository.js';
import { DocumentsRepository } from './modules/drivers/documents/documents.repository.js';
import { VehiclesRepository } from './modules/drivers/vehicles/vehicles.repository.js';
import { DriversService } from './modules/drivers/drivers.service.js';
import { driversRoutes } from './modules/drivers/drivers.routes.js';
import { AdminDocumentsService } from './modules/admin/documents/admin-documents.service.js';
import { adminDocumentsRoutes } from './modules/admin/documents/admin-documents.routes.js';
import { AdminRepository } from './modules/admin/admin.repository.js';
import { AdminService } from './modules/admin/admin.service.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { adminTripsRoutes } from './modules/admin/admin-trips.routes.js';
import { PricingRepository } from './modules/pricing/pricing.repository.js';
import { PricingEngine } from './modules/pricing/pricing-engine.js';
import { PricingService } from './modules/pricing/pricing.service.js';
import { pricingRoutes } from './modules/pricing/pricing.routes.js';
import { TripsRepository } from './modules/trips/trips.repository.js';
import { TripStateMachine } from './modules/trips/trip-state-machine.js';
import { TripsService } from './modules/trips/trips.service.js';
import { tripsRoutes } from './modules/trips/trips.routes.js';
import { registerTripsWorkers } from './modules/trips/trips.workers.js';
import { initTripsQueue } from './modules/trips/trips.queue.js';
import { buildRealtimePlugin } from './modules/realtime/realtime.plugin.js';
import { StripePaymentGateway } from './modules/payments/stripe.payment.gateway.js';
import { PaymentRepository } from './modules/payments/payment.repository.js';
import { PaymentService } from './modules/payments/payment.service.js';
import { PaymentController } from './modules/payments/payment.controller.js';
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { initPaymentQueue, paymentQueue } from './modules/payments/payment.queue.js';
import { LogNotificationChannel } from './modules/notifications/log.notification.channel.js';
import { FCMNotificationChannel } from './modules/notifications/fcm.notification.channel.js';
import type { INotificationChannel } from './modules/notifications/notification.channel.interface.js';
import { NotificationService } from './modules/notifications/notification.service.js';
import { initNotificationQueue } from './modules/notifications/notification.queue.js';
import { SchedulerRepository } from './modules/scheduler/scheduler.repository.js';
import { SchedulerService } from './modules/scheduler/scheduler.service.js';
import { AdminConfigRepository } from './modules/admin/admin-config.repository.js';
import { AdminConfigService } from './modules/admin/admin-config.service.js';
import { adminConfigRoutes } from './modules/admin/admin-config.routes.js';
import { AdminAuthService } from './modules/admin/admin-auth.service.js';
import { adminAuthRoutes } from './modules/admin/admin-auth.routes.js';
import { ScheduledTripsRepository } from './modules/scheduled-trips/scheduled-trips.repository.js';
import { ScheduledTripsService } from './modules/scheduled-trips/scheduled-trips.service.js';
import { scheduledTripsRoutes } from './modules/scheduled-trips/scheduled-trips.routes.js';
import { TrackingService } from './modules/tracking/tracking.service.js';
import { VerticalsRepository } from './modules/verticals/verticals.repository.js';
import { VerticalsService } from './modules/verticals/verticals.service.js';
import { verticalsRoutes } from './modules/verticals/verticals.routes.js';
import { CompaniesRepository } from './modules/companies/companies.repository.js';
import { CompaniesService } from './modules/companies/companies.service.js';
import { companiesRoutes } from './modules/companies/companies.routes.js';
import { ConfigurationsRepository } from './modules/companies/configurations.repository.js';
import { ConfigurationsService } from './modules/companies/configurations.service.js';
import { configurationsRoutes } from './modules/companies/configurations.routes.js';
import { CustodyRepository } from './modules/custody/custody.repository.js';
import { CustodyService } from './modules/custody/custody.service.js';
import { custodyRoutes } from './modules/custody/custody.routes.js';
import { TemperatureRepository } from './modules/temperature/temperature.repository.js';
import { TemperatureService } from './modules/temperature/temperature.service.js';
import { temperatureRoutes } from './modules/temperature/temperature.routes.js';
import { ClientsRepository } from './modules/clients/clients.repository.js';
import { ClientsService } from './modules/clients/clients.service.js';
import { clientsRoutes } from './modules/clients/clients.routes.js';
import { OperadoresRepository } from './modules/operadores/operadores.repository.js';
import { OperadoresService } from './modules/operadores/operadores.service.js';
import { operadoresRoutes } from './modules/operadores/operadores.routes.js';
import { VehiclesRepository as CustodyVehiclesRepository } from './modules/vehicles/vehicles.repository.js';
import { VehiclesService as CustodyVehiclesService } from './modules/vehicles/vehicles.service.js';
import { vehiclesRoutes } from './modules/vehicles/vehicles.routes.js';

function parseCorsOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss Z' },
        },
      }),
    },
  });

  // Plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  const corsOrigin = env.NODE_ENV !== 'production'
    ? '*'
    : parseCorsOrigins(env.CORS_ORIGIN);
  await app.register(cors, {
    origin: Array.isArray(corsOrigin) && corsOrigin.length === 1
      ? corsOrigin[0]
      : corsOrigin,
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // In TEST_MODE skip all rate limits to allow E2E test suites to run freely
    ...(env.TEST_MODE && { skip: () => true }),
  });
  await app.register(sensible);

  // Global error handler
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
      request.log.error({ err: error.originalError }, error.message);
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: 'An unexpected error occurred',
          statusCode: error.statusCode,
        },
      });
    }

    // Validation errors from Zod/Fastify schema
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

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Dependency wiring — auth module
  // ---------------------------------------------------------------------------

  let otpChannel: OTPChannel;

  if (env.OTP_PROVIDER === 'firebase') {
    // Lazy import to avoid pulling firebase-admin into environments that don't need it
    const admin = await import('firebase-admin');
    const firebaseApp = admin.default.initializeApp({
      credential: admin.default.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    otpChannel = new FirebaseOTPChannel(firebaseApp);
  } else {
    otpChannel = new LogOTPChannel();
  }

  const jwtService = new JWTService();
  const userAuthRepo = new UserAuthRepository(db);
  const usersRepo = new UsersRepository(db);

  const authService = new AuthService(
    usersRepo,
    redis,
    otpChannel,
    jwtService,
    userAuthRepo,
    db,
  );

  await app.register(authRoutes, { prefix: '/auth', authService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — users module
  // ---------------------------------------------------------------------------

  const usersService = new UsersService(usersRepo, db);
  await app.register(usersRoutes, { prefix: '/users', usersService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — payment methods module
  // ---------------------------------------------------------------------------

  const paymentMethodsRepo = new PaymentMethodsRepository(db);
  const stripeService = new StripeService(env.STRIPE_SECRET_KEY);
  const paymentMethodsService = new PaymentMethodsService(stripeService, paymentMethodsRepo);
  await app.register(paymentMethodsRoutes, { prefix: '/users/me', paymentMethodsService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — drivers module
  // ---------------------------------------------------------------------------

  const driversRepo = new DriversRepository(db);
  const documentsRepo = new DocumentsRepository(db);
  const vehiclesRepo = new VehiclesRepository(db);
  const trackingService = new TrackingService(db, redis);
  const driversService = new DriversService(driversRepo, documentsRepo, vehiclesRepo, usersRepo, redis, db, trackingService);
  await app.register(driversRoutes, { prefix: '/drivers', driversService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — admin module
  // ---------------------------------------------------------------------------

  const adminDocumentsService = new AdminDocumentsService(documentsRepo, driversRepo, db);
  await app.register(adminDocumentsRoutes, { prefix: '/admin', adminDocumentsService });

  const adminRepo = new AdminRepository(db);
  const adminService = new AdminService(adminRepo);
  await app.register(adminRoutes, { prefix: '/admin', adminService });

  const adminConfigRepo = new AdminConfigRepository(db);
  const adminConfigService = new AdminConfigService(adminConfigRepo, db);
  await app.register(adminConfigRoutes, { prefix: '/admin', adminConfigService });

  const adminAuthService = new AdminAuthService(db, jwtService);
  await app.register(adminAuthRoutes, { prefix: '/admin', adminAuthService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — pricing module
  // ---------------------------------------------------------------------------

  const pricingRepo = new PricingRepository(db);
  const pricingEngine = new PricingEngine();
  const pricingService = new PricingService(pricingRepo, pricingEngine);
  await app.register(pricingRoutes, { pricingService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — trips module
  // ---------------------------------------------------------------------------

  initTripsQueue(redis);
  const tripsRepo = new TripsRepository(db);
  const tripStateMachine = new TripStateMachine();
  // Note: verticalsService is wired below after it is constructed.
  // TripsService accepts it as an optional 8th parameter to avoid circular deps.
  const tripsService = new TripsService(tripsRepo, pricingService, pricingEngine, tripStateMachine, db, driversRepo, trackingService);
  registerTripsWorkers(tripsService);
  await app.register(tripsRoutes, { prefix: '/trips', tripsService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — payments module (Sprint 5)
  // ---------------------------------------------------------------------------

  const paymentGateway = new StripePaymentGateway(env.STRIPE_SECRET_KEY);
  const paymentRepo = new PaymentRepository(db);
  const paymentService = new PaymentService(paymentRepo, paymentMethodsRepo, tripsRepo, paymentGateway);
  const paymentController = new PaymentController(paymentService);
  await app.register(paymentRoutes, { paymentController });

  // ---------------------------------------------------------------------------
  // Dependency wiring — notifications module (Sprint 5)
  // ---------------------------------------------------------------------------

  let notificationChannel: INotificationChannel;

  if (env.NOTIFICATION_PROVIDER === 'fcm') {
    const admin = await import('firebase-admin');
    // Re-use existing Firebase app if already initialized (shared with OTP channel)
    const firebaseApps = admin.default.apps;
    const firebaseApp = firebaseApps.length > 0
      ? firebaseApps[0]!
      : admin.default.initializeApp({
          credential: admin.default.credential.cert({
            projectId: env.FCM_PROJECT_ID,
            clientEmail: env.FCM_CLIENT_EMAIL,
            privateKey: env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
    notificationChannel = new FCMNotificationChannel(firebaseApp, db);
  } else {
    notificationChannel = new LogNotificationChannel();
  }

  const notificationService = new NotificationService(notificationChannel);

  // ---------------------------------------------------------------------------
  // BullMQ workers — payment + notification (Sprint 5)
  // ---------------------------------------------------------------------------

  initPaymentQueue(redis);
  initNotificationQueue(redis);

  // Import notificationQueue singleton (initialized above)
  const { notificationQueue } = await import('./modules/notifications/notification.queue.js');
  paymentQueue.registerWorker(paymentService, notificationQueue);
  notificationQueue.registerWorker(notificationService);

  // ---------------------------------------------------------------------------
  // Scheduler module — cron-based activation of scheduled trips (Sprint 6)
  // ---------------------------------------------------------------------------

  const schedulerRepo = new SchedulerRepository(db);
  const schedulerService = new SchedulerService(db, schedulerRepo, notificationQueue, tripStateMachine, tripsRepo);
  schedulerService.start();

  // ---------------------------------------------------------------------------
  // Dependency wiring — scheduled-trips module (SCHED-002)
  // ---------------------------------------------------------------------------

  const scheduledTripsRepo = new ScheduledTripsRepository(db);
  const scheduledTripsService = new ScheduledTripsService(db, scheduledTripsRepo, tripsRepo, pricingEngine, pricingRepo);
  await app.register(scheduledTripsRoutes, { prefix: '/trips', scheduledTripsService });

  // ---------------------------------------------------------------------------
  // Realtime module — Socket.io (must be registered after trips module)
  // ---------------------------------------------------------------------------

  await app.register(buildRealtimePlugin(jwtService, tripsRepo, redis, db));

  // ---------------------------------------------------------------------------
  // Dependency wiring — verticals module (Sprint 10 — ADR-036)
  // ---------------------------------------------------------------------------

  const verticalsRepo = new VerticalsRepository(db);
  const verticalsService = new VerticalsService(verticalsRepo, redis, env.VERTICAL_SLUG);
  // Inject verticalService into tripsService now that it's available (ADR-047)
  tripsService.setVerticalService(verticalsService);
  await app.register(verticalsRoutes, { verticalsService });
  await app.register(adminTripsRoutes, { prefix: '/admin', tripsService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — companies + configurations modules (Sprint 10 — ADR-038/039)
  // ---------------------------------------------------------------------------

  const companiesRepo = new CompaniesRepository(db);
  const companiesService = new CompaniesService(companiesRepo);
  await app.register(companiesRoutes, { prefix: '/admin', companiesService });

  const configurationsRepo = new ConfigurationsRepository(db);
  const configurationsService = new ConfigurationsService(configurationsRepo);
  await app.register(configurationsRoutes, { prefix: '/config', configurationsService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — custody module (VERT13-003)
  // ---------------------------------------------------------------------------

  const custodyRepo = new CustodyRepository(db);
  const custodyService = new CustodyService(custodyRepo, tripsRepo, driversRepo);
  await app.register(custodyRoutes, { custodyService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — temperature module (VERT13-004)
  // ---------------------------------------------------------------------------

  const temperatureRepo = new TemperatureRepository(db);
  const temperatureService = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);
  await app.register(temperatureRoutes, { prefix: '/trips', temperatureService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — clients module (Sprint 2)
  // ---------------------------------------------------------------------------

  const clientsRepo = new ClientsRepository(db);
  const clientsService = new ClientsService(clientsRepo);
  await app.register(clientsRoutes, { prefix: '/clients', clientsService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — operadores module (Sprint 2)
  // ---------------------------------------------------------------------------

  const operadoresRepo = new OperadoresRepository(db);
  const operadoresService = new OperadoresService(operadoresRepo);
  await app.register(operadoresRoutes, { prefix: '/operadores', operadoresService });

  // ---------------------------------------------------------------------------
  // Dependency wiring — custody vehicles module (Sprint 2)
  // ---------------------------------------------------------------------------

  const custodyVehiclesRepo = new CustodyVehiclesRepository(db);
  const custodyVehiclesService = new CustodyVehiclesService(custodyVehiclesRepo, operadoresRepo);
  await app.register(vehiclesRoutes, { prefix: '/vehicles', vehiclesService: custodyVehiclesService });

  // ---------------------------------------------------------------------------
  // Health check endpoint
  // ---------------------------------------------------------------------------

  app.get('/health', async (_request, _reply) => {
    let dbStatus = 'connected';
    let redisStatus = 'connected';

    try {
      await db.raw('SELECT 1');
    } catch {
      dbStatus = 'disconnected';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'disconnected';
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
    const status = isHealthy ? 'ok' : 'degraded';

    return (isHealthy ? _reply.status(200) : _reply.status(503)).send({
      status,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });

  return app;
}
