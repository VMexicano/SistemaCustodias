import { ValueDeclarationService } from '../../modules/value-declaration/value-declaration.service.js';
import type { ValueDeclarationRepository } from '../../modules/value-declaration/value-declaration.repository.js';
import type { Database } from '../../config/database.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CASH_TRANSPORT_SCHEMA = {
  type: 'object',
  required: ['amount_mxn', 'currency'],
  properties: {
    amount_mxn: { type: 'number', minimum: 0 },
    currency: { type: 'string', enum: ['MXN', 'USD', 'EUR'] },
    denomination_breakdown: { type: 'object', additionalProperties: { type: 'number' } },
  },
  additionalProperties: false,
};

const makeCustodyType = (schema = CASH_TRANSPORT_SCHEMA) => ({
  id: 'type-uuid',
  slug: 'cash_transport',
  name: 'Transporte de Efectivo',
  description: null,
  value_declaration_schema: schema,
  active: true,
  created_at: new Date(),
});

const makeDeclarationRow = (overrides = {}) => ({
  id: 'decl-uuid',
  order_id: 'order-uuid',
  custody_type_id: 'type-uuid',
  declared_value: { amount_mxn: 50000, currency: 'MXN' },
  insurance_policy_id: null,
  verified_by: null,
  verified_at: null,
  created_at: new Date('2026-05-14'),
  updated_at: new Date('2026-05-14'),
  ...overrides,
});

const makeDraftOrder = (status = 'DRAFT') => ({
  id: 'order-uuid',
  status,
  custody_type_id: 'type-uuid',
});

const makeRepo = (overrides: Partial<ValueDeclarationRepository> = {}): ValueDeclarationRepository =>
  ({
    listActiveCustodyTypes: jest.fn().mockResolvedValue([makeCustodyType()]),
    findCustodyType: jest.fn().mockResolvedValue(makeCustodyType()),
    findByOrderId: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(makeDeclarationRow()),
    ...overrides,
  }) as unknown as ValueDeclarationRepository;

const makeDb = (orderOverride?: { id: string; status: string; custody_type_id: string }): Database => {
  const orderRow = orderOverride ?? makeDraftOrder();

  // Build a chain that simulates trx('custody_orders').where().whereNull().forUpdate().first()
  const orderChain = {
    where: function () { return this; },
    whereNull: function () { return this; },
    forUpdate: function () { return this; },
    first: jest.fn().mockResolvedValue(orderRow),
  };

  // trx itself must be callable: trx('table') returns a query builder chain
  const trxFn = jest.fn().mockImplementation((table: string) => {
    if (table === 'custody_orders') return orderChain;
    return { where: () => ({}) };
  });

  const db = {
    transaction: jest.fn().mockImplementation(
      async (cb: (trx: unknown) => Promise<unknown>) => cb(trxFn),
    ),
  };

  return db as unknown as Database;
};

// ---------------------------------------------------------------------------
// listCustodyTypes
// ---------------------------------------------------------------------------

