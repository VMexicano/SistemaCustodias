import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { env } from '../../config/environment.js';

// E.164 phone pattern: +<country_code><subscriber_number>
const E164_PATTERN = '^\\+[1-9]\\d{1,14}$';

// ---------------------------------------------------------------------------
// Inline JSON schemas (Fastify native validation — no extra deps needed)
// ---------------------------------------------------------------------------

const phoneProperty = {
  type: 'string',
  pattern: E164_PATTERN,
  description: 'Phone number in E.164 format (e.g. +525512345678)',
};

const registerSchema = {
  body: {
    type: 'object',
    required: ['phone', 'fullName'],
    additionalProperties: false,
    properties: {
      phone: phoneProperty,
      fullName: {
        type: 'string',
        minLength: 2,
        maxLength: 120,
      },
    },
  },
};

const verifyPhoneSchema = {
  body: {
    type: 'object',
    required: ['phone', 'otp'],
    additionalProperties: false,
    properties: {
      phone: phoneProperty,
      otp: {
        type: 'string',
        pattern: '^\\d{6}$',
        description: '6-digit OTP code',
      },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['phone'],
    additionalProperties: false,
    properties: {
      phone: phoneProperty,
    },
  },
};

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: {
        type: 'string',
        minLength: 1,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface AuthRoutesOptions extends FastifyPluginOptions {
  authService: AuthService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const controller = new AuthController(options.authService);

  /**
   * POST /auth/register
   * Rate limit: 5 requests per 15 minutes per IP
   */
  app.post('/register', {
    schema: registerSchema,
    config: {
      rateLimit: env.TEST_MODE ? { max: 10_000, timeWindow: '1 minute' } : {
        max: 5,
        timeWindow: 15 * 60 * 1000,
      },
    },
    handler: controller.register.bind(controller),
  });

  /**
   * POST /auth/verify-phone
   * Rate limit: 3 requests per 10 minutes, keyed by phone from body
   */
  app.post('/verify-phone', {
    schema: verifyPhoneSchema,
    config: {
      rateLimit: env.TEST_MODE ? { max: 10_000, timeWindow: '1 minute' } : {
        max: 3,
        timeWindow: 10 * 60 * 1000,
        keyGenerator(request) {
          const body = request.body as { phone?: string } | null;
          return body?.phone ?? request.ip;
        },
      },
    },
    handler: controller.verifyPhone.bind(controller),
  });

  /**
   * POST /auth/login
   * Rate limit: 5 requests per 15 minutes per IP
   */
  app.post('/login', {
    schema: loginSchema,
    config: {
      rateLimit: env.TEST_MODE ? { max: 10_000, timeWindow: '1 minute' } : {
        max: 5,
        timeWindow: 15 * 60 * 1000,
      },
    },
    handler: controller.login.bind(controller),
  });

  /**
   * POST /auth/refresh
   * No per-route rate limit — uses the global 100 req/min limit.
   */
  app.post('/refresh', {
    schema: refreshSchema,
    handler: controller.refresh.bind(controller),
  });
}
