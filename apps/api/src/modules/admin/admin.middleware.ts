import type { FastifyRequest, FastifyReply } from 'fastify';

export async function adminOnly(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user;
  if (!user || !user.roles.includes('admin')) {
    await reply.code(403).send({ code: 'FORBIDDEN', message: 'Admin role required' });
  }
}
