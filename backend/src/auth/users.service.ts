import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const { rows } = await this.db.query(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at ASC',
    );
    return rows;
  }

  async create(username: string, password: string) {
    if (!username || !username.trim()) {
      throw new BadRequestException('Korisničko ime je obavezno.');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('Lozinka mora imati bar 8 karaktera.');
    }
    const trimmed = username.trim();
    const { rows: existing } = await this.db.query('SELECT id FROM users WHERE username = $1', [trimmed]);
    if (existing.length > 0) {
      throw new ConflictException('Korisničko ime već postoji.');
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await this.db.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user')
       RETURNING id, username, role, created_at`,
      [trimmed, hash],
    );
    return rows[0];
  }

  async remove(id: number, requesterId: number) {
    if (id === requesterId) {
      throw new BadRequestException('Ne možete obrisati sopstveni nalog.');
    }
    const { rows } = await this.db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (rows.length === 0) {
      throw new NotFoundException('Korisnik nije pronađen.');
    }
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
    return { ok: true };
  }
}
