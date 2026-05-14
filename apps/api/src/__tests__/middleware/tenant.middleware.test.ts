import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

function makeRequest(url: string, tenantId?: string): FastifyRequest {
  return {
    url,
    user: tenantId ? { sub: 'user-1', roles: ['custodio'], region: 'MX', tenant_id: tenantId } : undefined,
  } as unknown as FastifyRequest;
}

const reply = {} as FastifyReply;

describe('tenantGuard', () => {
  it('blocks /orders request when JWT has no tenant_id', async () => {
    const req = makeRequest('/orders');

    await expect(tenantGuard(req, reply)).rejects.toMatchObject({
      code: 'TENANT_REQUIRED',
    });
  });

  it('blocks /custody request when user is not authenticated', async () => {
    const req = makeRequest('/custody/orders');

    await expect(tenantGuard(req, reply)).rejects.toMatchObject({
      code: 'TENANT_REQUIRED',
    });
  });

  it('passes /orders request when JWT includes tenant_id', async () => {
    const req = makeRequest('/orders', 'tenant-abc');

    await expect(tenantGuard(req, reply)).resolves.toBeUndefined();
  });

  it('passes /auth routes without requiring tenant_id', async () => {
    const req = makeRequest('/auth/request-otp');

    await expect(tenantGuard(req, reply)).resolves.toBeUndefined();
  });

  it('passes /health route without requiring tenant_id', async () => {
    const req = makeRequest('/health');

    await expect(tenantGuard(req, reply)).resolves.toBeUndefined();
  });

  it.each(['/custody', '/orders', '/clients', '/operators'])(
    'protects route prefix %s',
    async (prefix) => {
      const req = makeRequest(prefix);

      await expect(tenantGuard(req, reply)).rejects.toMatchObject({
        code: 'TENANT_REQUIRED',
      });
    },
  );
});
