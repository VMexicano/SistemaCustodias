import type { Knex } from 'knex';
import type { Database } from '../../config/database.js';
import type {
  CustodyOrder,
  OrderStatus,
  OrderTransition,
  CustodySnapshot,
  PricingSnapshot,
  Address,
} from './custody-orders.types.js';

export interface CreateOrderData {
  orderNumber: string;
  clientId: string;
  custodyTypeId: string;
  tenantId: string;
  pickupAddress: Address;
  deliveryAddress: Address;
  scheduledAt?: Date;
  pickupWindowStart?: Date;
  pickupWindowEnd?: Date;
  notes?: string;
}

export interface InsertTransitionData {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorId: string | null;
  actorRole: string | null;
  notes?: string;
  digitalSignature?: string;
}

type Trx = Knex.Transaction;

export class CustodyOrdersRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string, trx?: Trx): Promise<CustodyOrder | undefined> {
    return (trx ?? this.db)<CustodyOrder>('custody_orders')
      .where({ id })
      .whereNull('deleted_at')
      .first();
  }

  async findByIdForUpdate(id: string, trx: Trx): Promise<CustodyOrder | undefined> {
    return trx<CustodyOrder>('custody_orders')
      .where({ id })
      .whereNull('deleted_at')
      .forUpdate()
      .first();
  }

  async findByTenant(
    tenantId: string,
    filters: { status?: OrderStatus; clientId?: string },
    page: number,
    limit: number,
  ): Promise<{ data: CustodyOrder[]; total: number }> {
    const base = () => {
      const q = this.db<CustodyOrder>('custody_orders')
        .where({ tenant_id: tenantId })
        .whereNull('deleted_at');
      if (filters.status) q.where({ status: filters.status });
      if (filters.clientId) q.where({ client_id: filters.clientId });
      return q;
    };

    const [data, countResult] = await Promise.all([
      base().orderBy('created_at', 'desc').limit(limit).offset(page * limit),
      base().count('id as total').first(),
    ]);

    return {
      data,
      total: Number((countResult as { total: string | number } | undefined)?.total ?? 0),
    };
  }

  async create(data: CreateOrderData): Promise<CustodyOrder> {
    const rows = await this.db<CustodyOrder>('custody_orders')
      .insert({
        order_number: data.orderNumber,
        client_id: data.clientId,
        custody_type_id: data.custodyTypeId,
        tenant_id: data.tenantId,
        status: 'DRAFT',
        pickup_address: data.pickupAddress,
        delivery_address: data.deliveryAddress,
        scheduled_at: data.scheduledAt ?? null,
        pickup_window_start: data.pickupWindowStart ?? null,
        pickup_window_end: data.pickupWindowEnd ?? null,
        notes: data.notes ?? null,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create order: no row returned');
    return row;
  }

  async updateSchedule(
    id: string,
    data: { scheduled_at: Date | null; pickup_window_start: Date | null; pickup_window_end: Date | null },
  ): Promise<CustodyOrder> {
    const rows = await this.db<CustodyOrder>('custody_orders')
      .where({ id })
      .whereNull('deleted_at')
      .update({ ...data, updated_at: this.db.fn.now() })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error(`Failed to update schedule for order ${id}: no row returned`);
    return row;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    patch: Record<string, unknown>,
    trx: Trx,
  ): Promise<CustodyOrder> {
    const rows = await trx<CustodyOrder>('custody_orders')
      .where({ id })
      .update({ status, ...patch, updated_at: this.db.fn.now() })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error(`Failed to update order ${id}: no row returned`);
    return row;
  }

  async insertTransition(data: InsertTransitionData, trx: Trx): Promise<void> {
    await trx('order_transitions').insert({
      order_id: data.orderId,
      from_status: data.fromStatus,
      to_status: data.toStatus,
      actor_id: data.actorId,
      actor_role: data.actorRole,
      notes: data.notes ?? null,
      digital_signature: data.digitalSignature ?? null,
      created_at: new Date(),
    });
  }

  async findTransitions(orderId: string): Promise<OrderTransition[]> {
    return this.db<OrderTransition>('order_transitions')
      .where({ order_id: orderId })
      .orderBy('created_at', 'asc');
  }

  async buildCustodySnapshot(orderId: string, trx: Trx): Promise<CustodySnapshot> {
    const order = await trx<CustodyOrder>('custody_orders').where({ id: orderId }).first();
    if (!order) throw new Error(`Order ${orderId} not found`);

    const [custodyType, clientRow, custodioRow, copilotoRow, valueDecl] = await Promise.all([
      trx('custody_types').where({ id: order.custody_type_id }).first(),
      trx('clients')
        .join('users', 'clients.user_id', 'users.id')
        .where('clients.id', order.client_id)
        .select('users.full_name')
        .first(),
      trx('operators')
        .join('users', 'operators.user_id', 'users.id')
        .where('operators.id', order.custodio_id)
        .select('operators.id', 'operators.license_number', 'operators.vehicle_id', 'users.full_name')
        .first(),
      trx('operators')
        .join('users', 'operators.user_id', 'users.id')
        .where('operators.id', order.copiloto_id)
        .select('operators.id', 'operators.license_number', 'users.full_name')
        .first(),
      trx('value_declarations').where({ order_id: orderId }).first(),
    ]);

    const vehicleRow = custodioRow?.vehicle_id
      ? await trx('custody_vehicles').where({ id: custodioRow.vehicle_id }).first()
      : null;

    return {
      order_id: orderId,
      order_number: order.order_number,
      custody_type: { slug: custodyType?.slug ?? '', name: custodyType?.name ?? '' },
      value_declaration: (valueDecl?.declared_value as Record<string, unknown>) ?? {},
      client: { id: order.client_id, name: (clientRow as { full_name: string } | undefined)?.full_name ?? '' },
      custodio: {
        id: order.custodio_id ?? '',
        name: (custodioRow as { full_name: string } | undefined)?.full_name ?? '',
        license: (custodioRow as { license_number: string | null } | undefined)?.license_number ?? '',
      },
      copiloto: {
        id: order.copiloto_id ?? '',
        name: (copilotoRow as { full_name: string } | undefined)?.full_name ?? '',
        license: (copilotoRow as { license_number: string | null } | undefined)?.license_number ?? '',
      },
      vehicle: vehicleRow
        ? { id: vehicleRow.id as string, plate: vehicleRow.plate as string, model: vehicleRow.model as string }
        : { id: '', plate: '', model: '' },
      pickup_address: order.pickup_address,
      delivery_address: order.delivery_address,
      in_transit_at: new Date().toISOString(),
    };
  }

  async buildPricingSnapshot(custodyTypeId: string, trx: Trx): Promise<PricingSnapshot> {
    const rule = await trx('pricing_rules')
      .where({ custody_type_id: custodyTypeId, active: true })
      .first();

    const base = Number(rule?.base_price_mxn ?? 0);
    const perKm = Number(rule?.per_km_price_mxn ?? 0);
    const distanceKm = 0; // routing Sprint 6
    const subtotal = base + distanceKm * perKm;
    const iva = subtotal * 0.16;
    const total = subtotal + iva;

    return {
      base_price_mxn: base,
      distance_km: distanceKm,
      per_km_price_mxn: perKm,
      subtotal_mxn: subtotal,
      iva_mxn: parseFloat(iva.toFixed(2)),
      total_mxn: parseFloat(total.toFixed(2)),
      rule_id: rule?.id ?? '',
      calculated_at: new Date().toISOString(),
    };
  }
}
