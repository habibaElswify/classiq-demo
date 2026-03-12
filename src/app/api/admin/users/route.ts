import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';
import { hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req, 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();
  const users = db
    .prepare(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
    )
    .all();

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const authResult = requireAuth(req, 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { email, name, password, role } = body as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  };

  if (!email || !name || !password || !role) {
    return NextResponse.json(
      { error: 'email, name, password, and role are required' },
      { status: 400 }
    );
  }

  const db = getDb();

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email);
  if (existing) {
    return NextResponse.json(
      { error: 'A user with this email already exists' },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const result = db
    .prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'
    )
    .run(email, name, passwordHash, role);

  return NextResponse.json(
    {
      id: result.lastInsertRowid as number,
      email,
      name,
      role,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const authResult = requireAuth(req, 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { userId } = body as { userId?: number };

  if (!userId) {
    return NextResponse.json(
      { error: 'userId is required' },
      { status: 400 }
    );
  }

  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  return NextResponse.json({ success: true });
}
