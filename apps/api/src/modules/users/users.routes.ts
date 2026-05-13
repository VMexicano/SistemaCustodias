import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

// ---------------------------------------------------------------------------
// JSON schemas
// ---------------------------------------------------------------------------

const updateMeSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      full_name: {
        type: 'string',
        minLength: 2,
        maxLength: 100,
      },
    },
  },
};

const deviceTokenSchema = {
  body: {
    type: 'object',
    required: ['token', 'platform'],
    additionalProperties: false,
    properties: {
      token: { type: 'string', minLength: 1 },
      platform: { type: 'string', enum: ['ios', 'android'] },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface UsersRoutesOptions extends FastifyPluginOptions {
  usersService: UsersService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function usersRoutes(
  app: FastifyInstance,
  options: UsersRoutesOptions,
): Promise<void> {
  const controller = new UsersController(options.usersService);

  /**
   * GET /users/me
   * Returns the authenticated user's profile.
   */
  app.get('/me', {
    preHandler: authenticate,
    handler: controller.getMe.bind(controller),
  });

  /**
   * PATCH /users/me
   * Partially updates the authenticated user's mutable profile fields.
   */
  app.patch('/me', {
    schema: updateMeSchema,
    preHandler: authenticate,
    handler: controller.updateMe.bind(controller) as RouteHandlerMethod,
  });

  /**
   * POST /users/me/device-token
   * Registers or updates an FCM device token for push notifications (Sprint 7).
   */
  app.post('/me/device-token', {
    schema: deviceTokenSchema,
    preHandler: authenticate,
    handler: controller.registerDeviceToken.bind(controller) as RouteHandlerMethod,
  });
}
