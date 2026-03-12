import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { getDb } from '@/lib/db';
import { chat } from '@/lib/ai';
import type { User, ChatMessage } from '@/lib/types';

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth(req);
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as User;

  const body = await req.json();
  const { courseId, message, sessionId: existingSessionId } = body;

  if (!courseId || !message) {
    return NextResponse.json({ error: 'courseId and message are required' }, { status: 400 });
  }

  const db = getDb();

  // Verify user is enrolled in the course
  const enrollment = db.prepare(
    'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).get(user.id, courseId);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
  }

  // Create or reuse session
  let sessionId = existingSessionId;
  if (!sessionId) {
    const title = message.length > 50 ? message.slice(0, 50) + '...' : message;
    const result = db.prepare(
      'INSERT INTO chat_sessions (course_id, user_id, title) VALUES (?, ?, ?)'
    ).run(courseId, user.id, title);
    sessionId = result.lastInsertRowid as number;
  }

  // Save user message
  db.prepare(
    'INSERT INTO chat_messages (session_id, course_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, courseId, user.id, 'user', message);

  try {
    const result = await chat(courseId, sessionId, user.id, message);

    // Save AI response
    db.prepare(
      'INSERT INTO chat_messages (session_id, course_id, user_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sessionId, courseId, user.id, 'assistant', result.response, result.sources.length > 0 ? JSON.stringify(result.sources) : null);

    return NextResponse.json({
      sessionId,
      message: result.response,
      blocked: result.blocked,
      sources: result.sources,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth(req);
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as User;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const courseId = searchParams.get('courseId');

  const db = getDb();

  // Return all messages for a specific session
  if (sessionId) {
    // Verify user owns this session
    const session = db.prepare(
      'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?'
    ).get(Number(sessionId), user.id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = db.prepare(
      'SELECT id, role, content, sources, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC'
    ).all(Number(sessionId)) as Pick<ChatMessage, 'id' | 'role' | 'content' | 'sources' | 'created_at'>[];

    return NextResponse.json({ messages });
  }

  // Return all sessions for user+course with message counts
  if (courseId) {
    const sessions = db.prepare(`
      SELECT
        s.id, s.title, s.created_at,
        COUNT(m.id) as message_count
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.course_id = ? AND s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all(Number(courseId), user.id);

    return NextResponse.json({ sessions });
  }

  return NextResponse.json({ error: 'sessionId or courseId parameter is required' }, { status: 400 });
}
