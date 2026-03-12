import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, 'teacher', 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');

  if (!courseId) {
    return NextResponse.json(
      { error: 'courseId query parameter is required' },
      { status: 400 }
    );
  }

  const db = getDb();
  const cid = Number(courseId);

  const totalMessages = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM chat_messages WHERE course_id = ? AND role = 'user'"
      )
      .get(cid) as { count: number }
  ).count;

  const totalSessions = (
    db
      .prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE course_id = ?')
      .get(cid) as { count: number }
  ).count;

  const blockedAttempts = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM analytics WHERE course_id = ? AND action = 'chat_message' AND metadata LIKE '%\"blocked\":true%'"
      )
      .get(cid) as { count: number }
  ).count;

  const uniqueStudents = (
    db
      .prepare(
        'SELECT COUNT(DISTINCT user_id) AS count FROM chat_sessions WHERE course_id = ?'
      )
      .get(cid) as { count: number }
  ).count;

  const recentMessages = db
    .prepare(
      `SELECT cm.id, cm.content, cm.created_at, u.name AS user_name
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.course_id = ? AND cm.role = 'user'
       ORDER BY cm.created_at DESC
       LIMIT 20`
    )
    .all(cid);

  const topTopics = db
    .prepare(
      `SELECT content, COUNT(*) AS count
       FROM chat_messages
       WHERE course_id = ? AND role = 'user'
       GROUP BY content
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(cid);

  return NextResponse.json({
    totalMessages,
    totalSessions,
    blockedAttempts,
    uniqueStudents,
    recentMessages,
    topTopics,
  });
}
