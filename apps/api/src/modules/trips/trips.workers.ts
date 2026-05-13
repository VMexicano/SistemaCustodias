/**
 * trips.workers.ts
 *
 * Background job processors for the trips module.
 *
 * Job: searching-timeout
 *   Triggered 300 s after a trip is created.
 *   If the trip is still in SEARCHING status, it is cancelled by the system.
 *
 * Job: trip.promote-approved
 *   Enqueued immediately after a trip is approved without an assigned driver.
 *   Transitions the trip from APPROVED → SEARCHING.
 */

import type { TripsService } from './trips.service.js';
import { tripsQueue } from './trips.queue.js';

export function registerTripsWorkers(tripsService: TripsService): void {
  tripsQueue.registerSearchingTimeoutHandler(
    async (data: { tripId: string }) => {
      await tripsService.handleSearchingTimeout(data.tripId);
    },
    async (data: { tripId: string }) => {
      await tripsService.handlePromoteApproved(data.tripId);
    },
  );
}
