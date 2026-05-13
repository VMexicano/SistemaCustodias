import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../config/environment.js';
import { BusinessError } from '../errors/business-error.js';

export interface JWTPayload {
  sub: string;
  roles: string[];
  region: string;
  jti?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new BusinessError('UNAUTHORIZED', 'Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    request.user = payload;
  } catch {
    throw new BusinessError('TOKEN_INVALID', 'Invalid or expired access token');
  }
}
