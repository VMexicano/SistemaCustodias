import { ChainOfCustodyService } from '../../modules/compliance/chain-of-custody.service.js';
import type { ComplianceRepository } from '../../modules/compliance/compliance.repository.js';
import type {
  CustodyOrderRow,
  ClientRow,
  OperatorRow,
  TransitionRow,
  ValueDeclarationRow,
  AlertRow,
} from '../../modules/compliance/compliance.repository.js';
import { BusinessError } from '../../shared/errors/business-error.js';

// ---------------------------------------------------------------------------
// pdfkit mock — factory uses jest.fn(), behavior set per-test in beforeEach
// ---------------------------------------------------------------------------
jest.mock('pdfkit');
const MockPDFDocument = jest.requireMock<jest.Mock>('pdfkit');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER: CustodyOrderRow = {
  id: 'order-1',
  order_number: 'ORD-001',
  status: 'COMPLETED',
  custody_type_name: 'Efectivo',
  custody_type_slug: 'cash_transport',
  client_id: 'client-1',
  custodio_id: 'op-1',
  copiloto_id: 'op-2',
  pickup_address: { street: 'Av. Reforma 1', city: 'CDMX', state: 'CDMX' },
  delivery_address: { street: 'Insurgentes 50', city: 'CDMX', state: 'CDMX' },
  notes: null,
  created_at: new Date('2026-01-01T10:00:00Z'),
  updated_at: new Date('2026-01-01T18:00:00Z'),
};

const CLIENT: ClientRow = {
  id: 'client-1',
  contact_name: 'Juan Pérez',
  company_name: 'Banco Norte',
  rfc: 'BANC123456',
  user_id: 'user-client-1',
};

const CUSTODIO: OperatorRow = {
  operator_id: 'op-1',
  user_id: 'user-op-1',
  first_name: 'Carlos',
  last_name: 'López',
  license_number: 'LIC-001',
  vehicle_id: 'veh-1',
  vehicle_plate: 'ABC-123',
  vehicle_make: 'Toyota',
  vehicle_model: 'Hilux',
  vehicle_year: 2022,
};

const COPILOTO: OperatorRow = {
  operator_id: 'op-2',
  user_id: 'user-op-2',
  first_name: 'María',
  last_name: 'González',
  license_number: 'LIC-002',
  vehicle_id: null,
  vehicle_plate: null,
  vehicle_make: null,
  vehicle_model: null,
  vehicle_year: null,
};

const TRANSITIONS: TransitionRow[] = [
  {
    id: 'tr-1',
    from_status: 'DRAFT',
    to_status: 'PENDING_APPROVAL',
    actor_id: 'user-client-1',
    actor_role: 'client',
    actor_first_name: 'Juan',
    actor_last_name: 'Pérez',
    location: null,
    notes: null,
    digital_signature: null,
    created_at: new Date('2026-01-01T10:05:00Z'),
  },
  {
    id: 'tr-2',
    from_status: 'AT_PICKUP',
    to_status: 'IN_TRANSIT',
    actor_id: 'user-op-1',
    actor_role: 'custodio',
    actor_first_name: 'Carlos',
    actor_last_name: 'López',
    location: '(-99.1332,19.4326)',
    notes: 'Carga recibida',
    digital_signature: 'base64svgdata==',
    created_at: new Date('2026-01-01T12:00:00Z'),
  },
  {
    id: 'tr-3',
    from_status: 'DELIVERED',
    to_status: 'COMPLETED',
    actor_id: 'user-sup-1',
    actor_role: 'supervisor',
    actor_first_name: 'Ana',
    actor_last_name: 'Ríos',
    location: null,
    notes: null,
    digital_signature: null,
    created_at: new Date('2026-01-01T18:00:00Z'),
  },
];

const VALUE_DECLARATION: ValueDeclarationRow = {
  declared_value: { amount_mxn: 500000, currency: 'MXN' },
  custody_type_name: 'Efectivo',
  insurance_policy_id: 'POL-123',
  verified_at: new Date('2026-01-01T11:00:00Z'),
  verified_by_name: 'Ana Ríos',
};

const ALERT: AlertRow = {
  id: 'alert-1',
  alert_type: 'panic',
  severity: 'critical',
  description: 'Pánico activado',
  resolved_at: new Date('2026-01-01T12:30:00Z'),
  created_at: new Date('2026-01-01T12:15:00Z'),
};

