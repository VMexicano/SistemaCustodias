import type { Database } from '../../config/database.js';

export interface CustodyOrderRow {
  id: string;
  order_number: string;
  status: string;
  custody_type_name: string;
  custody_type_slug: string;
  client_id: string;
  custodio_id: string | null;
  copiloto_id: string | null;
  pickup_address: Record<string, unknown>;
  delivery_address: Record<string, unknown>;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClientRow {
  id: string;
  contact_name: string;
  company_name: string | null;
  rfc: string | null;
  user_id: string;
}

export interface OperatorRow {
  operator_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  license_number: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
}

export interface TransitionRow {
  id: string;
  from_status: string;
  to_status: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_first_name: string | null;
  actor_last_name: string | null;
  location: string | null;
  notes: string | null;
  digital_signature: string | null;
  created_at: Date;
}

export interface ValueDeclarationRow {
  declared_value: Record<string, unknown>;
  custody_type_name: string;
  insurance_policy_id: string | null;
  verified_at: Date | null;
  verified_by_name: string | null;
}

export interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  description: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export class ComplianceRepository {
  constructor(private readonly db: Database) {}

  async getOrderWithType(id: string): Promise<CustodyOrderRow | undefined> {
    return this.db('custody_orders as o')
      .join('custody_types as ct', 'o.custody_type_id', 'ct.id')
      .where('o.id', id)
      .whereNull('o.deleted_at')
      .select(
        'o.id',
        'o.order_number',
        'o.status',
        this.db.raw('ct.name as custody_type_name'),
        this.db.raw('ct.slug as custody_type_slug'),
        'o.client_id',
        'o.custodio_id',
        'o.copiloto_id',
        'o.pickup_address',
        'o.delivery_address',
        'o.notes',
        'o.created_at',
        'o.updated_at',
      )
      .first() as Promise<CustodyOrderRow | undefined>;
  }

  async getClientForOrder(clientId: string): Promise<ClientRow | undefined> {
    return this.db('clients as c')
      .join('users as u', 'c.user_id', 'u.id')
      .where('c.id', clientId)
      .whereNull('c.deleted_at')
      .select(
        'c.id',
        'c.contact_name',
        'c.company_name',
        'c.rfc',
        'c.user_id',
      )
      .first() as Promise<ClientRow | undefined>;
  }

  async getOperatorData(operatorId: string): Promise<OperatorRow | undefined> {
    return this.db('operators as op')
      .join('users as u', 'op.user_id', 'u.id')
      .leftJoin('custody_vehicles as cv', 'op.vehicle_id', 'cv.id')
      .where('op.id', operatorId)
      .whereNull('op.deleted_at')
      .select(
        this.db.raw('op.id as operator_id'),
        'op.user_id',
        'u.first_name',
        'u.last_name',
        'op.license_number',
        'op.vehicle_id',
        this.db.raw('cv.plate as vehicle_plate'),
        this.db.raw('cv.make as vehicle_make'),
        this.db.raw('cv.model as vehicle_model'),
        this.db.raw('cv.year as vehicle_year'),
      )
      .first() as Promise<OperatorRow | undefined>;
  }

  async getTransitionsWithActors(orderId: string): Promise<TransitionRow[]> {
    return this.db('order_transitions as ot')
      .leftJoin('users as u', 'ot.actor_id', 'u.id')
      .where('ot.order_id', orderId)
      .orderBy('ot.created_at', 'asc')
      .select(
        'ot.id',
        'ot.from_status',
        'ot.to_status',
        'ot.actor_id',
        'ot.actor_role',
        this.db.raw('u.first_name as actor_first_name'),
        this.db.raw('u.last_name as actor_last_name'),
        this.db.raw('ot.location::text as location'),
        'ot.notes',
        'ot.digital_signature',
        'ot.created_at',
      ) as Promise<TransitionRow[]>;
  }

  async getValueDeclaration(orderId: string): Promise<ValueDeclarationRow | undefined> {
    return this.db('value_declarations as vd')
      .join('custody_types as ct', 'vd.custody_type_id', 'ct.id')
      .leftJoin('users as u', 'vd.verified_by', 'u.id')
      .where('vd.order_id', orderId)
      .select(
        'vd.declared_value',
        this.db.raw('ct.name as custody_type_name'),
        'vd.insurance_policy_id',
        'vd.verified_at',
        this.db.raw(
          "CASE WHEN u.id IS NOT NULL THEN CONCAT(u.first_name, ' ', u.last_name) ELSE NULL END as verified_by_name",
        ),
      )
      .first() as Promise<ValueDeclarationRow | undefined>;
  }

  async getAlerts(orderId: string): Promise<AlertRow[]> {
    return this.db('security_alerts')
      .where({ order_id: orderId })
      .orderBy('created_at', 'asc')
      .select(
        'id',
        'alert_type',
        'severity',
        'description',
        'resolved_at',
        'created_at',
      ) as Promise<AlertRow[]>;
  }
}
