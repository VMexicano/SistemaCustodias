// ---------------------------------------------------------------------------
// custody-events.repository.ts — Knex queries for event_catalog and order_event
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { Database } from '../../config/database.js';
import type { EventCatalogRow, OrderEventActorRole, OrderEventRow } from './custody-events.types.js';

export interface CreateOrderEventData {
  order_id: string;
  tenant_id: string;
  event_type: string;
  sequence_no: number;
  actor_id: string | null;
  actor_role: OrderEventActorRole;
  app_timestamp: Date;
  auto_timestamp: null;
  location: Record<string, unknown>;
  evidence: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  device: Record<string, unknown>;
  integrity_hash: string;
}

export class CustodyEventsRepository {
  constructor(private readonly db: Database) {}

  async findCatalogByVertical(verticalSlug: string): Promise<EventCatalogRow[]> {
    return this.db<EventCatalogRow>('event_catalog')
      .where({ vertical_slug: verticalSlug, active: true })
      .orderBy('code', 'asc');
  }

  async findCatalogEntry(
    verticalSlug: string,
    code: string,
  ): Promise<EventCatalogRow | null> {
    const row = await this.db<EventCatalogRow>('event_catalog')
      .where({ vertical_slug: verticalSlug, code, active: true })
      .first();
    return row ?? null;
  }

  async getNextSequenceNo(orderId: string, trx: Knex.Transaction): Promise<number> {
    const result = await trx.raw<{ rows: Array<{ max: string | null }> }>(
      'SELECT MAX(sequence_no) as max FROM order_event WHERE order_id = ? FOR UPDATE',
      [orderId],
    );
    const max = result.rows[0]?.max;
    return max === null || max === undefined ? 1 : Number(max) + 1;
  }

  async create(data: CreateOrderEventData, trx: Knex.Transaction): Promise<OrderEventRow> {
    const rows = await trx('order_event')
      .insert(data as unknown as Record<string, unknown>)
      .returning('*') as OrderEventRow[];
    const row = rows[0];
    if (!row) throw new Error('Failed to create order event: no row returned');
    return row;
  }

  async findByOrder(
    orderId: string,
    limit: number,
    offset: number,
  ): Promise<{ events: OrderEventRow[]; total: number }> {
    const [events, countResult] = await Promise.all([
      this.db<OrderEventRow>('order_event')
        .where({ order_id: orderId })
        .orderBy('sequence_no', 'asc')
        .limit(limit)
        .offset(offset),
      this.db('order_event')
        .where({ order_id: orderId })
        .count('id as total')
        .first(),
    ]);

    const total = Number(
      (countResult as { total: string | number } | undefined)?.total ?? 0,
    );

    return { events, total };
  }
}
