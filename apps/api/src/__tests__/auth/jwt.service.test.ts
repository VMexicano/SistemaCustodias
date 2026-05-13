/**
 * JWTService — unit tests
 *
 * Tests signAccess, signRefresh, and verify methods.
 * No external dependencies; the service reads env vars that are set via
 * .env.test / jest.setup.ts at test bootstrap time.
 */

import jwt from 'jsonwebtoken';
import { JWTService } from '../../modules/auth/jwt.service.js';
import { BusinessError } from '../../shared/errors/business-error.js';

// These must match .env.test so that the module-level `env` import resolves.
const ACCESS_SECRET = 'test-secret-minimum-32-characters-long-for-testing';
const REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-test';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('JWTService', () => {
  let service: JWTService;

  beforeEach(() => {
    service = new JWTService();
  });

  // ---------------------------------------------------------------------------
  // signAccess
  // ---------------------------------------------------------------------------

  describe('signAccess', () => {
    it('returns a valid JWT containing sub, roles, and region', () => {
      const token = service.signAccess({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded).toBeTruthy();
      expect(decoded['sub']).toBe('user-123');
      expect(decoded['roles']).toEqual(['passenger']);
      expect(decoded['region']).toBe('MX');
    });

    it('is verifiable with the access secret', () => {
      const token = service.signAccess({
        sub: 'user-abc',
        roles: ['passenger'],
        region: 'MX',
      });

      expect(() => jwt.verify(token, ACCESS_SECRET)).not.toThrow();
    });

    it('does NOT contain a jti claim', () => {
      const token = service.signAccess({
        sub: 'user-abc',
        roles: ['passenger'],
        region: 'MX',
      });
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded['jti']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // signRefresh
  // ---------------------------------------------------------------------------

  describe('signRefresh', () => {
    it('returns a token and a jti in UUID v4 format', () => {
      const { token, jti } = service.signRefresh({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(jti).toMatch(UUID_REGEX);
    });

    it('embeds the jti in the JWT payload', () => {
      const { token, jti } = service.signRefresh({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded['jti']).toBe(jti);
    });

    it('returns a different jti on each call', () => {
      const first = service.signRefresh({ sub: 'u', roles: [], region: 'MX' });
      const second = service.signRefresh({ sub: 'u', roles: [], region: 'MX' });

      expect(first.jti).not.toBe(second.jti);
    });

    it('is verifiable with the refresh secret', () => {
      const { token } = service.signRefresh({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      expect(() => jwt.verify(token, REFRESH_SECRET)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // verify — happy path
  // ---------------------------------------------------------------------------

  describe('verify — success', () => {
    it('verifies an access token and returns sub, roles, region', () => {
      const token = service.signAccess({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      const result = service.verify(token, 'access');

      expect(result.sub).toBe('user-123');
      expect(result.roles).toEqual(['passenger']);
      expect(result.region).toBe('MX');
    });

    it('verifies a refresh token and includes jti in the result', () => {
      const { token, jti } = service.signRefresh({
        sub: 'user-456',
        roles: ['driver'],
        region: 'MX',
      });

      const result = service.verify(token, 'refresh');

      expect(result.sub).toBe('user-456');
      expect(result.jti).toBe(jti);
    });
  });

  // ---------------------------------------------------------------------------
  // verify — error cases
  // ---------------------------------------------------------------------------

  describe('verify — TOKEN_INVALID', () => {
    it('throws TOKEN_INVALID for a tampered token', () => {
      const token = service.signAccess({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });
      // Corrupt the signature by appending extra chars
      const tampered = token.slice(0, -4) + 'xxxx';

      expect(() => service.verify(tampered, 'access')).toThrow(
        expect.objectContaining({ code: 'TOKEN_INVALID' }),
      );
    });

    it('throws TOKEN_INVALID for a token signed with the wrong secret', () => {
      const wrongSecret = 'a-completely-different-secret-that-is-long-enough';
      const token = jwt.sign(
        { sub: 'user-x', roles: [], region: 'MX' },
        wrongSecret,
        { expiresIn: '15m' },
      );

      expect(() => service.verify(token, 'access')).toThrow(
        expect.objectContaining({ code: 'TOKEN_INVALID' }),
      );
    });

    it('throws TOKEN_INVALID when a refresh token is verified as access', () => {
      const { token } = service.signRefresh({
        sub: 'user-123',
        roles: ['passenger'],
        region: 'MX',
      });

      // A refresh token signed with REFRESH_SECRET will fail verification
      // against ACCESS_SECRET, producing TOKEN_INVALID.
      expect(() => service.verify(token, 'access')).toThrow(BusinessError);
    });
  });

  describe('verify — TOKEN_EXPIRED', () => {
    it('throws TOKEN_EXPIRED for a token with expiresIn 1ms (already expired)', async () => {
      // Sign with a 1ms lifetime, then wait 2ms for it to expire.
      const token = jwt.sign(
        { sub: 'user-exp', roles: [], region: 'MX' },
        ACCESS_SECRET,
        { expiresIn: '1ms' },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => service.verify(token, 'access')).toThrow(
        expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
      );
    });
  });
});
