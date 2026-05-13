import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from './auth.service.js';

interface RegisterBody {
  phone: string;
  fullName: string;
}

interface VerifyPhoneBody {
  phone: string;
  otp: string;
}

interface LoginBody {
  phone: string;
}

interface RefreshBody {
  refreshToken: string;
}

/**
 * AuthController — thin HTTP adapter layer.
 *
 * Extracts request data, delegates to AuthService, and maps results to
 * HTTP responses. Contains zero business logic.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(
    request: FastifyRequest<{ Body: RegisterBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { phone, fullName } = request.body;
    const result = await this.authService.register(phone, fullName);
    await reply.status(201).send(result);
  }

  async verifyPhone(
    request: FastifyRequest<{ Body: VerifyPhoneBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { phone, otp } = request.body;
    const result = await this.authService.verifyPhone(phone, otp);
    await reply.status(200).send(result);
  }

  async login(
    request: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { phone } = request.body;
    const result = await this.authService.login(phone);
    await reply.status(200).send(result);
  }

  async refresh(
    request: FastifyRequest<{ Body: RefreshBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { refreshToken } = request.body;
    const result = await this.authService.refresh(refreshToken);
    await reply.status(200).send(result);
  }
}
