import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getDb } from './db';
import { User } from './types';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: number; email: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as { userId: number; email: string; role: string };
  } catch {
    return null;
  }
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, name, role, created_at FROM users WHERE id = ?'
  ).get(id) as User | undefined;
  return row;
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, name, password_hash, role, created_at FROM users WHERE email = ?'
  ).get(email) as (User & { password_hash: string }) | undefined;
  return row;
}
