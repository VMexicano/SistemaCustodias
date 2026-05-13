import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import type { JWTService } from '../auth/jwt.service.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import type { Database } from '../../config/database.js';
import type { LocationUpdatePayload, SocketData } from './realtime.types.js';

// ---------------------------------------------------------------------------
// Module-level singleton — getIO() allows other modules to access the server
// ---------------------------------------------------------------------------

let _io: Server | null = null;

export function getIO(): Server {
  if (!_io) {
    throw new Error('Socket.io server not initialized — call buildRealtimePlugin first');
  }
  return _io;
}

// ---------------------------------------------------------------------------
// Auth middleware factory
// ---------------------------------------------------------------------------

function buildAuthMiddleware(
  jwtService: JWTService,
  requiredRole?: string,
) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token = (socket.handshake.auth as Record<string, unknown>)?.['token'] as string | undefined;
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }
    try {
      const payload = jwtService.verify(token);
      const data = socket.data as SocketData;
      data.userId = payload.sub;
      data.roles = payload.roles;

      if (requiredRole && !payload.roles.includes(requiredRole)) {
        return next(new Error('FORBIDDEN'));
      }

      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  };
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function buildRealtimePlugin(
  jwtService: JWTService,
  tripsRepo: TripsRepository,
  redis: Redis,
  db: Database,
) {
  return async function realtimePlugin(fastify: FastifyInstance): Promise<void> {
    const io = new Server(fastify.server, {
      cors: { origin: '*' },
    });

    _io = io;

    // -----------------------------------------------------------------------
    // /passenger namespace — JWT required, role: passenger
    // -----------------------------------------------------------------------

    const passenger = io.of('/passenger');
    passenger.use(buildAuthMiddleware(jwtService, 'passenger'));

    passenger.on('connection', async (socket) => {
      const { userId } = socket.data as SocketData;
      fastify.log.info({ userId }, '[WS /passenger] connected');

      // If passenger has an active trip, join its room immediately
      try {
        const activeTrip = await tripsRepo.findActiveByPassengerId(userId);
        if (activeTrip) {
          await socket.join(`trip:${activeTrip.id}`);
          fastify.log.debug({ userId, tripId: activeTrip.id }, '[WS /passenger] joined trip room');
        }
      } catch (err) {
        fastify.log.error({ err }, '[WS /passenger] error fetching active trip');
      }

      socket.on('disconnect', () => {
        fastify.log.info({ userId }, '[WS /passenger] disconnected');
      });
    });

    // -----------------------------------------------------------------------
    // /driver namespace — JWT required, role: driver
    // -----------------------------------------------------------------------

    const driverNs = io.of('/driver');
    driverNs.use(buildAuthMiddleware(jwtService, 'driver'));

    driverNs.on('connection', async (socket) => {
      const { userId } = socket.data as SocketData;
      fastify.log.info({ userId }, '[WS /driver] connected');

      // If driver has an active trip, join its room immediately
      try {
        const result = await db.raw<{ rows: Array<{ id: string }> }>(
          `SELECT t.id FROM trips t
           JOIN drivers d ON d.id = t.driver_id
           WHERE d.user_id = ? AND t.status IN (
             'ACCEPTED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS'
           ) AND t.deleted_at IS NULL LIMIT 1`,
          [userId],
        );
        const activeRow = result.rows?.[0];
        if (activeRow) {
          await socket.join(`trip:${activeRow.id}`);
          fastify.log.debug({ userId, tripId: activeRow.id }, '[WS /driver] joined trip room');
        }
      } catch (err) {
        fastify.log.error({ err }, '[WS /driver] error fetching active trip');
      }

      // location:update — persist to Redis and broadcast to passenger
      socket.on('location:update', async (payload: LocationUpdatePayload) => {
        const { lat, lng } = payload;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          return;
        }

        const timestamp = new Date().toISOString();

        // 1. Persist location in Redis: HSET driver:{userId}:location lat lng timestamp
        try {
          await redis.hset(`driver:${userId}:location`, {
            lat: String(lat),
            lng: String(lng),
            timestamp,
          });
        } catch (err) {
          fastify.log.error({ err }, '[WS /driver] error persisting location to Redis');
        }

        // 2. Find which trip room(s) this socket is in and broadcast driver:location
        const rooms = Array.from(socket.rooms).filter((r) => r.startsWith('trip:'));
        for (const room of rooms) {
          const tripId = room.replace('trip:', '');
          passenger.to(room).emit('driver:location', { trip_id: tripId, lat, lng, timestamp });
        }
      });

      socket.on('disconnect', () => {
        fastify.log.info({ userId }, '[WS /driver] disconnected');
      });
    });

    // Expose io on fastify instance for use in other plugins/routes
    fastify.decorate('io', io);

    // Graceful shutdown
    fastify.addHook('onClose', async () => {
      await io.close();
      _io = null;
    });
  };
}

// ---------------------------------------------------------------------------
// Room management helpers — called from TripsService after state transitions
// ---------------------------------------------------------------------------

/**
 * Join both passenger and driver to a trip room.
 * Called after a trip is ACCEPTED (driver assigned).
 */
export async function joinTripRoom(
  io: Server,
  tripId: string,
  passengerId: string,
  driverUserId: string,
): Promise<void> {
  const room = `trip:${tripId}`;

  // Find passenger socket(s) in /passenger namespace and join room
  const passengerNs = io.of('/passenger');
  const passengerSockets = await passengerNs.fetchSockets();
  for (const s of passengerSockets) {
    if ((s.data as SocketData).userId === passengerId) {
      await s.join(room);
    }
  }

  // Find driver socket(s) in /driver namespace and join room
  const driverNs = io.of('/driver');
  const driverSockets = await driverNs.fetchSockets();
  for (const s of driverSockets) {
    if ((s.data as SocketData).userId === driverUserId) {
      await s.join(room);
    }
  }
}

/**
 * Remove all sockets from a trip room.
 * Called when a trip reaches a terminal state (COMPLETED or CANCELLED).
 */
export async function leaveTripRoom(io: Server, tripId: string): Promise<void> {
  const room = `trip:${tripId}`;

  for (const ns of [io.of('/passenger'), io.of('/driver')]) {
    const sockets = await ns.fetchSockets();
    for (const s of sockets) {
      const rooms = s.rooms;
      if (rooms.has(room)) {
        await s.leave(room);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Type augmentation for Fastify
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}
