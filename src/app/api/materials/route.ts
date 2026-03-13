import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
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
  const result = await db.execute({
    sql: `SELECT id, course_id, filename, status, uploaded_at
     FROM materials
     WHERE course_id = ?
     ORDER BY uploaded_at DESC`,
    args: [Number(courseId)],
  });

  return NextResponse.json(result.rows);
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
  const cid = Number(courseId);

  const materialResult = await db.execute({
    sql: `INSERT INTO materials (course_id, filename, content_text, status)
     VALUES (?, ?, ?, ?)`,
    args: [cid, filename, contentText, status],
  });
  const materialId = Number(materialResult.lastInsertRowid);

  await db.execute({
    sql: `INSERT INTO analytics (course_id, user_id, action, metadata)
     VALUES (?, ?, ?, ?)`,
    args: [cid, user.id, 'material_upload', JSON.stringify({ materialId, filename, status })],
  });

  return NextResponse.json(
    { id: materialId, filename, status },
    { status: 201 }
  );
}
