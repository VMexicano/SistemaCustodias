// ---------------------------------------------------------------------------
// custody-events.service.ts — business logic for custody event envelope
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import Ajv from 'ajv';
import type { Knex } from 'knex';
import type { Queue } from 'bullmq';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { CustodyEventsRepository } from './custody-events.repository.js';
import type { CustodyOrdersRepository } from '../custody-orders/custody-orders.repository.js';
import type {
  CreateCustodyEventPayload,
  EventCatalogDTO,
  EventCatalogRow,
  EventEvidence,
  OrderEventDTO,
  OrderEventRow,
} from './custody-events.types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = [
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'AT_DELIVERY',
  'INCIDENT',
  'RESOLVED',
] as const;

type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ajv = new Ajv();

function toCatalogDTO(row: EventCatalogRow): EventCatalogDTO {
  return {
    code: row.code,
    label: row.label,
    requiresPhoto: row.requires_photo,
    requiresAudio: row.requires_audio,
    requiresSignature: row.requires_signature,
    payloadSchema: row.payload_schema,
    intervalMinutes: row.interval_minutes,
  };
}

function toEventDTO(row: OrderEventRow, includeEvidence: boolean): OrderEventDTO {
  const dto: OrderEventDTO = {
    id: row.id,
    orderId: row.order_id,
    eventType: row.event_type,
    sequenceNo: row.sequence_no,
    actorRole: row.actor_role,
    appTimestamp:
      row.app_timestamp instanceof Date
        ? row.app_timestamp.toISOString()
        : String(row.app_timestamp),
    location: row.location,
    payload: row.payload,
    device: { signal_strength: row.device.signal_strength },
    integrityHash: row.integrity_hash,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };

  if (includeEvidence && row.evidence !== null) {
    dto.evidence = row.evidence;
  }

  return dto;
}

// ---------------------------------------------------------------------------
// CustodyEventService
// ---------------------------------------------------------------------------

export class CustodyEventService {
  constructor(
    private readonly repo: CustodyEventsRepository,
    private readonly ordersRepo: CustodyOrdersRepository,
    private readonly alertsQueue: Queue,
    private readonly hmacSecret: string,
    private readonly db: Knex,
  ) {}

  // ---------------------------------------------------------------------------
  // getCatalog
  // ---------------------------------------------------------------------------

  async getCatalog(orderId: string): Promise<EventCatalogDTO[]> {
    const order = await this.ordersRepo.findById(orderId);
    if (!order) {
      throw new BusinessError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    if (!ACTIVE_STATUSES.includes(order.status as ActiveStatus)) {
      throw new BusinessError(
        'ORDER_NOT_ACTIVE_FOR_EVENT',
        `Order is not in an active status for events (current: ${order.status})`,
      );
    }

    const custodyType = await this.db('custody_types')
      .where({ id: order.custody_type_id })
      .first() as { slug: string } | undefined;

    const slug = custodyType?.slug ?? '';
    const catalog = await this.repo.findCatalogByVertical(slug);
    return catalog.map(toCatalogDTO);
  }

  // ---------------------------------------------------------------------------
  // createEvent
  // ---------------------------------------------------------------------------

  async createEvent(
    orderId: string,
    actorId: string,
    data: CreateCustodyEventPayload,
  ): Promise<OrderEventDTO> {
    // 1. Verify order exists
    const order = await this.ordersRepo.findById(orderId);
    if (!order) {
      throw new BusinessError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    // 2. Verify active status
    if (!ACTIVE_STATUSES.includes(order.status as ActiveStatus)) {
      throw new BusinessError(
        'ORDER_NOT_ACTIVE_FOR_EVENT',
        `Order is not in an active status for events (current: ${order.status})`,
      );
    }

    // 3. Resolve vertical slug
    const custodyType = await this.db('custody_types')
      .where({ id: order.custody_type_id })
      .first() as { slug: string } | undefined;
    const slug = custodyType?.slug ?? '';

    // 4. Look up catalog entry
    const catalogEntry = await this.repo.findCatalogEntry(slug, data.event_type);
    if (!catalogEntry) {
      throw new BusinessError(
        'EVENT_TYPE_NOT_FOUND',
        `Event type '${data.event_type}' not found in catalog for vertical '${slug}'`,
      );
    }

    // 5. Validate payload against catalog schema
    this.validatePayload(catalogEntry.payload_schema, data.payload);

    // 6. Calculate integrity hash (server-side, ADR-022)
    const integrityHash = this.calculateIntegrityHash(data);

    // 7. Persist within a transaction
    const event = await this.db.transaction(async (trx) => {
      const sequenceNo = await this.repo.getNextSequenceNo(orderId, trx);

      return this.repo.create(
        {
          order_id: orderId,
          tenant_id: order.tenant_id,
          event_type: data.event_type,
          sequence_no: sequenceNo,
          actor_id: actorId,
          actor_role: data.actor_role,
          app_timestamp: new Date(data.app_timestamp),
          auto_timestamp: null, // Monitor Engine — Sprint 15
          location: data.location as unknown as Record<string, unknown>,
          evidence: data.evidence
            ? (data.evidence as unknown as Record<string, unknown>)
            : null,
          payload: data.payload,
          device: data.device as unknown as Record<string, unknown>,
          integrity_hash: integrityHash,
        },
        trx,
      );
    });

    // 8. Side effect outside transaction (ADR-003)
    if (data.event_type === 'PANIC') {
      await this.alertsQueue.add('create-alert', {
        type: 'panic',
        orderId,
        actorId,
      });
    }

    return toEventDTO(event, true);
  }

  // ---------------------------------------------------------------------------
  // getEvents
  // ---------------------------------------------------------------------------

  async getEvents(
    orderId: string,
    limit: number,
    offset: number,
    includeEvidence: boolean,
  ): Promise<{ events: OrderEventDTO[]; total: number }> {
    const { events, total } = await this.repo.findByOrder(orderId, limit, offset);
    return {
      events: events.map((e) => toEventDTO(e, includeEvidence)),
      total,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculateIntegrityHash(data: CreateCustodyEventPayload): string {
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    return createHmac('sha256', this.hmacSecret).update(canonical).digest('hex');
  }

  private validatePayload(
    schema: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): void {
    const validate = ajv.compile(schema);
    if (!validate(payload)) {
      throw new BusinessError(
        'EVENT_PAYLOAD_INVALID',
        ajv.errorsText(validate.errors),
      );
    }
  }
}
