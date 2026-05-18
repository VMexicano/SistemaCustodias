// ---------------------------------------------------------------------------
// monitor-engine.queue.ts — BullMQ queue for Monitor Engine jobs (Sprint 15)
// Integration-only — excluded from unit coverage (jest.config.ts)
// ---------------------------------------------------------------------------

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { MonitorJobData } from './monitor-engine.types.js';

export function createMonitorEngineQueue(connection: Redis): Queue<MonitorJobData> {
  return new Queue<MonitorJobData>('monitor-engine', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}
