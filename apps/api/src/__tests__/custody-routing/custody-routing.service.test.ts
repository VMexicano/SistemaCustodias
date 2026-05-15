import { CustodyRoutingService } from '../../modules/custody-routing/custody-routing.service.js';
import type { CustodyRoutingRepository } from '../../modules/custody-routing/custody-routing.repository.js';
import type { CustodyRoute, Waypoint } from '../../modules/custody-routing/custody-routing.types.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  status: string;
  pickup_address: { lat: number; lng: number } | null;
  delivery_address: { lat: number; lng: number } | null;
}

const ORDER_ROW: OrderRow = {
  id: 'order-1',
  status: 'APPROVED',
  pickup_address: { lat: 19.4326, lng: -99.1332 },
  delivery_address: { lat: 19.4200, lng: -99.1450 },
};

const ROUTE: CustodyRoute = {
  id: 'route-1',
  orderId: 'order-1',
  waypoints: [],
  totalDistanceKm: null,
  estimatedDurationMinutes: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const WAYPOINTS: Waypoint[] = [
  { lat: 19.4280, lng: -99.1380, label: 'Checkpoint A' },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRepo = {
  findByOrderId: jest.fn(),
  upsert: jest.fn(),
  approve: jest.fn(),
} as unknown as jest.Mocked<CustodyRoutingRepository>;

function makeDb(orderRow: typeof ORDER_ROW | null = ORDER_ROW): Knex {
  return {
    raw: jest.fn().mockResolvedValue({ rows: orderRow ? [orderRow] : [] }),
  } as unknown as Knex;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(db?: Knex): CustodyRoutingService {
  return new CustodyRoutingService(mockRepo, db ?? makeDb());
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// planRoute
// ---------------------------------------------------------------------------

describe('CustodyRoutingService.planRoute', () => {
  it('happy path — creates route with distance and duration', async () => {
    const expectedRoute: CustodyRoute = {
      ...ROUTE,
      waypoints: WAYPOINTS,
      totalDistanceKm: expect.any(Number),
      estimatedDurationMinutes: expect.any(Number),
    };
    mockRepo.upsert.mockResolvedValue(expectedRoute);

    const svc = makeService();
    const result = await svc.planRoute('order-1', WAYPOINTS);

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        waypoints: WAYPOINTS,
        totalDistanceKm: expect.any(Number),
        estimatedDurationMinutes: expect.any(Number),
      }),
    );
    expect(result).toEqual(expectedRoute);
  });

  it('happy path — empty waypoints still computes pickup→delivery distance', async () => {
    mockRepo.upsert.mockResolvedValue(ROUTE);
    const svc = makeService();
    await svc.planRoute('order-1', []);

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        waypoints: [],
        totalDistanceKm: expect.any(Number),
        estimatedDurationMinutes: expect.any(Number),
      }),
    );
  });

  it('computes null distance when pickup address has no coordinates', async () => {
    const db = makeDb({ ...ORDER_ROW, pickup_address: null });
    mockRepo.upsert.mockResolvedValue(ROUTE);
    const svc = makeService(db);
    await svc.planRoute('order-1', []);

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ totalDistanceKm: null, estimatedDurationMinutes: null }),
    );
  });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const db = makeDb(null);
    const svc = makeService(db);

    await expect(svc.planRoute('order-x', [])).rejects.toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
    );
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it('throws ORDER_NOT_PLANNABLE when order status is DRAFT', async () => {
    const db = makeDb({ ...ORDER_ROW, status: 'DRAFT' });
    const svc = makeService(db);

    await expect(svc.planRoute('order-1', [])).rejects.toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_PLANNABLE' }),
    );
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it('throws ORDER_NOT_PLANNABLE when order status is COMPLETED', async () => {
    const db = makeDb({ ...ORDER_ROW, status: 'COMPLETED' });
    const svc = makeService(db);

    await expect(svc.planRoute('order-1', [])).rejects.toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_PLANNABLE' }),
    );
  });

  it('updates existing route (upsert called with correct orderId)', async () => {
    const updatedRoute: CustodyRoute = { ...ROUTE, waypoints: WAYPOINTS };
    mockRepo.upsert.mockResolvedValue(updatedRoute);
    const svc = makeService();

    const result = await svc.planRoute('order-1', WAYPOINTS);
    expect(result.waypoints).toEqual(WAYPOINTS);
    expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('PLANNABLE_STATUSES — ASSIGNED is accepted', async () => {
    const db = makeDb({ ...ORDER_ROW, status: 'ASSIGNED' });
    mockRepo.upsert.mockResolvedValue(ROUTE);
    const svc = makeService(db);
    await expect(svc.planRoute('order-1', [])).resolves.toBeDefined();
  });

  it('PLANNABLE_STATUSES — CREW_CONFIRMED is accepted', async () => {
    const db = makeDb({ ...ORDER_ROW, status: 'CREW_CONFIRMED' });
    mockRepo.upsert.mockResolvedValue(ROUTE);
    const svc = makeService(db);
    await expect(svc.planRoute('order-1', [])).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRoute
// ---------------------------------------------------------------------------

describe('CustodyRoutingService.getRoute', () => {
  it('happy path — returns existing route', async () => {
    mockRepo.findByOrderId.mockResolvedValue(ROUTE);
    const svc = makeService();
    const result = await svc.getRoute('order-1');
    expect(result).toEqual(ROUTE);
  });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const db = makeDb(null);
    const svc = makeService(db);
    await expect(svc.getRoute('order-x')).rejects.toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
    );
  });

  it('throws ROUTE_NOT_FOUND when no route exists for order', async () => {
    mockRepo.findByOrderId.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.getRoute('order-1')).rejects.toThrow(
      expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }),
    );
  });
});

