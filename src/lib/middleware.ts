import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getUserById } from './auth';
import { User, UserRole } from './types';

export async function authenticate(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = getUserById(payload.userId);
  return user ?? null;
}

export async function requireAuth(
  req: NextRequest,
  ...roles: UserRole[]
): Promise<User | NextResponse> {
  const user = await authenticate(req);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return user;
}
