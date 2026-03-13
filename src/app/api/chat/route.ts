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
  const enrollmentResult = await db.execute({
    sql: 'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?',
    args: [user.id, courseId],
  });
  if (enrollmentResult.rows.length === 0) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
  }

  // Create or reuse session
  let sessionId = existingSessionId;
  if (!sessionId) {
    const title = message.length > 50 ? message.slice(0, 50) + '...' : message;
    const sessionResult = await db.execute({
      sql: 'INSERT INTO chat_sessions (course_id, user_id, title) VALUES (?, ?, ?)',
      args: [courseId, user.id, title],
    });
    sessionId = Number(sessionResult.lastInsertRowid);
  }

  // Save user message
  await db.execute({
    sql: 'INSERT INTO chat_messages (session_id, course_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)',
    args: [sessionId, courseId, user.id, 'user', message],
  });

  try {
    const result = await chat(courseId, sessionId, user.id, message);

    // Save AI response
    await db.execute({
      sql: 'INSERT INTO chat_messages (session_id, course_id, user_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)',
      args: [sessionId, courseId, user.id, 'assistant', result.response, result.sources.length > 0 ? JSON.stringify(result.sources) : null],
    });

    return NextResponse.json({
      sessionId,
      message: result.response,
      blocked: result.blocked,
      sources: result.sources,
    });
  } catch (error: unknown) {
    console.error('Chat error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('credit balance is too low')) {
      return NextResponse.json({ error: 'API credits exhausted. Please add credits at console.anthropic.com.' }, { status: 402 });
    }
    return NextResponse.json({ error: `Failed to generate response: ${errMsg.slice(0, 200)}` }, { status: 500 });
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
    const sessionResult = await db.execute({
      sql: 'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
      args: [Number(sessionId), user.id],
    });
    if (sessionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messagesResult = await db.execute({
      sql: 'SELECT id, role, content, sources, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC',
      args: [Number(sessionId)],
    });

    return NextResponse.json({ messages: messagesResult.rows });
  }

  // Return all sessions for user+course with message counts
  if (courseId) {
    const sessionsResult = await db.execute({
      sql: `SELECT
        s.id, s.title, s.created_at,
        COUNT(m.id) as message_count
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.course_id = ? AND s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
      args: [Number(courseId), user.id],
    });

    return NextResponse.json({ sessions: sessionsResult.rows });
  }

  return NextResponse.json({ error: 'sessionId or courseId parameter is required' }, { status: 400 });
}