// ---------------------------------------------------------------------------
// approveRoute
// ---------------------------------------------------------------------------

describe('CustodyRoutingService.approveRoute', () => {
  it('happy path — returns approved route', async () => {
    const approved: CustodyRoute = {
      ...ROUTE,
      approvedBy: 'supervisor-1',
      approvedAt: '2026-01-01T12:00:00.000Z',
    };
    mockRepo.approve.mockResolvedValue(approved);
    const svc = makeService();
    const result = await svc.approveRoute('order-1', 'supervisor-1');
    expect(result).toEqual(approved);
    expect(mockRepo.approve).toHaveBeenCalledWith('order-1', 'supervisor-1');
  });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const db = makeDb(null);
    const svc = makeService(db);
    await expect(svc.approveRoute('order-x', 'supervisor-1')).rejects.toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
    );
  });

  it('throws ROUTE_NOT_FOUND when no route to approve', async () => {
    mockRepo.approve.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.approveRoute('order-1', 'supervisor-1')).rejects.toThrow(
      expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }),
    );
  });
});

// ---------------------------------------------------------------------------
// getRoutePolyline
// ---------------------------------------------------------------------------

describe('CustodyRoutingService.getRoutePolyline', () => {
  it('returns null when no route exists', async () => {
    mockRepo.findByOrderId.mockResolvedValue(null);
    const svc = makeService();
    const result = await svc.getRoutePolyline('order-1');
    expect(result).toBeNull();
  });

  it('returns null when route has empty waypoints', async () => {
    mockRepo.findByOrderId.mockResolvedValue({ ...ROUTE, waypoints: [] });
    const svc = makeService();
    const result = await svc.getRoutePolyline('order-1');
    expect(result).toBeNull();
  });

  it('returns polyline with waypoints when route exists', async () => {
    mockRepo.findByOrderId.mockResolvedValue({ ...ROUTE, waypoints: WAYPOINTS });
    const svc = makeService();
    const result = await svc.getRoutePolyline('order-1');
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    expect(result).toContainEqual(expect.objectContaining({ lat: WAYPOINTS[0]!.lat }));
  });

  it('includes pickup and delivery endpoints in polyline', async () => {
    mockRepo.findByOrderId.mockResolvedValue({ ...ROUTE, waypoints: WAYPOINTS });
    const svc = makeService();
    const result = await svc.getRoutePolyline('order-1');
    const pickup = ORDER_ROW.pickup_address!;
    const delivery = ORDER_ROW.delivery_address!;
    expect(result![0]).toEqual({ lat: pickup.lat, lng: pickup.lng });
    expect(result![result!.length - 1]).toEqual({ lat: delivery.lat, lng: delivery.lng });
  });

  it('returns null when polyline has fewer than 2 points (no pickup/delivery coords)', async () => {
    const db = makeDb({ ...ORDER_ROW, pickup_address: null, delivery_address: null });
    mockRepo.findByOrderId.mockResolvedValue({ ...ROUTE, waypoints: [] });
    const svc = makeService(db);
    const result = await svc.getRoutePolyline('order-1');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Distance computation (integration-style through planRoute)
// ---------------------------------------------------------------------------

describe('distance computation', () => {
  it('computes positive distance for two non-identical points', async () => {
    mockRepo.upsert.mockImplementation(async (payload) => ({
      ...ROUTE,
      ...payload,
      id: 'route-1',
      createdAt: ROUTE.createdAt,
      updatedAt: ROUTE.updatedAt,
    }));
    const svc = makeService();
    await svc.planRoute('order-1', []);

    const call = mockRepo.upsert.mock.calls[0]![0];
    expect(call.totalDistanceKm).toBeGreaterThan(0);
    expect(call.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it('estimated duration is distance / 60 kmh * 60 minutes (rounded)', async () => {
    mockRepo.upsert.mockImplementation(async (payload) => ({
      ...ROUTE,
      ...payload,
      id: 'route-1',
      createdAt: ROUTE.createdAt,
      updatedAt: ROUTE.updatedAt,
    }));
    const svc = makeService();
    await svc.planRoute('order-1', []);

    const call = mockRepo.upsert.mock.calls[0]![0];
    const expectedDuration = Math.round((call.totalDistanceKm! / 60) * 60);
    expect(call.estimatedDurationMinutes).toBe(expectedDuration);
  });
});
