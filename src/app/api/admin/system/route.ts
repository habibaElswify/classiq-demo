import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req, 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();

  const totalUsers = (
    db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
  ).count;

  const totalCourses = (
    db.prepare('SELECT COUNT(*) AS count FROM courses').get() as {
      count: number;
    }
  ).count;

  const totalMessages = (
    db.prepare('SELECT COUNT(*) AS count FROM chat_messages').get() as {
      count: number;
    }
  ).count;

  const totalMaterials = (
    db.prepare('SELECT COUNT(*) AS count FROM materials').get() as {
      count: number;
    }
  ).count;

  const usersByRole = db
    .prepare('SELECT role, COUNT(*) AS count FROM users GROUP BY role')
    .all();

  const recentActivity = db
    .prepare(
      `SELECT a.id, a.course_id, a.user_id, a.action, a.metadata, a.created_at,
              u.name AS user_name
       FROM analytics a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 50`
    )
    .all();

  return NextResponse.json({
    totalUsers,
    totalCourses,
    totalMessages,
    totalMaterials,
    usersByRole,
    recentActivity,
  });
}
