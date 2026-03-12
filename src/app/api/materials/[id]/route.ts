import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = requireAuth(req, 'teacher', 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  const db = getDb();
  db.prepare('DELETE FROM materials WHERE id = ?').run(Number(id));

  return NextResponse.json({ success: true });
}
