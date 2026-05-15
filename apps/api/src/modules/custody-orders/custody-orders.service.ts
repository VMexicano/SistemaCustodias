import type { Database } from '../../config/database.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import { CustodyStateMachine } from './custody-state-machine.js';
import type { CustodyOrdersRepository } from './custody-orders.repository.js';
import type {
  CustodyOrder,
  CustodyOrderDTO,
  OrderTransitionDTO,
  OrderStatus,
  CreateOrderInput,
  Actor,
} from './custody-orders.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateOrderNumber(): string {
  const d = new Date();
  const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${yyyymmdd}-${rand}`;
}

function toDTO(o: CustodyOrder): CustodyOrderDTO {
  return {
    id: o.id,
    orderNumber: o.order_number,
    clientId: o.client_id,
    custodyTypeId: o.custody_type_id,
    tenantId: o.tenant_id,
    status: o.status,
    pickupAddress: o.pickup_address,
    deliveryAddress: o.delivery_address,
    scheduledAt: o.scheduled_at?.toISOString() ?? null,
    pickupWindowStart: o.pickup_window_start?.toISOString() ?? null,
    pickupWindowEnd: o.pickup_window_end?.toISOString() ?? null,
    custodioId: o.custodio_id,
    copilotoId: o.copiloto_id,
    custodioConfirmedAt: o.custodio_confirmed_at?.toISOString() ?? null,
    copilotoConfirmedAt: o.copiloto_confirmed_at?.toISOString() ?? null,
    approvedBy: o.approved_by,
    approvedAt: o.approved_at?.toISOString() ?? null,
    rejectedReason: o.rejected_reason,
    custodySnapshot: o.custody_snapshot,
    pricingSnapshot: o.pricing_snapshot,
    notes: o.notes,
    createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CustodyOrdersService {
  constructor(
    private readonly repo: CustodyOrdersRepository,
    private readonly db: Database,
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(input: CreateOrderInput): Promise<CustodyOrderDTO> {
    const clientRow = await this.db('clients')
      .where({ user_id: input.actorUserId })
      .whereNull('deleted_at')
      .first() as { id: string } | undefined;
    if (!clientRow) throw new BusinessError('CLIENT_NOT_FOUND', 'Caller has no client profile');

    const order = await this.repo.create({
      orderNumber: generateOrderNumber(),
      clientId: clientRow.id,
      custodyTypeId: input.custodyTypeId,
      tenantId: input.tenantId,
      pickupAddress: input.pickupAddress,
      deliveryAddress: input.deliveryAddress,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      pickupWindowStart: input.pickupWindowStart ? new Date(input.pickupWindowStart) : undefined,
      pickupWindowEnd: input.pickupWindowEnd ? new Date(input.pickupWindowEnd) : undefined,
      notes: input.notes,
    });

    return toDTO(order);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async getById(id: string): Promise<CustodyOrderDTO> {
    const order = await this.repo.findById(id);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
    return toDTO(order);
  }

  async list(
    tenantId: string,
    filters: { status?: OrderStatus; clientId?: string },
    page: number,
    limit: number,
  ): Promise<{ data: CustodyOrderDTO[]; total: number }> {
    const result = await this.repo.findByTenant(tenantId, filters, page, limit);
    return { data: result.data.map(toDTO), total: result.total };
  }

  async getMyOrders(userId: string, tenantId: string): Promise<CustodyOrderDTO[]> {
    const orders = await this.repo.findActiveForOperator(userId, tenantId);
    return orders.map(toDTO);
  }

  async getTransitions(orderId: string): Promise<OrderTransitionDTO[]> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');

    const transitions = await this.repo.findTransitions(orderId);
    return transitions.map((t) => ({
      id: t.id,
      orderId: t.order_id,
      fromStatus: t.from_status,
      toStatus: t.to_status,
      actorId: t.actor_id,
      actorRole: t.actor_role,
      notes: t.notes,
      digitalSignature: t.digital_signature,
      createdAt: t.created_at.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // Core transition helper
  // -------------------------------------------------------------------------

  private async executeTransition(
    orderId: string,
    toStatus: OrderStatus,
    actor: Actor,
    patch: Record<string, unknown> = {},
    opts: { notes?: string; signature?: string } = {},
  ): Promise<CustodyOrderDTO> {
    return this.db.transaction(async (trx) => {
      const order = await this.repo.findByIdForUpdate(orderId, trx);
      if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');

      CustodyStateMachine.validateTransition(order.status, toStatus);

      await this.repo.insertTransition(
        {
          orderId,
          fromStatus: order.status,
          toStatus,
          actorId: actor.userId,
          actorRole: actor.role,
          notes: opts.notes,
          digitalSignature: opts.signature,
        },
        trx,
      );

      const updated = await this.repo.updateStatus(orderId, toStatus, patch, trx);
      return toDTO(updated);
    });
  }

  // -------------------------------------------------------------------------
  // Approval flow
  // -------------------------------------------------------------------------

  async submit(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'PENDING_APPROVAL', actor);
  }

  async approve(
    orderId: string,
    actor: Actor,
    opts: { notes?: string } = {},
  ): Promise<CustodyOrderDTO> {
    return this.db.transaction(async (trx) => {
      const order = await this.repo.findByIdForUpdate(orderId, trx);
      if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');

      CustodyStateMachine.validateTransition(order.status, 'APPROVED');

      const pricingSnapshot = await this.repo.buildPricingSnapshot(order.custody_type_id, trx);

      await this.repo.insertTransition(
        {
          orderId,
          fromStatus: order.status,
          toStatus: 'APPROVED',
          actorId: actor.userId,
          actorRole: actor.role,
          notes: opts.notes,
        },
        trx,
      );

      const updated = await this.repo.updateStatus(
        orderId,
        'APPROVED',
        {
          approved_by: actor.userId,
          approved_at: new Date(),
          pricing_snapshot: pricingSnapshot,
        },
        trx,
      );

      return toDTO(updated);
    });
  }

  async reject(
    orderId: string,
    actor: Actor,
    reason: string,
  ): Promise<CustodyOrderDTO> {
    if (!reason || reason.trim().length < 10) {
      throw new BusinessError('VALIDATION_ERROR', 'rejected_reason must be at least 10 characters');
    }

    return this.executeTransition(orderId, 'REJECTED', actor, { rejected_reason: reason });
  }

  async cancel(orderId: string, actor: Actor, opts: { notes?: string } = {}): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'CANCELLED', actor, {}, opts);
  }

  // -------------------------------------------------------------------------
  // Crew flow
  // -------------------------------------------------------------------------

  async assignCrew(
    orderId: string,
    actor: Actor,
    custodioId: string,
    copilotoId: string,
  ): Promise<CustodyOrderDTO> {
    if (custodioId === copilotoId) {
      throw new BusinessError('VALIDATION_ERROR', 'custodio and copiloto must be different operators');
    }

    return this.executeTransition(orderId, 'ASSIGNED', actor, {
      custodio_id: custodioId,
      copiloto_id: copilotoId,
      custodio_confirmed_at: null,
      copiloto_confirmed_at: null,
    });
  }

  async confirmCrew(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.db.transaction(async (trx) => {
      const order = await this.repo.findByIdForUpdate(orderId, trx);
      if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');

      if (order.status !== 'ASSIGNED' && order.status !== 'REASSIGNED') {
        throw new BusinessError('INVALID_ORDER_TRANSITION', `Cannot confirm crew in status ${order.status}`);
      }

      // Resolve which operator is calling
      const operatorRow = await trx('operators')
        .where({ user_id: actor.userId })
        .whereNull('deleted_at')
        .first() as { id: string } | undefined;

      if (!operatorRow) {
        throw new BusinessError('OPERATOR_NOT_FOUND', 'Caller has no operator profile');
      }

      const isCustodio = operatorRow.id === order.custodio_id;
      const isCopiloto = operatorRow.id === order.copiloto_id;

      if (!isCustodio && !isCopiloto) {
        throw new BusinessError('FORBIDDEN', 'You are not assigned to this order');
      }

      const now = new Date();
      const patch: Record<string, unknown> = isCustodio
        ? { custodio_confirmed_at: now }
        : { copiloto_confirmed_at: now };

      // Check if the OTHER side already confirmed — if so, transition to CREW_CONFIRMED
      const otherAlreadyConfirmed = isCustodio
        ? order.copiloto_confirmed_at !== null
        : order.custodio_confirmed_at !== null;

      const nextStatus: OrderStatus = otherAlreadyConfirmed ? 'CREW_CONFIRMED' : order.status;

      if (otherAlreadyConfirmed) {
        CustodyStateMachine.validateTransition(order.status, 'CREW_CONFIRMED');
        await this.repo.insertTransition(
          {
            orderId,
            fromStatus: order.status,
            toStatus: 'CREW_CONFIRMED',
            actorId: actor.userId,
            actorRole: actor.role,
          },
          trx,
        );
      }

      const updated = await this.repo.updateStatus(orderId, nextStatus, patch, trx);
      return toDTO(updated);
    });
  }

  // -------------------------------------------------------------------------
  // Transit flow
  // -------------------------------------------------------------------------

  async depart(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'EN_ROUTE_TO_PICKUP', actor);
  }

  async arrivePickup(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'AT_PICKUP', actor);
  }

  async pickup(orderId: string, actor: Actor, signature: string): Promise<CustodyOrderDTO> {
    if (!signature || signature.trim().length === 0) {
      throw new BusinessError('VALIDATION_ERROR', 'digital_signature is required for pickup');
    }

    return this.db.transaction(async (trx) => {
      const order = await this.repo.findByIdForUpdate(orderId, trx);
      if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');

      CustodyStateMachine.validateTransition(order.status, 'IN_TRANSIT');

      const custodySnapshot = await this.repo.buildCustodySnapshot(orderId, trx);

      await this.repo.insertTransition(
        {
          orderId,
          fromStatus: order.status,
          toStatus: 'IN_TRANSIT',
          actorId: actor.userId,
          actorRole: actor.role,
          digitalSignature: signature,
        },
        trx,
      );

      const updated = await this.repo.updateStatus(
        orderId,
        'IN_TRANSIT',
        { custody_snapshot: custodySnapshot },
        trx,
      );

      return toDTO(updated);
    });
  }

  async arriveDelivery(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'AT_DELIVERY', actor);
  }

  async deliver(orderId: string, actor: Actor, signature: string): Promise<CustodyOrderDTO> {
    if (!signature || signature.trim().length === 0) {
      throw new BusinessError('VALIDATION_ERROR', 'digital_signature is required for delivery');
    }
    return this.executeTransition(orderId, 'DELIVERED', actor, {}, { signature });
  }

  async complete(orderId: string, actor: Actor): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'COMPLETED', actor);
  }

  // -------------------------------------------------------------------------
  // Incident flow
  // -------------------------------------------------------------------------

  async reportIncident(
    orderId: string,
    actor: Actor,
    description: string,
  ): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'INCIDENT', actor, {}, { notes: description });
  }

  async resolveIncident(
    orderId: string,
    actor: Actor,
    transitTo: 'IN_TRANSIT' | 'RESOLVED',
    opts: { notes?: string } = {},
  ): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, transitTo, actor, {}, opts);
  }

  // -------------------------------------------------------------------------
  // Reassign
  // -------------------------------------------------------------------------

  async reassignCrew(
    orderId: string,
    actor: Actor,
    custodioId: string,
    copilotoId: string,
  ): Promise<CustodyOrderDTO> {
    if (custodioId === copilotoId) {
      throw new BusinessError('VALIDATION_ERROR', 'custodio and copiloto must be different operators');
    }

    return this.executeTransition(orderId, 'REASSIGNED', actor, {
      custodio_id: custodioId,
      copiloto_id: copilotoId,
      custodio_confirmed_at: null,
      copiloto_confirmed_at: null,
    });
  }

  async markPickupFailed(orderId: string, actor: Actor, notes: string): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'PICKUP_FAILED', actor, {}, { notes });
  }

  async markDeliveryFailed(orderId: string, actor: Actor, notes: string): Promise<CustodyOrderDTO> {
    return this.executeTransition(orderId, 'DELIVERY_FAILED', actor, {}, { notes });
  }

  // -------------------------------------------------------------------------
  // Scheduling (Sprint 9)
  // -------------------------------------------------------------------------

  async scheduleOrder(
    orderId: string,
    _actor: Actor,
    dto: {
      scheduledAt: string;
      pickupWindowStart?: string;
      pickupWindowEnd?: string;
    },
  ): Promise<CustodyOrderDTO> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
    if (order.status !== 'DRAFT') {
      throw new BusinessError('ORDER_NOT_IN_DRAFT_STATUS', 'Only DRAFT orders can be scheduled');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const minFuture = new Date(Date.now() + 30 * 60 * 1000);
    if (scheduledAt < minFuture) {
      throw new BusinessError('SCHEDULED_AT_TOO_SOON', 'Scheduled time must be at least 30 minutes in the future');
    }

    if (dto.pickupWindowStart && dto.pickupWindowEnd) {
      const windowStart = new Date(dto.pickupWindowStart);
      const windowEnd = new Date(dto.pickupWindowEnd);
      if (windowEnd <= windowStart) {
        throw new BusinessError('INVALID_PICKUP_WINDOW', 'pickup_window_end must be after pickup_window_start');
      }
    }

    const updated = await this.repo.updateSchedule(orderId, {
      scheduled_at: scheduledAt,
      pickup_window_start: dto.pickupWindowStart ? new Date(dto.pickupWindowStart) : null,
      pickup_window_end: dto.pickupWindowEnd ? new Date(dto.pickupWindowEnd) : null,
    });

    return toDTO(updated);
  }

  async unscheduleOrder(orderId: string, _actor: Actor): Promise<CustodyOrderDTO> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
    if (order.status !== 'DRAFT') {
      throw new BusinessError('ORDER_NOT_IN_DRAFT_STATUS', 'Only DRAFT orders can be unscheduled');
    }

    const updated = await this.repo.updateSchedule(orderId, {
      scheduled_at: null,
      pickup_window_start: null,
      pickup_window_end: null,
    });

    return toDTO(updated);
  }
}
