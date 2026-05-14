// ---------------------------------------------------------------------------
// alert-engine.test.ts — unit tests for AlertEngine (100% branch coverage)
// ---------------------------------------------------------------------------

import { AlertEngine } from '../../modules/alerts/alert-engine.js';
import type { AlertsRepository } from '../../modules/alerts/alerts.repository.js';
import type { SecurityAlert } from '../../modules/alerts/alerts.types.js';
import { BusinessError } from '../../shared/errors/business-error.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = 'order-uuid-1';
const OPERATOR_ID = 'operator-uuid-1';
const USER_ID = 'user-uuid-1';
const ALERT_ID = 'alert-uuid-1';

const makeAlert = (overrides: Partial<SecurityAlert> = {}): SecurityAlert => ({
  id: ALERT_ID,
  order_id: ORDER_ID,
  operator_id: OPERATOR_ID,
  alert_type: 'panic',
  severity: 'critical',
  location: null,
  description: null,
  resolved_by: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<AlertsRepository> = {}): jest.Mocked<AlertsRepository> {
  return {
    create: jest.fn().mockResolvedValue(makeAlert()),
    findById: jest.fn().mockResolvedValue(makeAlert()),
    findAll: jest.fn().mockResolvedValue([]),
    findByOrderId: jest.fn().mockResolvedValue([]),
    resolve: jest.fn().mockResolvedValue(makeAlert({ resolved_by: USER_ID, resolved_at: new Date().toISOString() })),
    countRecentPanic: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as jest.Mocked<AlertsRepository>;
}

function makeDb(
  orderRow?: {
    id: string;
    status: string;
    custodio_id: string | null;
    copiloto_id: string | null;
  },
) {
  const rawFn = jest.fn();

  rawFn.mockImplementation((sql: string) => {
    if (sql.includes('custody_orders')) {
      return Promise.resolve({
        rows: orderRow !== undefined ? [orderRow] : [],
      });
    }
    return Promise.resolve({ rows: [] });
  });

  return { raw: rawFn } as unknown as import('knex').Knex;
}

function makeOrdersService(overrides: Record<string, unknown> = {}) {
  return {
    reportIncident: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as import('../../modules/custody-orders/custody-orders.service.js').CustodyOrdersService;
}

// ---------------------------------------------------------------------------
// validateOrderForAlert
// ---------------------------------------------------------------------------

describe('AlertEngine.validateOrderForAlert', () => {
  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const engine = new AlertEngine(makeRepo(), makeDb(), makeOrdersService());
    await expect(
      engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('throws ORDER_NOT_ACTIVE_FOR_ALERT when status is not alertable', async () => {
    const db = makeDb({ id: ORDER_ID, status: 'DRAFT', custodio_id: OPERATOR_ID, copiloto_id: null });
    const engine = new AlertEngine(makeRepo(), db, makeOrdersService());
    await expect(
      engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_ACTIVE_FOR_ALERT' });
  });

  it('throws OPERATOR_NOT_ASSIGNED when operator is not custodio or copiloto', async () => {
    const db = makeDb({
      id: ORDER_ID,
      status: 'IN_TRANSIT',
      custodio_id: 'other-op-id',
      copiloto_id: 'yet-another-op',
    });
    const engine = new AlertEngine(makeRepo(), db, makeOrdersService());
    await expect(
      engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID),
    ).rejects.toMatchObject({ code: 'OPERATOR_NOT_ASSIGNED' });
  });

  it('passes when custodio matches', async () => {
    const db = makeDb({
      id: ORDER_ID,
      status: 'IN_TRANSIT',
      custodio_id: OPERATOR_ID,
      copiloto_id: null,
    });
    const engine = new AlertEngine(makeRepo(), db, makeOrdersService());
    await expect(engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID)).resolves.toBeUndefined();
  });

  it('passes when copiloto matches', async () => {
    const db = makeDb({
      id: ORDER_ID,
      status: 'AT_PICKUP',
      custodio_id: 'other-op',
      copiloto_id: OPERATOR_ID,
    });
    const engine = new AlertEngine(makeRepo(), db, makeOrdersService());
    await expect(engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID)).resolves.toBeUndefined();
  });

  it.each([
    'EN_ROUTE_TO_PICKUP',
    'AT_PICKUP',
    'IN_TRANSIT',
    'AT_DELIVERY',
    'INCIDENT',
  ] as const)('passes for alertable status: %s', async (status) => {
    const db = makeDb({ id: ORDER_ID, status, custodio_id: OPERATOR_ID, copiloto_id: null });
    const engine = new AlertEngine(makeRepo(), db, makeOrdersService());
    await expect(engine.validateOrderForAlert(ORDER_ID, OPERATOR_ID)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createAlert
// ---------------------------------------------------------------------------

describe('AlertEngine.createAlert', () => {
  const activeOrderDb = makeDb({
    id: ORDER_ID,
    status: 'IN_TRANSIT',
    custodio_id: OPERATOR_ID,
    copiloto_id: null,
  });

  it('creates a panic alert and calls reportIncident', async () => {
    const ordersService = makeOrdersService();
    const repo = makeRepo();
    const engine = new AlertEngine(repo, activeOrderDb, ordersService);

    const alert = await engine.createAlert(
      { order_id: ORDER_ID, alert_type: 'panic', description: 'Help!' },
      USER_ID,
      OPERATOR_ID,
    );

    expect(repo.countRecentPanic).toHaveBeenCalledWith(ORDER_ID, OPERATOR_ID, 30);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ alert_type: 'panic', severity: 'critical' }),
    );
    expect(ordersService.reportIncident).toHaveBeenCalledWith(
      ORDER_ID,
      { userId: USER_ID, role: 'custodio' },
      'Help!',
    );
    expect(alert.alert_type).toBe('panic');
  });

  it('throws PANIC_ALERT_TOO_SOON when dedup check fails', async () => {
    const repo = makeRepo({ countRecentPanic: jest.fn().mockResolvedValue(1) });
    const engine = new AlertEngine(repo, activeOrderDb, makeOrdersService());

    await expect(
      engine.createAlert({ order_id: ORDER_ID, alert_type: 'panic' }, USER_ID, OPERATOR_ID),
    ).rejects.toMatchObject({ code: 'PANIC_ALERT_TOO_SOON' });
  });

  it('does NOT call countRecentPanic for non-panic alert types', async () => {
    const repo = makeRepo();
    const engine = new AlertEngine(repo, activeOrderDb, makeOrdersService());

    await engine.createAlert({ order_id: ORDER_ID, alert_type: 'tamper' }, USER_ID, OPERATOR_ID);

    expect(repo.countRecentPanic).not.toHaveBeenCalled();
  });

  it.each([
    ['panic', 'critical'],
    ['tamper', 'high'],
    ['geofence_violation', 'medium'],
    ['communication_loss', 'high'],
    ['custom', 'low'],
  ] as const)('maps %s → severity %s', async (alertType, expectedSeverity) => {
    const repo = makeRepo({
      create: jest.fn().mockResolvedValue(makeAlert({ alert_type: alertType, severity: expectedSeverity })),
    });
    const engine = new AlertEngine(repo, activeOrderDb, makeOrdersService());

    await engine.createAlert({ order_id: ORDER_ID, alert_type: alertType }, USER_ID, OPERATOR_ID);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: expectedSeverity }),
    );
  });

  it('uses default description for panic when none provided', async () => {
    const ordersService = makeOrdersService();
    const repo = makeRepo();
    const engine = new AlertEngine(repo, activeOrderDb, ordersService);

    await engine.createAlert({ order_id: ORDER_ID, alert_type: 'panic' }, USER_ID, OPERATOR_ID);

    expect(ordersService.reportIncident).toHaveBeenCalledWith(
      ORDER_ID,
      expect.anything(),
      'Panic alert triggered',
    );
  });

  it('passes location to repo.create when provided', async () => {
    const repo = makeRepo();
    const engine = new AlertEngine(repo, activeOrderDb, makeOrdersService());

    await engine.createAlert(
      { order_id: ORDER_ID, alert_type: 'tamper', location: { lat: 19.4, lng: -99.1 } },
      USER_ID,
      OPERATOR_ID,
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ location: { lat: 19.4, lng: -99.1 } }),
    );
  });

  it('does not throw if reportIncident fails (non-fatal side effect)', async () => {
    const ordersService = makeOrdersService({
      reportIncident: jest.fn().mockRejectedValue(new Error('Already in INCIDENT')),
    });
    const engine = new AlertEngine(makeRepo(), activeOrderDb, ordersService);

    await expect(
      engine.createAlert({ order_id: ORDER_ID, alert_type: 'panic' }, USER_ID, OPERATOR_ID),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolveAlert
// ---------------------------------------------------------------------------

describe('AlertEngine.resolveAlert', () => {
  it('throws ALERT_NOT_FOUND when alert does not exist', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

    await expect(engine.resolveAlert(ALERT_ID, USER_ID, 'supervisor')).rejects.toMatchObject({
      code: 'ALERT_NOT_FOUND',
    });
  });

  it('throws ALERT_ALREADY_RESOLVED when resolved_at is not null', async () => {
    const resolvedAlert = makeAlert({ resolved_at: new Date().toISOString() });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(resolvedAlert) });
    const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

    await expect(engine.resolveAlert(ALERT_ID, USER_ID, 'supervisor')).rejects.toMatchObject({
      code: 'ALERT_ALREADY_RESOLVED',
    });
  });

  it('throws ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL when non-supervisor resolves critical', async () => {
    const criticalAlert = makeAlert({ severity: 'critical', resolved_at: null });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(criticalAlert) });
    const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

    await expect(engine.resolveAlert(ALERT_ID, USER_ID, 'dispatcher')).rejects.toMatchObject({
      code: 'ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL',
    });
  });

  it('allows supervisor to resolve critical alert', async () => {
    const criticalAlert = makeAlert({ severity: 'critical', resolved_at: null });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(criticalAlert) });
    const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

    const result = await engine.resolveAlert(ALERT_ID, USER_ID, 'supervisor');
    expect(repo.resolve).toHaveBeenCalledWith(ALERT_ID, USER_ID);
    expect(result).toBeDefined();
  });

  it('allows any role to resolve non-critical alert', async () => {
    const highAlert = makeAlert({ severity: 'high', resolved_at: null });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(highAlert) });
    const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

    const result = await engine.resolveAlert(ALERT_ID, USER_ID, 'dispatcher');
    expect(repo.resolve).toHaveBeenCalledWith(ALERT_ID, USER_ID);
    expect(result).toBeDefined();
  });

  it.each(['low', 'medium', 'high'] as const)(
    'allows dispatcher to resolve %s severity alert',
    async (severity) => {
      const alert = makeAlert({ severity, resolved_at: null });
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(alert) });
      const engine = new AlertEngine(repo, makeDb(), makeOrdersService());

      await expect(engine.resolveAlert(ALERT_ID, USER_ID, 'dispatcher')).resolves.toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// BusinessError codes exist in the module
// ---------------------------------------------------------------------------

describe('BusinessError codes for alerts module', () => {
  it('BusinessError can be constructed with ALERT_NOT_FOUND', () => {
    expect(() => new BusinessError('ALERT_NOT_FOUND')).not.toThrow();
  });
  it('BusinessError can be constructed with ALERT_ALREADY_RESOLVED', () => {
    expect(() => new BusinessError('ALERT_ALREADY_RESOLVED')).not.toThrow();
  });
  it('BusinessError can be constructed with PANIC_ALERT_TOO_SOON', () => {
    expect(() => new BusinessError('PANIC_ALERT_TOO_SOON')).not.toThrow();
  });
  it('BusinessError can be constructed with ORDER_NOT_ACTIVE_FOR_ALERT', () => {
    expect(() => new BusinessError('ORDER_NOT_ACTIVE_FOR_ALERT')).not.toThrow();
  });
  it('BusinessError can be constructed with ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL', () => {
    expect(() => new BusinessError('ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL')).not.toThrow();
  });
});
