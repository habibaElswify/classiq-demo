import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, createToken, getUserByEmail } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { User, UserRole } from '@/lib/types';

const VALID_ROLES: UserRole[] = ['student', 'teacher', 'admin'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, role } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'All fields are required: email, password, name, role' },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const db = getDb();

    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(email, name, passwordHash, role);

    const user: User = {
      id: result.lastInsertRowid as number,
      email,
      name,
      role,
      created_at: new Date().toISOString(),
    };

    const token = await createToken(user);

    return NextResponse.json({ user, token }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
