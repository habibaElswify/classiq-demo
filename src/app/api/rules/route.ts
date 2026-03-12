import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req);
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
  const rules = db
    .prepare('SELECT * FROM course_rules WHERE course_id = ?')
    .get(Number(courseId));

  if (!rules) {
    return NextResponse.json(
      { error: 'No rules found for this course' },
      { status: 404 }
    );
  }

  return NextResponse.json(rules);
}

export async function PUT(req: NextRequest) {
  const authResult = requireAuth(req, 'teacher', 'admin');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const {
    courseId,
    study_mode,
    help_level,
    blocked_topics,
    require_show_work,
    only_course_materials,
    block_assignment_solutions,
    exam_mode,
    redirect_message,
  } = body as {
    courseId: number;
    study_mode?: string;
    help_level?: string;
    blocked_topics?: string[];
    require_show_work?: boolean;
    only_course_materials?: boolean;
    block_assignment_solutions?: boolean;
    exam_mode?: boolean;
    redirect_message?: string;
  };

  if (!courseId) {
    return NextResponse.json(
      { error: 'courseId is required' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify rules row exists
  const existing = db
    .prepare('SELECT id FROM course_rules WHERE course_id = ?')
    .get(courseId);
  if (!existing) {
    return NextResponse.json(
      { error: 'No rules found for this course' },
      { status: 404 }
    );
  }

  // Serialize blocked_topics array to comma-separated string if provided
  const blockedTopicsStr =
    blocked_topics !== undefined ? blocked_topics.join(',') : undefined;

  db.prepare(
    `UPDATE course_rules SET
       study_mode = COALESCE(?, study_mode),
       help_level = COALESCE(?, help_level),
       blocked_topics = COALESCE(?, blocked_topics),
       require_show_work = COALESCE(?, require_show_work),
       only_course_materials = COALESCE(?, only_course_materials),
       block_assignment_solutions = COALESCE(?, block_assignment_solutions),
       exam_mode = COALESCE(?, exam_mode),
       redirect_message = COALESCE(?, redirect_message)
     WHERE course_id = ?`
  ).run(
    study_mode ?? null,
    help_level ?? null,
    blockedTopicsStr ?? null,
    require_show_work !== undefined ? (require_show_work ? 1 : 0) : null,
    only_course_materials !== undefined ? (only_course_materials ? 1 : 0) : null,
    block_assignment_solutions !== undefined ? (block_assignment_solutions ? 1 : 0) : null,
    exam_mode !== undefined ? (exam_mode ? 1 : 0) : null,
    redirect_message ?? null,
    courseId
  );

  const updated = db
    .prepare('SELECT * FROM course_rules WHERE course_id = ?')
    .get(courseId);

  return NextResponse.json(updated);
}
