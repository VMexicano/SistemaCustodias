import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/environment.js';
import { BusinessError } from '../../shared/errors/business-error.js';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  region: string;
  tenant_id?: string;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export interface VerifiedToken {
  sub: string;
  roles: string[];
  region: string;
  tenant_id?: string;
  jti?: string;
}

/**
 * JWTService — signs and verifies access and refresh tokens.
 *
 * - Access tokens: 15 min TTL, signed with JWT_SECRET, no jti
 * - Refresh tokens: 30 day TTL, signed with JWT_REFRESH_SECRET, jti = crypto.randomUUID()
 */
export class JWTService {
  signAccess(payload: AccessTokenPayload): string {
    const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
    const claims: Record<string, unknown> = {
      sub: payload.sub,
      roles: payload.roles,
      region: payload.region,
    };
    if (payload.tenant_id !== undefined) claims['tenant_id'] = payload.tenant_id;
    return jwt.sign(claims, env.JWT_SECRET, options);
  }

  signRefresh(payload: AccessTokenPayload): { token: string; jti: string } {
    const jti = randomUUID();
    const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
    const claims: Record<string, unknown> = {
      sub: payload.sub,
      roles: payload.roles,
      region: payload.region,
      jti,
    };
    if (payload.tenant_id !== undefined) claims['tenant_id'] = payload.tenant_id;

    const token = jwt.sign(claims, env.JWT_REFRESH_SECRET, options);
    return { token, jti };
  }

  verify(token: string, type: 'access' | 'refresh' = 'access'): VerifiedToken {
    const secret = type === 'refresh' ? env.JWT_REFRESH_SECRET : env.JWT_SECRET;

    try {
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

      return {
        sub: decoded['sub'] as string,
        roles: decoded['roles'] as string[],
        region: decoded['region'] as string,
        tenant_id: decoded['tenant_id'] as string | undefined,
        jti: decoded['jti'] as string | undefined,
      };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new BusinessError('TOKEN_EXPIRED');
      }
      throw new BusinessError('TOKEN_INVALID');
    }
  }
}
