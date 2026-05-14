// ---------------------------------------------------------------------------
// circuit-breaker.ts — Redis-backed circuit breaker for FCM push delivery
// ---------------------------------------------------------------------------

import type { Redis } from 'ioredis';

export type CircuitState = 'closed' | 'open' | 'half-open';

// Thresholds
const CB_THRESHOLD = 5;        // failures before opening
const CB_WINDOW_MS = 60_000;   // failure counting window (60s)
const CB_COOLDOWN_MS = 300_000; // how long circuit stays open (5min)

const CB_KEY = 'cb:fcm:custody';

/**
 * CircuitBreaker — tracks FCM delivery failures in Redis and opens the circuit
 * when failure_count reaches the threshold. After cooldown, transitions to
 * half-open to allow a single probe request.
 */
export class CircuitBreaker {
  constructor(
    private readonly redis: Redis,
    private readonly threshold = CB_THRESHOLD,
    private readonly windowMs = CB_WINDOW_MS,
    private readonly cooldownMs = CB_COOLDOWN_MS,
  ) {}

  // ---------------------------------------------------------------------------
  // getState
  // ---------------------------------------------------------------------------

  async getState(): Promise<CircuitState> {
    const data = await this.redis.hgetall(CB_KEY);

    if (!data || Object.keys(data).length === 0) {
      return 'closed';
    }

    const state = data['state'] as CircuitState | undefined;

    if (state === 'open') {
      const openedAt = data['opened_at'];
      if (openedAt) {
        const openedAtMs = new Date(openedAt).getTime();
        const elapsed = Date.now() - openedAtMs;
        if (elapsed >= this.cooldownMs) {
          // Transition to half-open
          await this.redis.hset(CB_KEY, 'state', 'half-open');
          return 'half-open';
        }
      }
      return 'open';
    }

    return (state as CircuitState) ?? 'closed';
  }

  // ---------------------------------------------------------------------------
  // isOpen
  // ---------------------------------------------------------------------------

  /**
   * Returns true when FCM requests should be blocked (circuit is open).
   * half-open allows one probe request through.
   */
  async isOpen(): Promise<boolean> {
    const state = await this.getState();
    return state === 'open';
  }

  // ---------------------------------------------------------------------------
  // recordFailure
  // ---------------------------------------------------------------------------

  async recordFailure(): Promise<void> {
    const currentCount = await this.redis.hget(CB_KEY, 'failure_count');
    const count = (parseInt(currentCount ?? '0', 10) || 0) + 1;

    if (count >= this.threshold) {
      // Open the circuit
      const now = new Date().toISOString();
      await this.redis.hset(CB_KEY, 'state', 'open', 'failure_count', String(count), 'opened_at', now);
      // TTL = 2 * cooldown to auto-cleanup
      await this.redis.pexpire(CB_KEY, this.cooldownMs * 2);
    } else {
      // Increment counter, keep within window
      await this.redis.hset(CB_KEY, 'failure_count', String(count));
      await this.redis.pexpire(CB_KEY, this.windowMs);
    }
  }

  // ---------------------------------------------------------------------------
  // recordSuccess
  // ---------------------------------------------------------------------------

  async recordSuccess(): Promise<void> {
    const state = await this.getState();
    if (state === 'half-open') {
      // Probe succeeded — reset to closed
      await this.redis.del(CB_KEY);
    }
    // If closed, do nothing
  }

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  /** Force-close the circuit breaker. For tests and admin use. */
  async reset(): Promise<void> {
    await this.redis.del(CB_KEY);
  }
}
