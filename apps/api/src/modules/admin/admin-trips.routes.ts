import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import type { TripsService } from '../trips/trips.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const pendingApprovalSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface AdminTripsRoutesOptions extends FastifyPluginOptions {
  tripsService: TripsService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function adminTripsRoutes(
  app: FastifyInstance,
  options: AdminTripsRoutesOptions,
): Promise<void> {
  const { tripsService } = options;

  // GET /admin/trips/pending-approval
  app.get<{ Querystring: { limit?: number; offset?: number } }>(
    '/trips/pending-approval',
    {
      schema: pendingApprovalSchema,
      preHandler: [authenticate, authorize('admin')],
    },
    async (
      request: FastifyRequest<{ Querystring: { limit?: number; offset?: number } }>,
      reply: FastifyReply,
    ) => {
      const limit = Math.min(Number(request.query.limit ?? 20), 100);
      const offset = Number(request.query.offset ?? 0);

      const { data, total } = await tripsService.getPendingApproval(limit, offset);

      await reply.status(200).send({
        data: data.map((trip) => ({
          id: trip.id,
          passenger_id: trip.passenger_id,
          passenger_phone: trip.passenger_phone,
          origin_address: trip.origin_address,
          destination_address: trip.destination_address,
          estimated_fare: trip.estimated_fare,
          metadata: trip.metadata,
          created_at: trip.created_at.toISOString(),
          wait_minutes: Math.round(trip.wait_minutes),
        })),
        total,
        limit,
        offset,
      });
    },
  );
}
