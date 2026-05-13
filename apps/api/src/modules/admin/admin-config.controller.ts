import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdminConfigService } from './admin-config.service.js';

// ---------------------------------------------------------------------------
// Params / Body types
// ---------------------------------------------------------------------------

interface IdParams {
  id: string;
}

interface UpdateFactorBody {
  active?: boolean;
  value?: number;
}

interface UpdateCommissionBody {
  platformFeePct: number;
}

interface CreateTripTypeBody {
  code: string;
  name: string;
  description: string;
  baseFare: number;
  costPerKm: number;
  costPerMin: number;
  minFare: number;
  serviceMode?: string;
}

interface UpdateTripTypeBody {
  name?: string;
  description?: string;
  baseFare?: number;
  costPerKm?: number;
  costPerMin?: number;
  minFare?: number;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AdminConfigController {
  constructor(private readonly adminConfigService: AdminConfigService) {}

  // Pricing factors

  async getFactors(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const factors = await this.adminConfigService.getFactors();
    await reply.status(200).send(factors);
  }

  async updateFactor(
    request: FastifyRequest<{ Params: IdParams; Body: UpdateFactorBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.user!.sub;
    const { id } = request.params;
    const updated = await this.adminConfigService.updateFactor(id, request.body, actorId);
    await reply.status(200).send(updated);
  }

  // Commissions

  async getCommissions(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const commissions = await this.adminConfigService.getCommissions();
    await reply.status(200).send(commissions);
  }

  async updateCommission(
    request: FastifyRequest<{ Params: IdParams; Body: UpdateCommissionBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.user!.sub;
    const { id } = request.params;
    const updated = await this.adminConfigService.updateCommission(id, request.body, actorId);
    await reply.status(200).send(updated);
  }

  // Trip types

  async getTripTypes(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const types = await this.adminConfigService.getTripTypes();
    await reply.status(200).send(types);
  }

  async createTripType(
    request: FastifyRequest<{ Body: CreateTripTypeBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.user!.sub;
    const created = await this.adminConfigService.createTripType(request.body, actorId);
    await reply.status(201).send(created);
  }

  async updateTripType(
    request: FastifyRequest<{ Params: IdParams; Body: UpdateTripTypeBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.user!.sub;
    const { id } = request.params;
    const updated = await this.adminConfigService.updateTripType(id, request.body, actorId);
    await reply.status(200).send(updated);
  }
}
