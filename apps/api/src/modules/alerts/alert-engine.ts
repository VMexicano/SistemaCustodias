// ---------------------------------------------------------------------------
// alert-engine.ts — core business logic for the security alerts module
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { AlertsRepository } from './alerts.repository.js';
import type { CustodyOrdersService } from '../custody-orders/custody-orders.service.js';
import type {
  SecurityAlert,
  AlertType,
  Severity,
  CreateAlertPayload,
} from './alerts.types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<AlertType, Severity> = {
  panic: 'critical',
  tamper: 'high',
  geofence_violation: 'medium',
  communication_loss: 'high',
  custom: 'low',
};

const ALERTABLE_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'AT_DELIVERY',
  'INCIDENT',
]);

const PANIC_DEDUP_SECONDS = 30;

// ---------------------------------------------------------------------------
// AlertEngine
// ---------------------------------------------------------------------------

export class AlertEngine {
  constructor(
    private readonly repo: AlertsRepository,
    private readonly db: Knex,
    private readonly ordersService: CustodyOrdersService,
  ) {}

  // -------------------------------------------------------------------------
  // validateOrderForAlert
  // -------------------------------------------------------------------------

  /**
   * Verify the order exists, is in an alertable status, and the operator is
   * assigned to it. Throws BusinessError if any condition is not met.
   */
  async validateOrderForAlert(orderId: string, operatorId: string): Promise<void> {
    const orderRows = await this.db.raw<{
      rows: Array<{
        id: string;
        status: string;
        custodio_id: string | null;
        copiloto_id: string | null;
      }>;
    }>(
      `SELECT id, status, custodio_id, copiloto_id
       FROM custody_orders
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [orderId],
    );

    const order = orderRows.rows[0];
    if (!order) {
      throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
    }

    if (!ALERTABLE_STATUSES.has(order.status)) {
      throw new BusinessError(
        'ORDER_NOT_ACTIVE_FOR_ALERT',
        `Order is not in an alertable status (current: ${order.status})`,
      );
    }

    // Verify the operator is assigned to this order
    if (
      order.custodio_id !== operatorId &&
      order.copiloto_id !== operatorId
    ) {
      throw new BusinessError(
        'OPERATOR_NOT_ASSIGNED',
        'You are not assigned to this order',
      );
    }
  }

  // -------------------------------------------------------------------------
  // createAlert
  // -------------------------------------------------------------------------

  /**
   * Create a security alert.
   *
   * @param payload       - alert data (order_id, alert_type, optional location + description)
   * @param userId        - users.id from JWT — used to call ordersService.reportIncident for panic
   * @param operatorId    - operators.id resolved from user_id by the caller
   */
  async createAlert(
    payload: CreateAlertPayload,
    userId: string,
    operatorId: string,
  ): Promise<SecurityAlert> {
    // 1. Validate order is alertable and operator is assigned
    await this.validateOrderForAlert(payload.order_id, operatorId);

    // 2. Panic deduplication
    if (payload.alert_type === 'panic') {
      const recent = await this.repo.countRecentPanic(
        payload.order_id,
        operatorId,
        PANIC_DEDUP_SECONDS,
      );
      if (recent > 0) {
        throw new BusinessError(
          'PANIC_ALERT_TOO_SOON',
          `A panic alert was already created within the last ${PANIC_DEDUP_SECONDS} seconds`,
        );
      }
    }

    // 3. Determine severity (immutable — never from caller)
    const severity = SEVERITY_MAP[payload.alert_type];

    // 4. Persist the alert
    const alert = await this.repo.create({
      order_id: payload.order_id,
      operator_id: operatorId,
      alert_type: payload.alert_type,
      severity,
      location: payload.location,
      description: payload.description,
    });

    // 5. Side effect: panic alerts automatically move the order to INCIDENT
    //    This runs AFTER the insert to keep side-effects outside the transaction
    if (payload.alert_type === 'panic') {
      try {
        await this.ordersService.reportIncident(
          payload.order_id,
          { userId, role: 'custodio' },
          payload.description ?? 'Panic alert triggered',
        );
      } catch {
        // reportIncident may fail if already in INCIDENT — treat as non-fatal
      }
    }

    return alert;
  }

  // -------------------------------------------------------------------------
  // resolveAlert
  // -------------------------------------------------------------------------

  /**
   * Mark an alert as resolved.
   * Critical alerts can only be resolved by a supervisor.
   */
  async resolveAlert(
    alertId: string,
    resolverUserId: string,
    resolverRole: string,
  ): Promise<SecurityAlert> {
    // 1. Fetch the alert
    const alert = await this.repo.findById(alertId);
    if (!alert) {
      throw new BusinessError('ALERT_NOT_FOUND', 'Alert not found');
    }

    // 2. Already resolved?
    if (alert.resolved_at !== null) {
      throw new BusinessError(
        'ALERT_ALREADY_RESOLVED',
        'This alert has already been resolved',
      );
    }

    // 3. Critical alerts require supervisor
    if (alert.severity === 'critical' && resolverRole !== 'supervisor') {
      throw new BusinessError(
        'ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL',
        'Only a supervisor can resolve a critical alert',
      );
    }

    // 4. Resolve
    return this.repo.resolve(alertId, resolverUserId);
  }
}
