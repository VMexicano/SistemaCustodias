import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { AdminAuthService } from './admin-auth.service.js';

interface LoginBody {
  username: string;
  password: string;
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 1 },
    },
  },
};

export interface AdminAuthRoutesOptions extends FastifyPluginOptions {
  adminAuthService: AdminAuthService;
}

export async function adminAuthRoutes(
  app: FastifyInstance,
  options: AdminAuthRoutesOptions,
): Promise<void> {
  const { adminAuthService } = options;

  app.post(
    '/auth/login',
    { schema: loginSchema },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { username, password } = request.body;
      const result = await adminAuthService.login(username, password);
      await reply.status(200).send(result);
    },
  );
}
