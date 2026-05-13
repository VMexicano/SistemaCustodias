import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CompaniesService } from './companies.service.js';
import type { Company, CreateCompanyInput } from './companies.repository.js';

interface IdParams { id: string }
interface UserIdParams { id: string; userId: string }

interface ListQuery {
  page?: string;
  limit?: string;
  vertical_id?: string;
  active?: string;
}

interface AddUserBody {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
}

export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  async create(
    request: FastifyRequest<{ Body: CreateCompanyInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    const company = await this.companiesService.create(request.body);
    await reply.status(201).send(company);
  }

  async getAll(
    request: FastifyRequest<{ Querystring: ListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const page = parseInt(request.query.page ?? '1', 10) || 1;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);
    const active = request.query.active !== undefined ? request.query.active === 'true' : true;
    const result = await this.companiesService.getAll({
      page,
      limit,
      vertical_id: request.query.vertical_id,
      active,
    });
    await reply.status(200).send(result);
  }

  async getById(
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const company = await this.companiesService.getById(request.params.id);
    await reply.status(200).send(company);
  }

  async update(
    request: FastifyRequest<{ Params: IdParams; Body: Partial<Omit<Company, 'id' | 'created_at'>> }>,
    reply: FastifyReply,
  ): Promise<void> {
    const company = await this.companiesService.update(request.params.id, request.body);
    await reply.status(200).send(company);
  }

  async getUsers(
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const users = await this.companiesService.getUsers(request.params.id);
    await reply.status(200).send(users);
  }

  async addUser(
    request: FastifyRequest<{ Params: IdParams; Body: AddUserBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const cu = await this.companiesService.addUser(
      request.params.id,
      request.body.user_id,
      request.body.role,
    );
    await reply.status(201).send(cu);
  }

  async removeUser(
    request: FastifyRequest<{ Params: UserIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    await this.companiesService.removeUser(request.params.id, request.params.userId);
    await reply.status(204).send();
  }
}
