import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdminService } from './admin.service.js';

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface AdminListQuery {
  status?: string;
  page?: string;
  limit?: string;
}

interface AdminErrorsQuery {
  resolved?: string;
}

interface ErrorIdParams {
  id: string;
}

interface DriverIdParams {
  id: string;
}

interface UpdateDriverStatusBody {
  status: string;
}

interface UserSearchQuery {
  phone?: string;
}

// ---------------------------------------------------------------------------
// AdminController
// ---------------------------------------------------------------------------

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // GET /admin/stats
  async getStats(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const stats = await this.adminService.getStats();
    await reply.status(200).send({
      activeTrips: stats.active_trips,
      onlineDrivers: stats.online_drivers,
      todayRevenueMXN: stats.today_revenue,
      pendingErrors: stats.pending_errors,
    });
  }

  // GET /admin/trips?status=&page=&limit=
  async getTrips(
    request: FastifyRequest<{ Querystring: AdminListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { status } = request.query;
    const page = parseInt(request.query.page ?? '1', 10) || 1;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);

    const result = await this.adminService.getTrips({ status, page, limit });
    await reply.status(200).send(result);
  }

  // GET /admin/drivers?status=&page=&limit=
  async getDrivers(
    request: FastifyRequest<{ Querystring: AdminListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { status } = request.query;
    const page = parseInt(request.query.page ?? '1', 10) || 1;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);

    const result = await this.adminService.getDrivers({ status, page, limit });
    await reply.status(200).send(result);
  }

  // GET /admin/errors?resolved=false
  async getErrors(
    request: FastifyRequest<{ Querystring: AdminErrorsQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const resolved = request.query.resolved === 'true';
    const errors = await this.adminService.getErrors(resolved);
    await reply.status(200).send(errors);
  }

  // PATCH /admin/errors/:id/resolve
  async resolveError(
    request: FastifyRequest<{ Params: ErrorIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = request.params;
    const updated = await this.adminService.resolveError(id);
    await reply.status(200).send(updated);
  }

  // GET /admin/users?page=&limit=
  async getUsers(
    request: FastifyRequest<{ Querystring: AdminListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const page = parseInt(request.query.page ?? '1', 10) || 1;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);
    const result = await this.adminService.getUsers({ page, limit });
    await reply.status(200).send(result);
  }

  // GET /admin/users/search?phone=
  async searchUsers(
    request: FastifyRequest<{ Querystring: UserSearchQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const phone = request.query.phone ?? '';
    const users = await this.adminService.searchUserByPhone(phone);
    await reply.status(200).send({ data: users });
  }

  // PATCH /admin/drivers/:id/status
  async updateDriverStatus(
    request: FastifyRequest<{ Params: DriverIdParams; Body: UpdateDriverStatusBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = request.params;
    const { status } = request.body;
    await this.adminService.updateDriverStatus(id, status);
    await reply.status(200).send({ ok: true });
  }
}
