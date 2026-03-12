import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const result = await requireAuth(req);

  if (result instanceof NextResponse) {
    return result;
  }

  return NextResponse.json({ user: result });
}
