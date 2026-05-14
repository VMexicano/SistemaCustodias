import type { FastifyRequest, FastifyReply } from 'fastify';
import { BusinessError } from '../errors/business-error.js';

// Routes under these prefixes require a valid tenant_id in the JWT.
const TENANT_PROTECTED_PREFIXES = ['/custody', '/orders', '/clients', '/operators'];

function requiresTenant(url: string): boolean {
  return TENANT_PROTECTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export async function tenantGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!requiresTenant(request.url)) return;

  if (!request.user?.tenant_id) {
    throw new BusinessError('TENANT_REQUIRED', 'This endpoint requires a tenant context in the JWT');
  }
}
