import type { FastifyRequest, FastifyReply } from 'fastify';
import { BusinessError } from '../errors/business-error.js';

export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new BusinessError('UNAUTHORIZED');
    }
    const hasRole = roles.some((role) => request.user!.roles.includes(role));
    if (!hasRole) {
      throw new BusinessError('FORBIDDEN', `Required role: ${roles.join(' or ')}`);
    }
  };
}
