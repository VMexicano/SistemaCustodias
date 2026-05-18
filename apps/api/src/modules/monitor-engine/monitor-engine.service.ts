// ---------------------------------------------------------------------------
// monitor-engine.service.ts — fraud detection engine for custody events (Sprint 15)
// Processes each event asynchronously via BullMQ (ADR-025).
// Side-effects (alertsQueue.add) are always outside transactions (ADR-003).
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { IGpsProvider } from '../../shared/gps/gps-provider.interface.js';
import type { MonitorRepository, MonitorEventRow } from './monitor-engine.repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMESTAMP_DELTA_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// ---------------------------------------------------------------------------
// MonitorEngine
// ---------------------------------------------------------------------------

export class MonitorEngine {
  constructor(
    private readonly repo: MonitorRepository,
    private readonly gpsProvider: IGpsProvider,
    private readonly alertsQueue: Queue,
    private readonly hmacSecret: string,
  ) {}

  async processEvent(eventId: string): Promise<void> {
    // 1. Load event — if not found, log and return (order may have been deleted)
    const event = await this.repo.findEventById(eventId);
    if (!event) {
      console.warn(`[MonitorEngine] Event ${eventId} not found — skipping`);
      return;
    }

    // 2. Obtain auto_timestamp from GPS provider (non-fatal if it fails)
    let autoTs: Date | null = null;
    try {
      autoTs = await this.gpsProvider.getAutoTimestamp(event.order_id, null);
      // CAS update: only writes if auto_timestamp IS NULL (ADR-024)
      await this.repo.updateAutoTimestamp(eventId, autoTs);
    } catch (err) {
      console.error('[MonitorEngine] GPS provider error:', err);
    }

    // 3. Check timestamp delta (only if auto_timestamp was obtained successfully)
    if (autoTs !== null) {
      await this.checkTimestampDelta(event, autoTs);
    }

    // 4. Check integrity hash (always)
    await this.checkIntegrityHash(event);

    // 5. Check mock location (always)
    await this.checkMockLocation(event);
  }

  private async checkTimestampDelta(event: MonitorEventRow, autoTs: Date): Promise<void> {
    const deltaMs = Math.abs(autoTs.getTime() - new Date(event.app_timestamp).getTime());
    if (deltaMs > TIMESTAMP_DELTA_THRESHOLD_MS) {
      const deltaSeconds = Math.round(deltaMs / 1000);
      await this.alertsQueue.add('create-alert', {
        type: 'tamper',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: `Timestamp delta ${deltaSeconds}s exceeds 3 min threshold`,
        source: 'monitor-engine',
      });
    }
  }

  private async checkIntegrityHash(event: MonitorEventRow): Promise<void> {
    // Reconstruct the canonical object used by CustodyEventService.calculateIntegrityHash()
    // Fields must match CreateCustodyEventPayload, sorted alphabetically
    const canonical: Record<string, unknown> = {
      event_type: event.event_type,
      actor_role: event.actor_role,
      app_timestamp:
        event.app_timestamp instanceof Date
          ? event.app_timestamp.toISOString()
          : String(event.app_timestamp),
      location: event.location,
      payload: event.payload,
      device: event.device,
    };
    const sortedKeys = Object.keys(canonical).sort();
    const canonicalStr = JSON.stringify(canonical, sortedKeys);
    const recalculated = createHmac('sha256', this.hmacSecret)
      .update(canonicalStr)
      .digest('hex');

    if (recalculated !== event.integrity_hash) {
      await this.alertsQueue.add('create-alert', {
        type: 'tamper',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: 'integrity_hash_mismatch',
        source: 'monitor-engine',
      });
    }
  }

  private async checkMockLocation(event: MonitorEventRow): Promise<void> {
    if (event.device.mock_location_detected === true) {
      await this.alertsQueue.add('create-alert', {
        type: 'custom',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: 'mock_location_detected',
        source: 'monitor-engine',
      });
    }
  }
}
