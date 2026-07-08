import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';

const TOKEN_TTL = '7d';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'ProxmoxGuru123';

export interface AuthTokenPayload {
  sub: number;
  username: string;
  role: 'admin' | 'user';
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    const { rows } = await this.db.query('SELECT id FROM users WHERE username = $1', [DEFAULT_ADMIN_USERNAME]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      await this.db.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        [DEFAULT_ADMIN_USERNAME, hash, 'admin'],
      );
      console.log('Kreiran podrazumevani admin nalog (korisničko ime: admin)');
    }
  }

  get cookieMaxAgeMs() {
    return TOKEN_TTL_MS;
  }

  private get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET nije podešen u .env');
    return secret;
  }

  signToken(user: { id: number; username: string; role: string }): string {
    return jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      this.secret,
      { expiresIn: TOKEN_TTL },
    );
  }

  verifyToken(token: string): AuthTokenPayload {
    return jwt.verify(token, this.secret) as unknown as AuthTokenPayload;
  }

  async login(username: string, password: string) {
    if (!username || !password) {
      throw new BadRequestException('Korisničko ime i lozinka su obavezni.');
    }
    const { rows } = await this.db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Pogrešno korisničko ime ili lozinka.');
    }
    return {
      token: this.signToken(user),
      user: { username: user.username, role: user.role },
    };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    if (!oldPassword || !newPassword) {
      throw new BadRequestException('Trenutna i nova lozinka su obavezne.');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Nova lozinka mora imati bar 8 karaktera.');
    }
    const { rows } = await this.db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) {
      throw new UnauthorizedException('Trenutna lozinka nije tačna.');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    return { ok: true };
  }
}
