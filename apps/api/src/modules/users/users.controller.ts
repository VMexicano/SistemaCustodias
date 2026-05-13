import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UsersService } from './users.service.js';

interface UpdateMeBody {
  full_name?: string;
}

interface RegisterDeviceTokenBody {
  token: string;
  platform: 'ios' | 'android';
}

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Returns the authenticated user's profile.
   */
  async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const profile = await this.usersService.getProfile(userId);
    await reply.status(200).send(profile);
  }

  /**
   * PATCH /users/me
   * Partially updates the authenticated user's profile.
   * Currently supports: full_name.
   */
  async updateMe(
    request: FastifyRequest<{ Body: UpdateMeBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const { full_name } = request.body;

    const updated = await this.usersService.updateProfile(userId, {
      fullName: full_name,
    });

    await reply.status(200).send(updated);
  }

  /**
   * POST /users/me/device-token
   * Registers (or updates) an FCM device token for push notifications.
   */
  async registerDeviceToken(
    request: FastifyRequest<{ Body: RegisterDeviceTokenBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const { token, platform } = request.body;
    await this.usersService.registerDeviceToken(userId, token, platform);
    await reply.status(200).send({ success: true, message: 'Token registered' });
  }
}
