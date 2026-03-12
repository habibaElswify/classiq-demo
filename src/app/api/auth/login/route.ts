import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createToken, getUserByEmail } from '@/lib/auth';
import { User } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const userWithHash = getUserByEmail(email);
    if (!userWithHash) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, userWithHash.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user: User = {
      id: userWithHash.id,
      email: userWithHash.email,
      name: userWithHash.name,
      role: userWithHash.role,
      created_at: userWithHash.created_at,
    };

    const token = await createToken(user);

    return NextResponse.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