describe('ValueDeclarationService.listCustodyTypes', () => {
  it('returns active custody types as DTOs', async () => {
    const repo = makeRepo();
    const service = new ValueDeclarationService(repo, makeDb());

    const result = await service.listCustodyTypes();

    expect(repo.listActiveCustodyTypes).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'type-uuid',
      slug: 'cash_transport',
      name: 'Transporte de Efectivo',
    });
    expect(result[0]?.valueDeclarationSchema).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

describe('ValueDeclarationService.upsert', () => {
  const validInput = {
    orderId: 'order-uuid',
    actorUserId: 'user-uuid',
    declaredValue: { amount_mxn: 50000, currency: 'MXN' },
  };

  it('creates declaration when order is DRAFT and value is valid', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('DRAFT'));
    const service = new ValueDeclarationService(repo, db);

    const result = await service.upsert(validInput);

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-uuid',
        declaredValue: { amount_mxn: 50000, currency: 'MXN' },
      }),
      expect.anything(),
    );
    expect(result.orderId).toBe('order-uuid');
  });

  it('allows upsert when order is PENDING_APPROVAL', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('PENDING_APPROVAL'));
    const service = new ValueDeclarationService(repo, db);

    await expect(service.upsert(validInput)).resolves.toBeDefined();
  });

  it('throws INVALID_ORDER_TRANSITION when order is APPROVED', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('APPROVED'));
    const service = new ValueDeclarationService(repo, db);

    await expect(service.upsert(validInput)).rejects.toMatchObject({
      code: 'INVALID_ORDER_TRANSITION',
    });
  });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const repo = makeRepo();
    const db = makeDb({ id: 'no-exist', status: 'GHOST', custody_type_id: 'type-uuid' });
    // Override the orderChain to return undefined (order not found)
    const notFoundChain = {
      where: function () { return this; },
      whereNull: function () { return this; },
      forUpdate: function () { return this; },
      first: jest.fn().mockResolvedValue(undefined),
    };
    const notFoundTrx = jest.fn().mockImplementation(() => notFoundChain);
    const notFoundDb = {
      transaction: jest.fn().mockImplementation(
        async (cb: (trx: unknown) => Promise<unknown>) => cb(notFoundTrx),
      ),
    } as unknown as Database;

    const service = new ValueDeclarationService(repo, notFoundDb);

    await expect(service.upsert(validInput)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR when declared_value is missing required fields', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('DRAFT'));
    const service = new ValueDeclarationService(repo, db);

    await expect(
      service.upsert({
        orderId: 'order-uuid',
        actorUserId: 'user-uuid',
        declaredValue: { amount_mxn: 1000 }, // missing 'currency'
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when declared_value has wrong enum value', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('DRAFT'));
    const service = new ValueDeclarationService(repo, db);

    await expect(
      service.upsert({
        orderId: 'order-uuid',
        actorUserId: 'user-uuid',
        declaredValue: { amount_mxn: 1000, currency: 'BTC' }, // invalid enum
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when declared_value has extra fields (additionalProperties: false)', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('DRAFT'));
    const service = new ValueDeclarationService(repo, db);

    await expect(
      service.upsert({
        orderId: 'order-uuid',
        actorUserId: 'user-uuid',
        declaredValue: { amount_mxn: 1000, currency: 'MXN', unknown_field: true },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('passes insurance_policy_id to repo', async () => {
    const repo = makeRepo();
    const db = makeDb(makeDraftOrder('DRAFT'));
    const service = new ValueDeclarationService(repo, db);

    await service.upsert({
      orderId: 'order-uuid',
      actorUserId: 'user-uuid',
      declaredValue: { amount_mxn: 50000, currency: 'MXN' },
      insurancePolicyId: 'POL-001',
    });

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ insurancePolicyId: 'POL-001' }),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// getByOrderId
// ---------------------------------------------------------------------------

describe('ValueDeclarationService.getByOrderId', () => {
  it('returns declaration DTO when declaration exists', async () => {
    const repo = makeRepo({ findByOrderId: jest.fn().mockResolvedValue(makeDeclarationRow()) });
    const service = new ValueDeclarationService(repo, makeDb());

    const result = await service.getByOrderId('order-uuid');

    expect(result.orderId).toBe('order-uuid');
    expect(result.declaredValue).toMatchObject({ amount_mxn: 50000, currency: 'MXN' });
  });

  it('throws VALUE_DECLARATION_NOT_FOUND when no declaration exists', async () => {
    const repo = makeRepo({ findByOrderId: jest.fn().mockResolvedValue(undefined) });
    const service = new ValueDeclarationService(repo, makeDb());

    await expect(service.getByOrderId('no-exist')).rejects.toMatchObject({
      code: 'VALUE_DECLARATION_NOT_FOUND',
    });
  });
});
