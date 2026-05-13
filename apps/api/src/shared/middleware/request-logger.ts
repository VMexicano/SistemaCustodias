import type { FastifyRequest, FastifyReply } from 'fastify';

export function requestLogger(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void,
): void {
  request.log.info({
    method: request.method,
    url: request.url,
    user_id: request.user?.sub ?? null,
  });
  done();
}
