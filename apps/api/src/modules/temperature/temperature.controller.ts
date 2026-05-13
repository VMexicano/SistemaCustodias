import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TemperatureService } from './temperature.service.js';

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface TemperatureParams {
  id: string; // trip id
}

interface CreateTemperatureBody {
  celsius: number;
  sensor_id?: string;
  lat?: number;
  lng?: number;
}

interface GetTemperatureQuery {
  from?: string;   // ISO8601
  to?: string;     // ISO8601
  limit?: number;  // default 100
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class TemperatureController {
  constructor(private readonly temperatureService: TemperatureService) {}

  async create(
    request: FastifyRequest<{ Params: TemperatureParams; Body: CreateTemperatureBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    await this.temperatureService.createReading({
      tripId: request.params.id,
      actorUserId: request.user!.sub,
      celsius: request.body.celsius,
      sensorId: request.body.sensor_id,
      lat: request.body.lat,
      lng: request.body.lng,
    });

    await reply.status(201).send({ success: true });
  }

  async getTemperature(
    request: FastifyRequest<{ Params: TemperatureParams; Querystring: GetTemperatureQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const limit = request.query.limit
      ? Number(request.query.limit)
      : 100;

    const result = await this.temperatureService.getTemperature({
      tripId: request.params.id,
      from: request.query.from,
      to: request.query.to,
      limit,
    });

    await reply.status(200).send(result);
  }
}
