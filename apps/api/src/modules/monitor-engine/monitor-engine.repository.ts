// ---------------------------------------------------------------------------
// monitor-engine.repository.ts — data access for Monitor Engine (Sprint 15)
// Integration-tested only — excluded from unit coverage (jest.config.ts)
// ---------------------------------------------------------------------------

import type { Database } from '../../config/database.js';

export interface MonitorEventRow {
  id: string;
  order_id: string;
  actor_id: string | null;
  actor_role: string;
  event_type: string;
  app_timestamp: Date;
  auto_timestamp: Date | null;
  location: Record<string, unknown>;
  payload: Record<string, unknown>;
  device: { mock_location_detected: boolean; [key: string]: unknown };
  integrity_hash: string;
}

export class MonitorRepository {
  constructor(private readonly db: Database) {}

  async findEventById(eventId: string): Promise<MonitorEventRow | null> {
    const row = await this.db<MonitorEventRow>('order_event')
      .where({ id: eventId })
      .first();
    return row ?? null;
  }

  // CAS: only writes if auto_timestamp IS NULL (ADR-024)
  async updateAutoTimestamp(eventId: string, ts: Date): Promise<void> {
    await this.db('order_event')
      .where({ id: eventId })
      .whereNull('auto_timestamp')
      .update({ auto_timestamp: ts });
  }
}
