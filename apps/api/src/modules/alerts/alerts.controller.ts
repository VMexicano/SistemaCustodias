// ---------------------------------------------------------------------------
// alerts.controller.ts — thin HTTP adapter for the alerts module
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AlertEngine } from './alert-engine.js';
import type { AlertsRepository } from './alerts.repository.js';
import type { CreateAlertPayload, AlertType, AlertsFilter, Severity } from './alerts.types.js';
import type { JWTPayload } from '../../shared/middleware/authenticate.js';
import { BusinessError } from '../../shared/errors/business-error.js';

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface CreateAlertBody {
  order_id: string;
  alert_type: AlertType;
  lat?: number;
  lng?: number;
  description?: string;
}

interface AlertIdParam {
  id: string;
}

interface OrderIdParam {
  orderId: string;
}

interface AlertsQuerystring {
  order_id?: string;
  operator_id?: string;
  alert_type?: AlertType;
  severity?: Severity;
  resolved?: boolean;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AlertsController {
  constructor(
    private readonly alertEngine: AlertEngine,
    private readonly repo: AlertsRepository,
    private readonly db: import('knex').Knex,
  ) {}

  // -------------------------------------------------------------------------
  // createAlert
  // -------------------------------------------------------------------------

  async createAlert(
    request: FastifyRequest<{ Body: CreateAlertBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = (request.user as JWTPayload).sub;

    // Resolve operator from user_id
    const opRow = await this.db.raw<{ rows: Array<{ id: string }> }>(
      `SELECT id FROM operators WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    const operator = opRow.rows[0];
    if (!operator) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Caller has no operator profile');
    }

    const payload: CreateAlertPayload = {
      order_id: request.body.order_id,
      alert_type: request.body.alert_type,
      description: request.body.description,
    };

    if (request.body.lat !== undefined && request.body.lng !== undefined) {
      payload.location = { lat: request.body.lat, lng: request.body.lng };
    }

    const alert = await this.alertEngine.createAlert(payload, userId, operator.id);
    await reply.status(201).send(alert);
  }

  // -------------------------------------------------------------------------
  // getAlerts
  // -------------------------------------------------------------------------

  async getAlerts(
    request: FastifyRequest<{ Querystring: AlertsQuerystring }>,
    reply: FastifyReply,
  ): Promise<void> {
    const filters: AlertsFilter = {};
    if (request.query.order_id) filters.order_id = request.query.order_id;
    if (request.query.operator_id) filters.operator_id = request.query.operator_id;
    if (request.query.alert_type) filters.alert_type = request.query.alert_type;
    if (request.query.severity) filters.severity = request.query.severity;
    if (request.query.resolved !== undefined) filters.resolved = request.query.resolved;

    const alerts = await this.repo.findAll(filters);
    await reply.status(200).send({ data: alerts, count: alerts.length });
  }

  // -------------------------------------------------------------------------
  // getAlertById
  // -------------------------------------------------------------------------

  async getAlertById(
    request: FastifyRequest<{ Params: AlertIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const alert = await this.repo.findById(request.params.id);
    if (!alert) {
      throw new BusinessError('ALERT_NOT_FOUND', 'Alert not found');
    }
    await reply.status(200).send(alert);
  }

  // -------------------------------------------------------------------------
  // resolveAlert
  // -------------------------------------------------------------------------

  async resolveAlert(
    request: FastifyRequest<{ Params: AlertIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const jwtPayload = request.user as JWTPayload;
    const userId = jwtPayload.sub;
    // roles is an array; pick the first (most privileged) role for enforcement
    const role = jwtPayload.roles[0] ?? 'unknown';

    const alert = await this.alertEngine.resolveAlert(request.params.id, userId, role);
    await reply.status(200).send(alert);
  }

  // -------------------------------------------------------------------------
  // getOrderAlerts
  // -------------------------------------------------------------------------

  async getOrderAlerts(
    request: FastifyRequest<{ Params: OrderIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const alerts = await this.repo.findByOrderId(request.params.orderId);
    await reply.status(200).send({ data: alerts, count: alerts.length });
  }
}
