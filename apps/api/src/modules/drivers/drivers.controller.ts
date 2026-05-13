import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DriversService } from './drivers.service.js';

interface RegisterDriverBody {
  licenseNumber: string;
  licenseExpiry: string;
  serviceModes: ('people' | 'cargo' | 'mixed')[];
}

interface UpdateDriverBody {
  licenseNumber?: string;
  licenseExpiry?: string;
  serviceModes?: ('people' | 'cargo' | 'mixed')[];
}

interface SubmitDocumentBody {
  requirementId: string;
  fileUrl: string;
  expiresAt?: string;
}

interface RegisterVehicleBody {
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
}

interface LocationBody {
  latitude: number;
  longitude: number;
}

export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  async register(
    request: FastifyRequest<{ Body: RegisterDriverBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const { licenseNumber, licenseExpiry, serviceModes } = request.body;
    const driver = await this.driversService.register(userId, {
      licenseNumber,
      licenseExpiry: new Date(licenseExpiry),
      serviceModes,
    });
    await reply.status(201).send({ driver });
  }

  async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const driver = await this.driversService.getProfile(userId);
    await reply.status(200).send(driver);
  }

  async updateMe(
    request: FastifyRequest<{ Body: UpdateDriverBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const { licenseNumber, licenseExpiry, serviceModes } = request.body;
    const driver = await this.driversService.updateProfile(userId, {
      licenseNumber,
      licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : undefined,
      serviceModes,
    });
    await reply.status(200).send(driver);
  }

  async getDocuments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const docs = await this.driversService.getDocuments(userId);
    await reply.status(200).send(docs);
  }

  async submitDocument(
    request: FastifyRequest<{ Body: SubmitDocumentBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const { requirementId, fileUrl, expiresAt } = request.body;
    const doc = await this.driversService.submitDocument(userId, {
      requirementId,
      fileUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    await reply.status(201).send(doc);
  }

  async getVehicles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const vehicles = await this.driversService.getVehicles(userId);
    await reply.status(200).send(vehicles);
  }

  async registerVehicle(
    request: FastifyRequest<{ Body: RegisterVehicleBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const vehicle = await this.driversService.registerVehicle(userId, request.body);
    await reply.status(201).send(vehicle);
  }

  async goOnline(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const result = await this.driversService.goOnline(userId);
    await reply.status(200).send(result);
  }

  async goOffline(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const result = await this.driversService.goOffline(userId);
    await reply.status(200).send(result);
  }

  async updateLocation(
    request: FastifyRequest<{ Body: LocationBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    await this.driversService.updateLocation(userId, request.body);
    await reply.status(200).send({ updated: true });
  }
}
