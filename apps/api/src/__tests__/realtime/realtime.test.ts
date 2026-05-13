/**
 * realtime.test.ts — WebSocket / Socket.io unit tests (TRIP-004)
 *
 * Tests the two namespaces (/passenger and /driver) in isolation using
 * socket.io-client connected to a live Fastify + Socket.io instance.
 * No real database or Redis is required — all dependencies are mocked.
 *
 * Coverage:
 *   - JWT auth middleware (missing token, expired, valid, wrong role)
 *   - /passenger: receives trip:status_changed, driver:location
 *   - /driver: receives trip:requested, trip:cancelled, trip:destination_changed
 *             location:update persists to Redis + emits to passenger
 *   - Room management: join on connection, leave on terminal state
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { io as Client } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

import { JWTService } from '../../modules/auth/jwt.service.js';
import { buildRealtimePlugin, getIO, joinTripRoom, leaveTripRoom } from '../../modules/realtime/realtime.plugin.js';
import {
  emitTripStatusChanged,
  emitTripRequested,
  emitTripCancelled,
  emitDestinationChanged,
} from '../../modules/realtime/realtime.events.js';
import type { TripsRepository } from '../../modules/trips/trips.repository.js';
import type { Database } from '../../config/database.js';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(
  jwtService: JWTService,
  role: 'passenger' | 'driver' | 'admin' = 'passenger',
  userId = 'user-1',
): string {
  return jwtService.signAccess({ sub: userId, roles: [role], region: 'mx' });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${event}'`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectAndWait(
  url: string,
  namespace: string,
  token?: string,
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = Client(`${url}${namespace}`, {
      auth: token ? { token } : {},
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    socket.connect();
  });
}

function connectAndExpectError(
  url: string,
  namespace: string,
  token?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = Client(`${url}${namespace}`, {
      auth: token ? { token } : {},
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect_error', (err) => {
      socket.disconnect();
      resolve(err.message);
    });
    socket.on('connect', () => {
      socket.disconnect();
      reject(new Error('Expected connection error but connected successfully'));
    });
    socket.connect();
  });
}

/** Wait for a short delay to allow async server-side operations */
const tick = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  hset: jest.fn().mockResolvedValue(1),
} as unknown as Redis;

const mockTripsRepo = {
  findActiveByPassengerId: jest.fn().mockResolvedValue(null),
} as unknown as TripsRepository;

