/**
 * circuit-breaker.test.ts — unit tests for CircuitBreaker (Redis-backed)
 *
 * Target: ≥ 90% lines / ≥ 85% branches
 *
 * Uses an in-memory Redis mock — no real Redis required.
 */

import type { Redis } from 'ioredis';
import { CircuitBreaker } from '../../modules/custody-notifications/circuit-breaker.js';

// ---------------------------------------------------------------------------
// In-memory Redis mock
// ---------------------------------------------------------------------------

function makeMockRedis() {
  const store: Record<string, Record<string, string>> = {};

  return {
    hgetall: jest.fn(async (key: string) => store[key] ?? null),
    hset: jest.fn(async (key: string, ...args: string[]) => {
      if (!store[key]) store[key] = {};
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i];
        const value = args[i + 1];
        if (field !== undefined && value !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          store[key]![field] = value;
        }
      }
      return 1;
    }),
    hget: jest.fn(async (key: string, field: string) => store[key]?.[field] ?? null),
    pexpire: jest.fn(async (_key: string, _ms: number) => 1),
    del: jest.fn(async (key: string) => {
      delete store[key];
      return 1;
    }),
    _store: store,
  } as unknown as Redis & { _store: Record<string, Record<string, string>> };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CB_KEY = 'cb:fcm:custody';

