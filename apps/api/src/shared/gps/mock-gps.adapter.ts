// ---------------------------------------------------------------------------
// mock-gps.adapter.ts — Mock GPS provider for development/testing (Sprint 15)
// In production, replace with WinlogAdapter that calls the real GPS provider.
// ---------------------------------------------------------------------------

import type { IGpsProvider } from './gps-provider.interface.js';

export class MockGpsAdapter implements IGpsProvider {
  async getAutoTimestamp(_orderId: string, _vehicleId: string | null): Promise<Date> {
    // Simulates GPS provider: 0-120 seconds offset from now
    const offsetMs = Math.floor(Math.random() * 120_000);
    return new Date(Date.now() - offsetMs);
  }
}