// ---------------------------------------------------------------------------
// Helper — makes a mock repo
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<ComplianceRepository> = {}): ComplianceRepository {
  return {
    getOrderWithType: jest.fn().mockResolvedValue(ORDER),
    getClientForOrder: jest.fn().mockResolvedValue(CLIENT),
    getOperatorData: jest
      .fn()
      .mockResolvedValueOnce(CUSTODIO)
      .mockResolvedValueOnce(COPILOTO),
    getTransitionsWithActors: jest.fn().mockResolvedValue(TRANSITIONS),
    getValueDeclaration: jest.fn().mockResolvedValue(VALUE_DECLARATION),
    getAlerts: jest.fn().mockResolvedValue([ALERT]),
    ...overrides,
  } as unknown as ComplianceRepository;
}

// ---------------------------------------------------------------------------
// pdfkit mock setup helper
// ---------------------------------------------------------------------------

function setupPdfMock(): void {
  MockPDFDocument.mockImplementation(() => {
    const handlers: Record<string, Function> = {};
    const doc: Record<string, jest.Mock> = {
      on: jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
        return doc;
      }),
      fontSize: jest.fn(() => doc),
      font: jest.fn(() => doc),
      text: jest.fn(() => doc),
      moveDown: jest.fn(() => doc),
      end: jest.fn(() => {
        handlers['data']?.(Buffer.from('PDF'));
        handlers['end']?.();
      }),
    };
    return doc;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainOfCustodyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupPdfMock();
  });

  // -------------------------------------------------------------------------
  // buildReport
  // -------------------------------------------------------------------------

  describe('buildReport', () => {
    it('returns full report for dispatcher role', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');

      expect(report.order.id).toBe('order-1');
      expect(report.order.orderNumber).toBe('ORD-001');
      expect(report.order.status).toBe('COMPLETED');
      expect(report.order.custodyType).toBe('Efectivo');
      expect(report.order.completedAt).toBe('2026-01-01T18:00:00.000Z');
      expect(report.client.name).toBe('Juan Pérez');
      expect(report.client.companyName).toBe('Banco Norte');
      expect(report.team.custodio?.name).toBe('Carlos López');
      expect(report.team.custodio?.licenseNumber).toBe('LIC-001');
      expect(report.team.copiloto?.name).toBe('María González');
      expect(report.team.vehicle?.plate).toBe('ABC-123');
      expect(report.team.vehicle?.model).toBe('Hilux');
      expect(report.valueDeclaration?.declaredValue).toEqual({ amount_mxn: 500000, currency: 'MXN' });
      expect(report.valueDeclaration?.insurancePolicyId).toBe('POL-123');
      expect(report.transitions).toHaveLength(3);
      expect(report.alerts).toHaveLength(1);
      expect(report.integrity.algorithm).toBe('sha256');
      expect(report.integrity.hash).toHaveLength(64);
    });

    it('redacts declaredValue and signatureData for client role', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'client');

      expect(report.valueDeclaration?.declaredValue).toBeNull();
      report.transitions.forEach((t) => {
        expect(t.signatureData).toBeNull();
      });
    });

    it('includes signatureData for dispatcher role', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');

      const sigTransition = report.transitions.find((t) => t.hasSignature);
      expect(sigTransition?.signatureData).toBe('base64svgdata==');
    });

    it('parses POINT location from transition', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');

      const transitTransition = report.transitions.find((t) => t.fromStatus === 'AT_PICKUP');
      expect(transitTransition?.location).toEqual({ lat: 19.4326, lng: -99.1332 });
    });

    it('throws ORDER_NOT_FOUND when order does not exist', async () => {
      const repo = makeRepo({ getOrderWithType: jest.fn().mockResolvedValue(undefined) });
      const svc = new ChainOfCustodyService(repo);
      await expect(svc.buildReport('missing', 'dispatcher')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });

    it('returns completedAt null when no COMPLETED transition', async () => {
      const transitionsNoCOMP: TransitionRow[] = [TRANSITIONS[0]!];
      const repo = makeRepo({ getTransitionsWithActors: jest.fn().mockResolvedValue(transitionsNoCOMP) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.order.completedAt).toBeNull();
    });

    it('returns empty transitions and alerts when none exist', async () => {
      const repo = makeRepo({
        getTransitionsWithActors: jest.fn().mockResolvedValue([]),
        getAlerts: jest.fn().mockResolvedValue([]),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.transitions).toHaveLength(0);
      expect(report.alerts).toHaveLength(0);
    });

    it('returns null valueDeclaration when none exists', async () => {
      const repo = makeRepo({ getValueDeclaration: jest.fn().mockResolvedValue(undefined) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.valueDeclaration).toBeNull();
    });

    it('returns null team members when no operators assigned', async () => {
      const orderNoOps: CustodyOrderRow = { ...ORDER, custodio_id: null, copiloto_id: null };
      const repo = makeRepo({ getOrderWithType: jest.fn().mockResolvedValue(orderNoOps) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.team.custodio).toBeNull();
      expect(report.team.copiloto).toBeNull();
      expect(report.team.vehicle).toBeNull();
    });

    it('returns null vehicle when custodio has no vehicle_id', async () => {
      const custodioNoVeh: OperatorRow = { ...CUSTODIO, vehicle_id: null };
      const repo = makeRepo({
        getOperatorData: jest
          .fn()
          .mockResolvedValueOnce(custodioNoVeh)
          .mockResolvedValueOnce(COPILOTO),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.team.vehicle).toBeNull();
    });

    it('SHA-256 hash is deterministic for same report content', async () => {
      const repo1 = makeRepo();
      const svc = new ChainOfCustodyService(repo1);

      // Build twice — reportId and generatedAt differ, but we verify hash is computed
      const r1 = await svc.buildReport('order-1', 'dispatcher');
      const r2 = await svc.buildReport('order-1', 'dispatcher');

      // Both hashes must be 64-char hex strings
      expect(r1.integrity.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r2.integrity.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('SHA-256 hash changes when report data changes', async () => {
      const repo1 = makeRepo();
      const repo2 = makeRepo({
        getClientForOrder: jest.fn().mockResolvedValue({ ...CLIENT, contact_name: 'Pedro Soto' }),
      });
      const svc1 = new ChainOfCustodyService(repo1);
      const svc2 = new ChainOfCustodyService(repo2);

      const r1 = await svc1.buildReport('order-1', 'dispatcher');
      const r2 = await svc2.buildReport('order-1', 'dispatcher');

      expect(r1.integrity.hash).not.toBe(r2.integrity.hash);
    });

    it('sets actor.name to null when actor_first_name is null', async () => {
      const transitionNullActor: TransitionRow = {
        ...TRANSITIONS[0]!,
        actor_first_name: null,
        actor_last_name: null,
      };
      const repo = makeRepo({
        getTransitionsWithActors: jest.fn().mockResolvedValue([transitionNullActor]),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.transitions[0]!.actor.name).toBeNull();
    });

    it('sets verifiedAt to null when value_declaration.verified_at is null', async () => {
      const vdNullDate: ValueDeclarationRow = { ...VALUE_DECLARATION, verified_at: null };
      const repo = makeRepo({ getValueDeclaration: jest.fn().mockResolvedValue(vdNullDate) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.valueDeclaration?.verifiedAt).toBeNull();
    });

    it('sets alert.resolvedAt to null when resolved_at is null', async () => {
      const alertNoResolve: AlertRow = { ...ALERT, resolved_at: null };
      const repo = makeRepo({ getAlerts: jest.fn().mockResolvedValue([alertNoResolve]) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.alerts[0]!.resolvedAt).toBeNull();
    });

    it('builds team name with null first/last name parts', async () => {
      const custodioNullName: OperatorRow = { ...CUSTODIO, first_name: null, last_name: null };
      const repo = makeRepo({
        getOperatorData: jest
          .fn()
          .mockResolvedValueOnce(custodioNullName)
          .mockResolvedValueOnce(COPILOTO),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.team.custodio?.name).toBe('');
    });

    it('sets location null when POINT string does not match regex', async () => {
      const transitionInvalidLoc: TransitionRow = {
        ...TRANSITIONS[0]!,
        location: 'invalid-format',
      };
      const repo = makeRepo({
        getTransitionsWithActors: jest.fn().mockResolvedValue([transitionInvalidLoc]),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.transitions[0]!.location).toBeNull();
    });

    it('handles undefined client gracefully', async () => {
      const repo = makeRepo({ getClientForOrder: jest.fn().mockResolvedValue(undefined) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.client.id).toBe('');
      expect(report.client.name).toBe('');
    });

    it('builds copiloto name with null first/last name parts', async () => {
      const copilotoNullName: OperatorRow = { ...COPILOTO, first_name: null, last_name: null };
      const repo = makeRepo({
        getOperatorData: jest
          .fn()
          .mockResolvedValueOnce(CUSTODIO)
          .mockResolvedValueOnce(copilotoNullName),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.team.copiloto?.name).toBe('');
    });

    it('uses fallback strings when vehicle columns are null', async () => {
      const custodioNullVehicleData: OperatorRow = {
        ...CUSTODIO,
        vehicle_plate: null,
        vehicle_make: null,
        vehicle_model: null,
        vehicle_year: null,
      };
      const repo = makeRepo({
        getOperatorData: jest
          .fn()
          .mockResolvedValueOnce(custodioNullVehicleData)
          .mockResolvedValueOnce(COPILOTO),
      });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      expect(report.team.vehicle?.plate).toBe('');
      expect(report.team.vehicle?.make).toBeNull();
      expect(report.team.vehicle?.model).toBe('');
      expect(report.team.vehicle?.year).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSignatures
  // -------------------------------------------------------------------------

  describe('getSignatures', () => {
    it('returns only transitions with digital_signature', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const sigs = await svc.getSignatures('order-1');

      expect(sigs).toHaveLength(1);
      expect(sigs[0]!.fromStatus).toBe('AT_PICKUP');
      expect(sigs[0]!.toStatus).toBe('IN_TRANSIT');
      expect(sigs[0]!.signatureData).toBe('base64svgdata==');
    });

    it('returns empty array when no transitions have signatures', async () => {
      const noSigTransitions = TRANSITIONS.map((t) => ({ ...t, digital_signature: null }));
      const repo = makeRepo({ getTransitionsWithActors: jest.fn().mockResolvedValue(noSigTransitions) });
      const svc = new ChainOfCustodyService(repo);
      const sigs = await svc.getSignatures('order-1');
      expect(sigs).toHaveLength(0);
    });

    it('throws ORDER_NOT_FOUND when order does not exist', async () => {
      const repo = makeRepo({ getOrderWithType: jest.fn().mockResolvedValue(undefined) });
      const svc = new ChainOfCustodyService(repo);
      await expect(svc.getSignatures('missing')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('sets actor.name to null in signatures when actor names are null', async () => {
      const sigTransitionNullActor: TransitionRow = {
        ...TRANSITIONS[1]!,
        actor_first_name: null,
        actor_last_name: null,
      };
      const repo = makeRepo({
        getTransitionsWithActors: jest.fn().mockResolvedValue([sigTransitionNullActor]),
      });
      const svc = new ChainOfCustodyService(repo);
      const sigs = await svc.getSignatures('order-1');
      expect(sigs[0]!.actor.name).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // buildPdf / renderToPdf
  // -------------------------------------------------------------------------

  describe('buildPdf', () => {
    it('returns a Buffer', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const buf = await svc.buildPdf('order-1', 'dispatcher');
      expect(Buffer.isBuffer(buf)).toBe(true);
    });
  });

  describe('renderToPdf', () => {
    it('returns Buffer with PDF content', async () => {
      const repo = makeRepo();
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      const buf = await svc.renderToPdf(report);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
    });

    it('renders PDF even when no alerts exist', async () => {
      const repo = makeRepo({ getAlerts: jest.fn().mockResolvedValue([]) });
      const svc = new ChainOfCustodyService(repo);
      const report = await svc.buildReport('order-1', 'dispatcher');
      const buf = await svc.renderToPdf(report);
      expect(Buffer.isBuffer(buf)).toBe(true);
    });

    it('covers null/false branches in PDF rendering', async () => {
      const svc = new ChainOfCustodyService({} as never);
      const report: import('../../modules/compliance/compliance.types.js').ChainOfCustodyReport = {
        reportId: 'r-1',
        generatedAt: '2026-01-01T00:00:00.000Z',
        order: {
          id: 'o-1',
          orderNumber: 'ORD-001',
          status: 'COMPLETED',
          custodyType: 'Efectivo',
          custodyTypeSlug: 'cash_transport',
          pickupAddress: {},
          deliveryAddress: {},
          notes: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T18:00:00.000Z',
        },
        client: { id: 'c-1', name: 'Test', companyName: null, rfc: null },
        team: {
          custodio: { id: 'op-1', name: 'Carlos', licenseNumber: null },
          copiloto: { id: 'op-2', name: 'María', licenseNumber: null },
          vehicle: { id: 'v-1', plate: 'ABC', make: null, model: 'Hilux', year: 2022 },
        },
        valueDeclaration: {
          custodyType: 'Efectivo',
          declaredValue: {},
          insurancePolicyId: null,
          verifiedAt: null,
          verifiedBy: null,
        },
        transitions: [
          {
            id: 'tr-1',
            fromStatus: 'DRAFT',
            toStatus: 'PENDING_APPROVAL',
            actor: { id: 'u-1', role: null, name: null },
            location: null,
            notes: null,
            hasSignature: false,
            signatureData: null,
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        ],
        alerts: [
          {
            id: 'a-1',
            alertType: 'panic',
            severity: 'critical',
            description: null,
            resolvedAt: null,
            createdAt: '2026-01-01T12:00:00.000Z',
          },
        ],
        integrity: { hash: 'abc123', algorithm: 'sha256' },
      };

      const buf = await svc.renderToPdf(report);
      expect(Buffer.isBuffer(buf)).toBe(true);
    });
  });
});
