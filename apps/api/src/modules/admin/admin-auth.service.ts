import bcrypt from 'bcrypt';
import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { JWTService } from '../auth/jwt.service.js';

interface AdminUserRow {
  id: string;
  username: string;
  full_name: string;
  password_hash: string;
  active: boolean;
}

export class AdminAuthService {
  constructor(
    private readonly db: Knex,
    private readonly jwtService: JWTService,
  ) {}

  async login(username: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.db<AdminUserRow>('admin_users')
      .where({ username })
      .first();

    if (!user || !user.active) {
      throw new BusinessError('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new BusinessError('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos');
    }

    const accessToken = this.jwtService.signAccess({
      sub: user.id,
      roles: ['admin'],
      region: 'MX',
    });

    return { accessToken };
  }
}