/** Build a CircuitBreaker with test-friendly thresholds. */
function makeBreaker(redis: Redis, opts: { threshold?: number; windowMs?: number; cooldownMs?: number } = {}) {
  return new CircuitBreaker(
    redis,
    opts.threshold ?? 5,
    opts.windowMs ?? 60_000,
    opts.cooldownMs ?? 300_000,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  let redis: ReturnType<typeof makeMockRedis>;
  let cb: CircuitBreaker;

  beforeEach(() => {
    redis = makeMockRedis();
    cb = makeBreaker(redis);
  });

  // -------------------------------------------------------------------------
  // getState()
  // -------------------------------------------------------------------------

  describe('getState()', () => {
    it('returns "closed" when Redis key is absent (empty store)', async () => {
      const state = await cb.getState();
      expect(state).toBe('closed');
    });

    it('returns "closed" when Redis returns an empty object', async () => {
      (redis.hgetall as jest.Mock).mockResolvedValueOnce({});
      const state = await cb.getState();
      expect(state).toBe('closed');
    });

    it('returns "open" when state is open and cooldown has not elapsed', async () => {
      // Simulate a recently-opened circuit
      redis._store[CB_KEY] = {
        state: 'open',
        failure_count: '5',
        opened_at: new Date().toISOString(), // just opened
      };
      const state = await cb.getState();
      expect(state).toBe('open');
    });

    it('returns "half-open" when state is open and cooldown has elapsed', async () => {
      // opened_at in the past beyond the cooldown window
      const pastDate = new Date(Date.now() - 400_000).toISOString(); // 400s ago > 300s cooldown
      redis._store[CB_KEY] = {
        state: 'open',
        failure_count: '5',
        opened_at: pastDate,
      };
      const state = await cb.getState();
      expect(state).toBe('half-open');
      // The breaker should have updated Redis to 'half-open'
      expect(redis.hset).toHaveBeenCalledWith(CB_KEY, 'state', 'half-open');
    });

    it('returns "closed" when state field is missing in the hash', async () => {
      // Hash exists but has no "state" field
      redis._store[CB_KEY] = { failure_count: '2' };
      const state = await cb.getState();
      expect(state).toBe('closed');
    });

    it('returns "half-open" directly when Redis already has state half-open', async () => {
      redis._store[CB_KEY] = { state: 'half-open', failure_count: '5' };
      const state = await cb.getState();
      expect(state).toBe('half-open');
    });

    it('returns "open" when opened_at field is missing (cannot determine elapsed)', async () => {
      redis._store[CB_KEY] = { state: 'open', failure_count: '5' };
      // No opened_at field — should stay open
      const state = await cb.getState();
      expect(state).toBe('open');
    });
  });

  // -------------------------------------------------------------------------
  // isOpen()
  // -------------------------------------------------------------------------

  describe('isOpen()', () => {
    it('returns false when circuit is closed (Redis empty)', async () => {
      const open = await cb.isOpen();
      expect(open).toBe(false);
    });

    it('returns true when circuit is open', async () => {
      redis._store[CB_KEY] = {
        state: 'open',
        failure_count: '5',
        opened_at: new Date().toISOString(),
      };
      const open = await cb.isOpen();
      expect(open).toBe(true);
    });

    it('returns false when circuit is half-open (probe allowed)', async () => {
      const pastDate = new Date(Date.now() - 400_000).toISOString();
      redis._store[CB_KEY] = { state: 'open', failure_count: '5', opened_at: pastDate };
      const open = await cb.isOpen();
      expect(open).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // recordFailure()
  // -------------------------------------------------------------------------

  describe('recordFailure()', () => {
    it('increments failure count without opening circuit when count < threshold (1 failure)', async () => {
      await cb.recordFailure();
      expect(redis.hset).toHaveBeenCalledWith(CB_KEY, 'failure_count', '1');
      expect(redis.pexpire).toHaveBeenCalledWith(CB_KEY, 60_000);
      // state should NOT be 'open'
      const calls = (redis.hset as jest.Mock).mock.calls;
      const openCall = calls.find((c: string[]) => c.includes('open'));
      expect(openCall).toBeUndefined();
    });

    it('keeps circuit closed after 4 failures (threshold=5)', async () => {
      for (let i = 0; i < 4; i++) {
        await cb.recordFailure();
      }
      const state = await cb.getState();
      // State is either 'closed' (no state field) or not 'open'
      expect(state).not.toBe('open');
    });

    it('opens circuit on the 5th failure (threshold=5)', async () => {
      for (let i = 0; i < 5; i++) {
        await cb.recordFailure();
      }
      // After 5 failures the store should have state='open'
      expect(redis._store[CB_KEY]?.state).toBe('open');
      expect(redis._store[CB_KEY]?.failure_count).toBe('5');
      expect(redis._store[CB_KEY]?.opened_at).toBeDefined();
    });

    it('sets TTL = 2 * cooldownMs when opening circuit', async () => {
      for (let i = 0; i < 5; i++) {
        await cb.recordFailure();
      }
      expect(redis.pexpire).toHaveBeenLastCalledWith(CB_KEY, 600_000); // 2 * 300_000
    });

    it('uses pexpire with windowMs while still closed', async () => {
      await cb.recordFailure(); // count=1, still closed
      expect(redis.pexpire).toHaveBeenCalledWith(CB_KEY, 60_000);
    });

    it('opens circuit at exactly threshold failures (no off-by-one)', async () => {
      const strictCb = makeBreaker(redis, { threshold: 3 });
      await strictCb.recordFailure(); // 1
      await strictCb.recordFailure(); // 2
      expect(redis._store[CB_KEY]?.state).toBeUndefined();
      await strictCb.recordFailure(); // 3 — opens
      expect(redis._store[CB_KEY]?.state).toBe('open');
    });

    it('increments count correctly across multiple separate recordFailure calls', async () => {
      await cb.recordFailure(); // count becomes 1
      await cb.recordFailure(); // count becomes 2
      expect(redis._store[CB_KEY]?.failure_count).toBe('2');
    });
  });

  // -------------------------------------------------------------------------
  // recordSuccess()
  // -------------------------------------------------------------------------

  describe('recordSuccess()', () => {
    it('in half-open state: deletes Redis key (transitions to closed)', async () => {
      // Set up half-open by using a past opened_at
      const pastDate = new Date(Date.now() - 400_000).toISOString();
      redis._store[CB_KEY] = { state: 'open', failure_count: '5', opened_at: pastDate };

      await cb.recordSuccess();

      expect(redis.del).toHaveBeenCalledWith(CB_KEY);
      expect(redis._store[CB_KEY]).toBeUndefined();
    });

    it('in closed state: does nothing (no del, no hset for state)', async () => {
      // No key in store → getState() returns 'closed'
      await cb.recordSuccess();

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('in open state (cooldown not elapsed): does nothing', async () => {
      redis._store[CB_KEY] = {
        state: 'open',
        failure_count: '5',
        opened_at: new Date().toISOString(),
      };
      (redis.del as jest.Mock).mockClear();

      await cb.recordSuccess();

      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  describe('reset()', () => {
    it('force-closes the circuit by deleting Redis key from open state', async () => {
      redis._store[CB_KEY] = {
        state: 'open',
        failure_count: '5',
        opened_at: new Date().toISOString(),
      };

      await cb.reset();

      expect(redis.del).toHaveBeenCalledWith(CB_KEY);
      expect(redis._store[CB_KEY]).toBeUndefined();
    });

    it('calling reset on already-closed circuit does not throw', async () => {
      await expect(cb.reset()).resolves.not.toThrow();
      expect(redis.del).toHaveBeenCalledWith(CB_KEY);
    });
  });

  // -------------------------------------------------------------------------
  // Constructor defaults
  // -------------------------------------------------------------------------

  describe('constructor defaults', () => {
    it('uses default thresholds when instantiated with redis only', async () => {
      // Exercises the default parameter branches (threshold=5, windowMs=60_000, cooldownMs=300_000)
      const defaultCb = new CircuitBreaker(redis);
      // With an empty store it should report 'closed'
      expect(await defaultCb.getState()).toBe('closed');
      // A single failure should not open with the default threshold of 5
      await defaultCb.recordFailure();
      expect(redis._store['cb:fcm:custody']?.state).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // State machine integration
  // -------------------------------------------------------------------------

  describe('full state machine flow', () => {
    it('closed → open → half-open → closed', async () => {
      // 1. Start closed
      expect(await cb.getState()).toBe('closed');

      // 2. Accumulate 5 failures → open
      for (let i = 0; i < 5; i++) {
        await cb.recordFailure();
      }
      expect(await cb.getState()).toBe('open');

      // 3. Simulate cooldown elapsed by patching opened_at in the past
      const entry = redis._store[CB_KEY];
      if (entry) entry.opened_at = new Date(Date.now() - 400_000).toISOString();

      // 4. getState transitions to half-open
      expect(await cb.getState()).toBe('half-open');

      // 5. Probe succeeds → back to closed
      await cb.recordSuccess();
      expect(redis._store[CB_KEY]).toBeUndefined(); // key deleted
      expect(await cb.getState()).toBe('closed');
    });
  });
});
