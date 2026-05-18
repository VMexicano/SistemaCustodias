// ---------------------------------------------------------------------------
// gps-provider.interface.ts — GPS provider abstraction (Sprint 15)
// ---------------------------------------------------------------------------

export interface IGpsProvider {
  getAutoTimestamp(orderId: string, vehicleId: string | null): Promise<Date>;
}
