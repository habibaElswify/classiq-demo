import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const db = getDb();

  if (user.role === 'admin') {
    const courses = db
      .prepare(
        `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at,
                u.name AS teacher_name
         FROM courses c
         JOIN users u ON c.teacher_id = u.id
         ORDER BY c.created_at DESC`
      )
      .all();
    return NextResponse.json(courses);
  }

  // Students and teachers see only their enrolled courses
  const courses = db
    .prepare(
      `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at,
              u.name AS teacher_name
       FROM courses c
       JOIN enrollments e ON e.course_id = c.id
       JOIN users u ON c.teacher_id = u.id
       WHERE e.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(user.id);

  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'teacher', 'admin');
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const body = await req.json();
  const { name, code } = body as { name?: string; code?: string };

  if (!name || !code) {
    return NextResponse.json(
      { error: 'name and code are required' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Check code uniqueness
  const existing = db
    .prepare('SELECT id FROM courses WHERE code = ?')
    .get(code);
  if (existing) {
    return NextResponse.json(
      { error: 'A course with this code already exists' },
      { status: 409 }
    );
  }

  const insertCourse = db.prepare(
    'INSERT INTO courses (name, code, teacher_id) VALUES (?, ?, ?)'
  );
  const insertEnrollment = db.prepare(
    'INSERT INTO enrollments (user_id, course_id, role) VALUES (?, ?, ?)'
  );
  const insertRules = db.prepare(
    'INSERT INTO course_rules (course_id) VALUES (?)'
  );

  const result = db.transaction(() => {
    const info = insertCourse.run(name, code, user.id);
    const courseId = info.lastInsertRowid as number;

    // Auto-enroll the creating teacher
    insertEnrollment.run(user.id, courseId, 'teacher');

    // Create default course_rules row
    insertRules.run(courseId);

    return courseId;
  })();

  return NextResponse.json({ id: result, name, code }, { status: 201 });
}
