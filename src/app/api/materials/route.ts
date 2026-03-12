import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';
import { PDFParse } from 'pdf-parse';

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) {
    return NextResponse.json(
      { error: 'courseId query parameter is required' },
      { status: 400 }
    );
  }

  const db = getDb();
  const materials = db
    .prepare(
      `SELECT id, course_id, filename, status, uploaded_at
       FROM materials
       WHERE course_id = ?
       ORDER BY uploaded_at DESC`
    )
    .all(Number(courseId));

  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'teacher', 'admin');
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;

  if (!file || !courseId) {
    return NextResponse.json(
      { error: 'file and courseId are required' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  let contentText = '';
  let status: 'trained' | 'error' = 'error';

  try {
    if (filename.toLowerCase().endsWith('.pdf')) {
      contentText = await extractPdfText(buffer);
      status = 'trained';
    } else if (
      filename.toLowerCase().endsWith('.txt') ||
      filename.toLowerCase().endsWith('.md')
    ) {
      contentText = buffer.toString('utf-8');
      status = 'trained';
    } else {
      contentText = `[Binary file: ${filename}]`;
      status = 'error';
    }
  } catch {
    contentText = '';
    status = 'error';
  }

  const db = getDb();

  const insertMaterial = db.prepare(
    `INSERT INTO materials (course_id, filename, content_text, status)
     VALUES (?, ?, ?, ?)`
  );
  const insertAnalytics = db.prepare(
    `INSERT INTO analytics (course_id, user_id, action, metadata)
     VALUES (?, ?, ?, ?)`
  );

  const result = db.transaction(() => {
    const info = insertMaterial.run(
      Number(courseId),
      filename,
      contentText,
      status
    );
    const materialId = info.lastInsertRowid as number;

    insertAnalytics.run(
      Number(courseId),
      user.id,
      'material_upload',
      JSON.stringify({ materialId, filename, status })
    );

    return materialId;
  })();

  return NextResponse.json(
    { id: result, filename, status },
    { status: 201 }
  );
}