const mockDb = {
  raw: jest.fn().mockResolvedValue({ rows: [] }),
} as unknown as Database;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WebSocket — realtime module', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let jwtService: JWTService;

  beforeAll(async () => {
    process.env['JWT_SECRET'] = 'test-secret-minimum-32-characters-long-for-testing';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-minimum-32-chars-long-test';
    process.env['JWT_ACCESS_EXPIRES_IN'] = '15m';
    process.env['JWT_REFRESH_EXPIRES_IN'] = '30d';

    jwtService = new JWTService();

    app = Fastify({ logger: false });

    await app.register(
      buildRealtimePlugin(jwtService, mockTripsRepo, mockRedis, mockDb),
    );

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${addr.port}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  }, 15_000);

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue(null);
    (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [] });
    (mockRedis.hset as jest.Mock).mockResolvedValue(1);
  });

  // -------------------------------------------------------------------------
  // Auth JWT — /passenger namespace
  // -------------------------------------------------------------------------

  describe('Auth JWT — /passenger namespace', () => {
    it('rechaza conexión sin JWT', async () => {
      const errMsg = await connectAndExpectError(serverUrl, '/passenger');
      expect(errMsg).toBe('UNAUTHORIZED');
    });

    it('rechaza conexión con JWT inválido', async () => {
      const errMsg = await connectAndExpectError(serverUrl, '/passenger', 'invalid.token.here');
      expect(errMsg).toBe('UNAUTHORIZED');
    });

    it('rechaza conexión con JWT expirado', async () => {
      // Sign a token that expired 1 second ago using the same secret
      const expiredToken = jwt.sign(
        { sub: 'pax-expired', roles: ['passenger'], region: 'mx' },
        'test-secret-minimum-32-characters-long-for-testing',
        { expiresIn: -1 },
      );
      const errMsg = await connectAndExpectError(serverUrl, '/passenger', expiredToken);
      expect(errMsg).toBe('UNAUTHORIZED');
    });

    it('rechaza conexión de driver en /passenger (role incorrecto)', async () => {
      const token = makeToken(jwtService, 'driver', 'driver-user-x');
      const errMsg = await connectAndExpectError(serverUrl, '/passenger', token);
      expect(errMsg).toBe('FORBIDDEN');
    });

    it('acepta conexión con JWT válido de pasajero', async () => {
      const token = makeToken(jwtService, 'passenger', 'pax-auth-1');
      const socket = await connectAndWait(serverUrl, '/passenger', token);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Auth JWT — /driver namespace
  // -------------------------------------------------------------------------

  describe('Auth JWT — /driver namespace', () => {
    it('rechaza conexión sin JWT', async () => {
      const errMsg = await connectAndExpectError(serverUrl, '/driver');
      expect(errMsg).toBe('UNAUTHORIZED');
    });

    it('rechaza conexión con JWT inválido', async () => {
      const errMsg = await connectAndExpectError(serverUrl, '/driver', 'bad.token');
      expect(errMsg).toBe('UNAUTHORIZED');
    });

    it('rechaza conexión de passenger en /driver (role incorrecto)', async () => {
      const token = makeToken(jwtService, 'passenger', 'pax-x');
      const errMsg = await connectAndExpectError(serverUrl, '/driver', token);
      expect(errMsg).toBe('FORBIDDEN');
    });

    it('acepta conexión con JWT válido de driver', async () => {
      const token = makeToken(jwtService, 'driver', 'drv-auth-1');
      const socket = await connectAndWait(serverUrl, '/driver', token);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // /passenger namespace — events
  // -------------------------------------------------------------------------

  describe('Namespace /passenger', () => {
    it('recibe trip:status_changed cuando el viaje transiciona de estado', async () => {
      const tripId = 'trip-status-test';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: tripId,
        status: 'SEARCHING',
      });

      const paxToken = makeToken(jwtService, 'passenger', 'pax-status-1');
      const paxSocket = await connectAndWait(serverUrl, '/passenger', paxToken);

      // Allow server-side room join to complete
      await tick(200);

      const eventPromise = waitForEvent<{ trip_id: string; status: string; driver?: { full_name: string } }>(
        paxSocket,
        'trip:status_changed',
      );

      emitTripStatusChanged(getIO(), tripId, 'ACCEPTED', {
        id: 'drv-1',
        full_name: 'Juan',
        vehicle: 'Nissan Sentra',
        rating_avg: 4.8,
      });

      const payload = await eventPromise;
      expect(payload.trip_id).toBe(tripId);
      expect(payload.status).toBe('ACCEPTED');
      expect(payload.driver?.full_name).toBe('Juan');

      paxSocket.disconnect();
    });

    it('recibe driver:location cuando el driver emite location:update', async () => {
      const tripId = 'trip-loc-test';
      const paxUserId = 'pax-loc-2';
      const driverUserId = 'drv-loc-2';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: tripId,
        status: 'DRIVER_EN_ROUTE',
      });
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [{ id: tripId }] });

      const paxToken = makeToken(jwtService, 'passenger', paxUserId);
      const drvToken = makeToken(jwtService, 'driver', driverUserId);

      const [paxSocket, drvSocket] = await Promise.all([
        connectAndWait(serverUrl, '/passenger', paxToken),
        connectAndWait(serverUrl, '/driver', drvToken),
      ]);

      // Allow server-side room joins to complete
      await tick(300);

      const locationPromise = waitForEvent<{
        trip_id: string;
        lat: number;
        lng: number;
        timestamp: string;
      }>(paxSocket, 'driver:location');

      drvSocket.emit('location:update', { lat: 19.43, lng: -99.13 });

      const loc = await locationPromise;
      expect(loc.trip_id).toBe(tripId);
      expect(loc.lat).toBe(19.43);
      expect(loc.lng).toBe(-99.13);
      expect(typeof loc.timestamp).toBe('string');

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `driver:${driverUserId}:location`,
        expect.objectContaining({ lat: '19.43', lng: '-99.13' }),
      );

      paxSocket.disconnect();
      drvSocket.disconnect();
    });

    it('no recibe eventos de viajes de otros pasajeros', async () => {
      const myTripId = 'trip-mine-2';
      const otherTripId = 'trip-other-2';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: myTripId,
        status: 'SEARCHING',
      });

      const paxToken = makeToken(jwtService, 'passenger', 'pax-isolated-2');
      const paxSocket = await connectAndWait(serverUrl, '/passenger', paxToken);

      await tick(200);

      let received = false;
      paxSocket.on('trip:status_changed', () => { received = true; });

      // Emit to a different trip room — should NOT reach our passenger
      emitTripStatusChanged(getIO(), otherTripId, 'CANCELLED');

      await tick(300);
      expect(received).toBe(false);

      paxSocket.disconnect();
    });

    it('recibe trip:destination_changed como pasajero del viaje', async () => {
      const tripId = 'trip-dest-pax';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: tripId,
        status: 'IN_PROGRESS',
      });

      const paxToken = makeToken(jwtService, 'passenger', 'pax-dest-1');
      const paxSocket = await connectAndWait(serverUrl, '/passenger', paxToken);

      await tick(200);

      const eventPromise = waitForEvent<{ trip_id: string; new_estimated_fare: number }>(
        paxSocket,
        'trip:destination_changed',
      );

      emitDestinationChanged(getIO(), tripId, {
        trip_id: tripId,
        new_destination: { lat: 19.55, lng: -99.25, address: 'Nuevo destino' },
        new_estimated_fare: 200,
      });

      const event = await eventPromise;
      expect(event.trip_id).toBe(tripId);
      expect(event.new_estimated_fare).toBe(200);

      paxSocket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // /driver namespace — events
  // -------------------------------------------------------------------------

  describe('Namespace /driver', () => {
    it('recibe trip:requested cuando hay una solicitud en su radio', async () => {
      const drvToken = makeToken(jwtService, 'driver', 'drv-req-1');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      const eventPromise = waitForEvent<{ id: string; estimatedTotal: number }>(
        drvSocket,
        'trip:requested',
      );

      const payload = {
        id: 'trip-new-1',
        originAddress: 'Centro',
        destinationAddress: 'Polanco',
        estimatedDistanceKm: 8.5,
        estimatedTotal: 120,
        passengerId: 'pax-1',
        originLat: 19.43,
        originLng: -99.13,
        destinationLat: 19.5,
        destinationLng: -99.2,
      };
      emitTripRequested(getIO(), payload.id, payload);

      const received = await eventPromise;
      expect(received.id).toBe('trip-new-1');
      expect(received.estimatedTotal).toBe(120);

      drvSocket.disconnect();
    });

    it('recibe trip:cancelled cuando el pasajero cancela', async () => {
      const tripId = 'trip-cancel-drv-2';
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [{ id: tripId }] });

      const drvToken = makeToken(jwtService, 'driver', 'drv-cancel-2');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      await tick(200);

      const eventPromise = waitForEvent<{ trip_id: string; reason: string }>(
        drvSocket,
        'trip:cancelled',
      );

      emitTripCancelled(getIO(), tripId, 'Passenger cancelled before 120s');

      const received = await eventPromise;
      expect(received.trip_id).toBe(tripId);
      expect(received.reason).toContain('Passenger cancelled');

      drvSocket.disconnect();
    });

    it('recibe trip:destination_changed cuando el pasajero cambia destino mid-trip', async () => {
      const tripId = 'trip-dest-change-2';
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [{ id: tripId }] });

      const drvToken = makeToken(jwtService, 'driver', 'drv-dest-2');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      await tick(200);

      const eventPromise = waitForEvent<{ trip_id: string; new_estimated_fare: number }>(
        drvSocket,
        'trip:destination_changed',
      );

      emitDestinationChanged(getIO(), tripId, {
        trip_id: tripId,
        new_destination: { lat: 19.55, lng: -99.25, address: 'Nuevo destino' },
        new_estimated_fare: 180,
      });

      const received = await eventPromise;
      expect(received.trip_id).toBe(tripId);
      expect(received.new_estimated_fare).toBe(180);

      drvSocket.disconnect();
    });

    it('location:update persiste coordenada en Redis (HSET driver:{id}:location)', async () => {
      const driverUserId = 'drv-redis-persist-3';
      const drvToken = makeToken(jwtService, 'driver', driverUserId);
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      drvSocket.emit('location:update', { lat: 19.4326, lng: -99.1332 });

      await tick(300);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `driver:${driverUserId}:location`,
        expect.objectContaining({
          lat: '19.4326',
          lng: '-99.1332',
        }),
      );

      drvSocket.disconnect();
    });

    it('location:update ignora payloads con valores no numéricos', async () => {
      const drvToken = makeToken(jwtService, 'driver', 'drv-bad-payload-4');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      // Send invalid payload
      drvSocket.emit('location:update', { lat: 'not-a-number', lng: null });

      await tick(300);

      expect(mockRedis.hset).not.toHaveBeenCalled();

      drvSocket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Room management
  // -------------------------------------------------------------------------

  describe('Room management', () => {
    it('pasajero y driver del mismo viaje están en room trip:{trip_id}', async () => {
      const tripId = 'trip-room-shared';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: tripId,
        status: 'ACCEPTED',
      });
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [{ id: tripId }] });

      const paxToken = makeToken(jwtService, 'passenger', 'pax-room-shared');
      const drvToken = makeToken(jwtService, 'driver', 'drv-room-shared');

      const [paxSocket, drvSocket] = await Promise.all([
        connectAndWait(serverUrl, '/passenger', paxToken),
        connectAndWait(serverUrl, '/driver', drvToken),
      ]);

      await tick(300);

      // Both should receive events addressed to that room
      const paxEventPromise = waitForEvent<{ trip_id: string }>(paxSocket, 'trip:status_changed');
      emitTripStatusChanged(getIO(), tripId, 'DRIVER_EN_ROUTE');

      const paxEvent = await paxEventPromise;
      expect(paxEvent.trip_id).toBe(tripId);

      const drvEventPromise = waitForEvent<{ trip_id: string }>(drvSocket, 'trip:cancelled');
      emitTripCancelled(getIO(), tripId, 'test-cancel');
      const drvEvent = await drvEventPromise;
      expect(drvEvent.trip_id).toBe(tripId);

      paxSocket.disconnect();
      drvSocket.disconnect();
    });

    it('pasajero se une al room trip:{tripId} si tiene viaje activo al conectar', async () => {
      const tripId = 'trip-auto-join-pax';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue({
        id: tripId,
        status: 'ACCEPTED',
      });

      const paxToken = makeToken(jwtService, 'passenger', 'pax-auto-join');
      const paxSocket = await connectAndWait(serverUrl, '/passenger', paxToken);

      await tick(200);

      const eventPromise = waitForEvent<{ status: string }>(paxSocket, 'trip:status_changed');
      emitTripStatusChanged(getIO(), tripId, 'DRIVER_EN_ROUTE');

      const event = await eventPromise;
      expect(event.status).toBe('DRIVER_EN_ROUTE');

      paxSocket.disconnect();
    });

    it('driver se une al room trip:{tripId} si tiene viaje activo al conectar', async () => {
      const tripId = 'trip-auto-join-drv';
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [{ id: tripId }] });

      const drvToken = makeToken(jwtService, 'driver', 'drv-auto-join');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      await tick(200);

      const cancelledPromise = waitForEvent<{ trip_id: string }>(drvSocket, 'trip:cancelled');
      emitTripCancelled(getIO(), tripId, 'test');

      const event = await cancelledPromise;
      expect(event.trip_id).toBe(tripId);

      drvSocket.disconnect();
    });

    it('joinTripRoom coloca pasajero y driver en room trip:{tripId} y ambos reciben eventos', async () => {
      const tripId = 'trip-join-helper';
      const paxUserId = 'pax-join-helper';
      const drvUserId = 'drv-join-helper';

      // Connect without active trip so they don't auto-join
      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue(null);
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [] });

      const paxToken = makeToken(jwtService, 'passenger', paxUserId);
      const drvToken = makeToken(jwtService, 'driver', drvUserId);

      const [paxSocket, drvSocket] = await Promise.all([
        connectAndWait(serverUrl, '/passenger', paxToken),
        connectAndWait(serverUrl, '/driver', drvToken),
      ]);

      await tick(200);

      // Manually call joinTripRoom helper
      await joinTripRoom(getIO(), tripId, paxUserId, drvUserId);

      // Both should now receive events addressed to that room
      const paxEventPromise = waitForEvent<{ trip_id: string }>(paxSocket, 'trip:status_changed');
      emitTripStatusChanged(getIO(), tripId, 'IN_PROGRESS');

      const paxEvent = await paxEventPromise;
      expect(paxEvent.trip_id).toBe(tripId);

      const drvEventPromise = waitForEvent<{ trip_id: string }>(drvSocket, 'trip:cancelled');
      emitTripCancelled(getIO(), tripId, 'test-join-helper');
      const drvEvent = await drvEventPromise;
      expect(drvEvent.trip_id).toBe(tripId);

      paxSocket.disconnect();
      drvSocket.disconnect();
    });

    it('leaveTripRoom elimina pasajero y driver del room y dejan de recibir eventos', async () => {
      const tripId = 'trip-leave-helper';
      const paxUserId = 'pax-leave-helper';
      const drvUserId = 'drv-leave-helper';

      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockResolvedValue(null);
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [] });

      const paxToken = makeToken(jwtService, 'passenger', paxUserId);
      const drvToken = makeToken(jwtService, 'driver', drvUserId);

      const [paxSocket, drvSocket] = await Promise.all([
        connectAndWait(serverUrl, '/passenger', paxToken),
        connectAndWait(serverUrl, '/driver', drvToken),
      ]);

      await tick(200);

      // Join both into the room
      await joinTripRoom(getIO(), tripId, paxUserId, drvUserId);

      // Now leave the room
      await leaveTripRoom(getIO(), tripId);

      // Neither should receive events after leaving
      let paxReceived = false;
      let drvReceived = false;
      paxSocket.on('trip:status_changed', () => { paxReceived = true; });
      drvSocket.on('trip:cancelled', () => { drvReceived = true; });

      emitTripStatusChanged(getIO(), tripId, 'COMPLETED');
      emitTripCancelled(getIO(), tripId, 'after-leave');

      await tick(300);
      expect(paxReceived).toBe(false);
      expect(drvReceived).toBe(false);

      paxSocket.disconnect();
      drvSocket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling paths
  // -------------------------------------------------------------------------

  describe('Error handling — connection handlers', () => {
    it('sigue funcionando si tripsRepo.findActiveByPassengerId lanza error al conectar', async () => {
      (mockTripsRepo.findActiveByPassengerId as jest.Mock).mockRejectedValue(
        new Error('DB connection lost'),
      );

      const paxToken = makeToken(jwtService, 'passenger', 'pax-err-handler');
      // Connection should still succeed — error is caught and logged
      const paxSocket = await connectAndWait(serverUrl, '/passenger', paxToken);
      expect(paxSocket.connected).toBe(true);
      paxSocket.disconnect();
    });

    it('sigue funcionando si db.raw lanza error al conectar driver', async () => {
      (mockDb.raw as jest.Mock).mockRejectedValue(new Error('DB timeout'));

      const drvToken = makeToken(jwtService, 'driver', 'drv-err-handler');
      // Connection should still succeed — error is caught and logged
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);
      expect(drvSocket.connected).toBe(true);
      drvSocket.disconnect();
    });

    it('location:update sigue procesando si Redis.hset lanza error', async () => {
      (mockRedis.hset as jest.Mock).mockRejectedValue(new Error('Redis unavailable'));
      (mockDb.raw as jest.Mock).mockResolvedValue({ rows: [] });

      const drvToken = makeToken(jwtService, 'driver', 'drv-redis-err');
      const drvSocket = await connectAndWait(serverUrl, '/driver', drvToken);

      // Should not throw — error is caught internally
      drvSocket.emit('location:update', { lat: 19.43, lng: -99.13 });

      await tick(300);
      // Redis was called but threw — no crash
      expect(mockRedis.hset).toHaveBeenCalled();

      drvSocket.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // getIO() singleton
  // -------------------------------------------------------------------------

  describe('getIO() singleton', () => {
    it('getIO() retorna el servidor Socket.io después de inicializar el plugin', () => {
      // getIO() is initialized in beforeAll via buildRealtimePlugin
      const io = getIO();
      expect(io).toBeDefined();
      expect(typeof io.of).toBe('function');
    });
  });
});
