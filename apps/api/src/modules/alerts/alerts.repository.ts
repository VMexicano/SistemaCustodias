// ---------------------------------------------------------------------------
// alerts.repository.ts — data access layer for security_alerts
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { SecurityAlert, AlertType, AlertsFilter } from './alerts.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a PostgreSQL POINT string "(lng,lat)" into { lat, lng }.
 */
function parsePoint(pgPoint: string | null): { lat: number; lng: number } | null {
  if (!pgPoint) return null;
  const match = pgPoint.match(/\(([^,]+),([^)]+)\)/);
  if (!match) return null;
  return { lat: parseFloat(match[2]!), lng: parseFloat(match[1]!) };
}

interface AlertRow {
  id: string;
  order_id: string;
  operator_id: string;
  alert_type: AlertType;
  severity: string;
  location: string | null;
  description: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

function toDTO(row: AlertRow): SecurityAlert {
  return {
    id: row.id,
    order_id: row.order_id,
    operator_id: row.operator_id,
    alert_type: row.alert_type,
    severity: row.severity as SecurityAlert['severity'],
    location: parsePoint(row.location),
    description: row.description,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AlertsRepository {
  constructor(private readonly db: Knex) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  async create(
    payload: {
      order_id: string;
      operator_id: string;
      alert_type: AlertType;
      severity: string;
      location?: { lat: number; lng: number };
      description?: string;
    },
    trx?: Knex.Transaction,
  ): Promise<SecurityAlert> {
    const conn = trx ?? this.db;

    const rows = await conn.raw<{ rows: AlertRow[] }>(
      `INSERT INTO security_alerts
         (order_id, operator_id, alert_type, severity, location, description)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING
         id, order_id, operator_id, alert_type, severity,
         CAST(location AS TEXT) AS location,
         description, resolved_by, resolved_at, created_at`,
      [
        payload.order_id,
        payload.operator_id,
        payload.alert_type,
        payload.severity,
        payload.location
          ? conn.raw('POINT(?, ?)', [payload.location.lng, payload.location.lat]) as unknown as string
          : null,
        payload.description ?? null,
      ],
    );

    return toDTO(rows.rows[0]!);
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  async findById(id: string): Promise<SecurityAlert | null> {
    const rows = await this.db.raw<{ rows: AlertRow[] }>(
      `SELECT
         id, order_id, operator_id, alert_type, severity,
         CAST(location AS TEXT) AS location,
         description, resolved_by, resolved_at, created_at
       FROM security_alerts
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows.rows[0] ? toDTO(rows.rows[0]) : null;
  }

  // -------------------------------------------------------------------------
  // findAll (with optional filters)
  // -------------------------------------------------------------------------

  async findAll(filters: AlertsFilter = {}): Promise<SecurityAlert[]> {
    let query = this.db<AlertRow>('security_alerts').select(
      'id',
      'order_id',
      'operator_id',
      'alert_type',
      'severity',
      this.db.raw('CAST(location AS TEXT) AS location'),
      'description',
      'resolved_by',
      'resolved_at',
      'created_at',
    );

    if (filters.order_id) query = query.where('order_id', filters.order_id);
    if (filters.operator_id) query = query.where('operator_id', filters.operator_id);
    if (filters.alert_type) query = query.where('alert_type', filters.alert_type);
    if (filters.severity) query = query.where('severity', filters.severity);
    if (filters.resolved === true) query = query.whereNotNull('resolved_at');
    if (filters.resolved === false) query = query.whereNull('resolved_at');

    const rows = (await query.orderBy('created_at', 'desc')) as unknown as AlertRow[];
    return rows.map(toDTO);
  }

  // -------------------------------------------------------------------------
  // findByOrderId
  // -------------------------------------------------------------------------

  async findByOrderId(orderId: string): Promise<SecurityAlert[]> {
    return this.findAll({ order_id: orderId });
  }

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  async resolve(
    alertId: string,
    resolvedBy: string,
    trx?: Knex.Transaction,
  ): Promise<SecurityAlert> {
    const conn = trx ?? this.db;

    const rows = await conn.raw<{ rows: AlertRow[] }>(
      `UPDATE security_alerts
       SET resolved_by = ?, resolved_at = NOW()
       WHERE id = ?
       RETURNING
         id, order_id, operator_id, alert_type, severity,
         CAST(location AS TEXT) AS location,
         description, resolved_by, resolved_at, created_at`,
      [resolvedBy, alertId],
    );

    if (!rows.rows[0]) {
      throw new Error(`Alert ${alertId} not found during resolve`);
    }

    return toDTO(rows.rows[0]);
  }

  // -------------------------------------------------------------------------
  // countRecentPanic — deduplication check
  // -------------------------------------------------------------------------

  async countRecentPanic(
    orderId: string,
    operatorId: string,
    windowSeconds: number,
  ): Promise<number> {
    const result = await this.db.raw<{ rows: Array<{ count: string }> }>(
      `SELECT COUNT(*) AS count
       FROM security_alerts
       WHERE order_id = ?
         AND operator_id = ?
         AND alert_type = 'panic'
         AND created_at > NOW() - INTERVAL '${windowSeconds} seconds'`,
      [orderId, operatorId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
