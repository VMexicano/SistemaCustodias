import { z } from 'zod';
import 'dotenv/config';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3333),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    TRIP_SEARCHING_TIMEOUT_MS: z.coerce.number().int().min(10000).default(300000),
    APP_URL: z.string().url().default('http://localhost:3333'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3002'),
    TEST_MODE: z.coerce.boolean().default(false),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    // OTP delivery provider
    OTP_PROVIDER: z.enum(['log', 'firebase']).default('log'),
    // Firebase Admin SDK credentials (required when OTP_PROVIDER=firebase)
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    // Stripe (required — used in Sprint 2 AUTH-004+)
    STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
    // Vertical slug — determines which vertical config is served by GET /config
    VERTICAL_SLUG: z.string().min(1).default('taxi'),
    // Notification delivery provider (Sprint 5 — ADR-028)
    NOTIFICATION_PROVIDER: z.enum(['log', 'fcm']).default('log'),
    // Firebase Admin SDK credentials (required when NOTIFICATION_PROVIDER=fcm)
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),
  })
  .refine(
    (data) =>
      data.OTP_PROVIDER !== 'firebase' ||
      (!!data.FIREBASE_PROJECT_ID && !!data.FIREBASE_CLIENT_EMAIL && !!data.FIREBASE_PRIVATE_KEY),
    {
      message:
        'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required when OTP_PROVIDER=firebase',
      path: ['FIREBASE_PROJECT_ID'],
    },
  )
  .refine(
    (data) =>
      data.NOTIFICATION_PROVIDER !== 'fcm' ||
      (!!data.FCM_PROJECT_ID && !!data.FCM_CLIENT_EMAIL && !!data.FCM_PRIVATE_KEY),
    {
      message:
        'FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY are required when NOTIFICATION_PROVIDER=fcm',
      path: ['FCM_PROJECT_ID'],
    },
  );

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues
    .map((i) => `  ❌ ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`\nEnvironment validation failed:\n${missing}\n`);
  console.error('Check your .env file against apps/api/.env.example\n');
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
