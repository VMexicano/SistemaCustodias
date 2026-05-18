// ---------------------------------------------------------------------------
// monitor-engine.worker.test.ts — unit tests for registerMonitorEngineWorker
// ---------------------------------------------------------------------------

import { Worker } from 'bullmq';
import { registerMonitorEngineWorker } from '../../modules/monitor-engine/monitor-engine.worker.js';
import type { MonitorJobData } from '../../modules/monitor-engine/monitor-engine.types.js';

jest.mock('bullmq', () => ({
  Worker: jest.fn(),
}));

const MockWorker = Worker as jest.MockedClass<typeof Worker>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(eventId: string, orderId = 'order-id'): { data: MonitorJobData } {
  return { data: { eventId, orderId } };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('registerMonitorEngineWorker', () => {
  let capturedProcessor: ((job: { data: MonitorJobData }) => Promise<void>) | null = null;
  const workerStub = { on: jest.fn(), close: jest.fn() };
  const mockEngine = { processEvent: jest.fn() };
  const mockRedis = {} as never;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = null;

    MockWorker.mockImplementation((_name, processor, _opts) => {
      capturedProcessor = processor as typeof capturedProcessor;
      return workerStub as never;
    });
  });

  // -------------------------------------------------------------------------
  // Constructor arguments
  // -------------------------------------------------------------------------

  it('crea el Worker con nombre de cola "monitor-engine"', () => {
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    expect(MockWorker).toHaveBeenCalledWith(
      'monitor-engine',
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('crea el Worker con concurrency 5 y la conexión Redis recibida', () => {
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    expect(MockWorker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      { connection: mockRedis, concurrency: 5 },
    );
  });

  it('retorna la instancia del Worker creada', () => {
    const result = registerMonitorEngineWorker(mockEngine as never, mockRedis);

    expect(result).toBe(workerStub);
  });

  // -------------------------------------------------------------------------
  // Processor function behavior
  // -------------------------------------------------------------------------

  it('el processor invoca processEvent con el eventId del job', async () => {
    mockEngine.processEvent.mockResolvedValue(undefined);
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    await capturedProcessor!(makeJob('event-abc-123') as never);

    expect(mockEngine.processEvent).toHaveBeenCalledWith('event-abc-123');
    expect(mockEngine.processEvent).toHaveBeenCalledTimes(1);
  });

  it('el processor usa el eventId de CADA job — no lo reutiliza entre llamadas', async () => {
    mockEngine.processEvent.mockResolvedValue(undefined);
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    await capturedProcessor!(makeJob('event-1') as never);
    await capturedProcessor!(makeJob('event-2') as never);

    expect(mockEngine.processEvent).toHaveBeenNthCalledWith(1, 'event-1');
    expect(mockEngine.processEvent).toHaveBeenNthCalledWith(2, 'event-2');
  });

  it('el processor NO silencia errores — los propaga para que BullMQ reintente', async () => {
    const error = new Error('processEvent failed — should retry');
    mockEngine.processEvent.mockRejectedValue(error);
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    await expect(
      capturedProcessor!(makeJob('event-fail') as never),
    ).rejects.toThrow('processEvent failed — should retry');
  });

  it('un error en job-1 no afecta la ejecución de job-2', async () => {
    mockEngine.processEvent
      .mockRejectedValueOnce(new Error('job-1 failed'))
      .mockResolvedValueOnce(undefined);
    registerMonitorEngineWorker(mockEngine as never, mockRedis);

    await expect(capturedProcessor!(makeJob('event-err') as never)).rejects.toThrow();
    await expect(capturedProcessor!(makeJob('event-ok') as never)).resolves.toBeUndefined();

    expect(mockEngine.processEvent).toHaveBeenCalledTimes(2);
  });
});
