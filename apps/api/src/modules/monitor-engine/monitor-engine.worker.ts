// ---------------------------------------------------------------------------
// monitor-engine.worker.ts — BullMQ worker for Monitor Engine jobs (Sprint 15)
// Integration-only — excluded from unit coverage (jest.config.ts)
// ---------------------------------------------------------------------------

import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { MonitorEngine } from './monitor-engine.service.js';
import type { MonitorJobData } from './monitor-engine.types.js';

export function registerMonitorEngineWorker(
  monitorEngine: MonitorEngine,
  connection: Redis,
): Worker<MonitorJobData> {
  return new Worker<MonitorJobData>(
    'monitor-engine',
    async (job) => {
      await monitorEngine.processEvent(job.data.eventId);
    },
    { connection, concurrency: 5 },
  );
}
