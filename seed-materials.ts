import { createClient } from '@libsql/client';
import { PDFParse } from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://classiq-helswify.aws-us-east-2.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzMzNTM3MTgsImlkIjoiMDE5Y2U0MTctY2QwMS03NDc1LTk1MGItNzhkODczZDBmNTRkIiwicmlkIjoiMDZhY2M0NTMtYTYwYy00YzY0LTk4ZTMtYzRmODNiNzMyZWQyIn0.1VcAd9djtjSAUCyt7XhuNRZ439jk8K9ncpBYhevuTA7wDpuN604K3b8uwaFSdb21Pa9fegPwCG-ya2y8FaokDw',
});

const COURSE_ID = 4; // CSS 370 B Wi 26 (Canvas-synced course)
const USER_ID = 1; // Prof. Johnson
const MAX_CONTENT_LENGTH = 50000;

interface MaterialEntry {
  filepath: string;
  filename: string;
  type: 'pdf' | 'md';
}

const materials: MaterialEntry[] = [
  // PDFs
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 1- Customer Segmentation (1).pdf', filename: 'CSS 370 Sprint 1- Customer Segmentation.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 2- Customer Profiles.pdf', filename: 'CSS 370 Sprint 2- Customer Profiles.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 4- Requirements (1).pdf', filename: 'CSS 370 Sprint 4- Requirements.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 5 & 6- System Architecture (1).pdf', filename: 'CSS 370 Sprint 5 & 6- System Architecture.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 7- Transforming Worded Requirements to Code Design.pdf', filename: 'CSS 370 Sprint 7- Transforming Worded Requirements to Code Design.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 Sprint 9- Cost Estimation.pdf', filename: 'CSS 370 Sprint 9- Cost Estimation.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/CSS 370 -  Analysis & Design 2.pdf', filename: 'CSS 370 - Analysis & Design 2.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/Sprint 10 - UI wireframe Sample.pdf', filename: 'Sprint 10 - UI wireframe Sample.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/SFE - Chapter 1.pdf', filename: 'SFE - Chapter 1.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/SFE - Chapter 2.pdf', filename: 'SFE - Chapter 2.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/ch7_DataPrivacy.pdf', filename: 'ch7_DataPrivacy.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/ch8_DataPrivacy.pdf', filename: 'ch8_DataPrivacy.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/Brooks_TarPit.pdf', filename: 'Brooks_TarPit.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/Review Checklist - Domain Diagram (UML).docx.pdf', filename: 'Review Checklist - Domain Diagram (UML).pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/Review Checklist - Architectural Description.docx.pdf', filename: 'Review Checklist - Architectural Description.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Downloads/Copy of MidtermStudyQuestions.docx.pdf', filename: 'MidtermStudyQuestions.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Desktop/CSS370_Sprint8_Assignment.pdf', filename: 'CSS370_Sprint8_Assignment.pdf', type: 'pdf' },
  { filepath: '/Users/habibaelswify/Desktop/ClassIQ DFD with Trust Boundaries.pdf', filename: 'ClassIQ DFD with Trust Boundaries.pdf', type: 'pdf' },
  // Markdown study guides
  { filepath: '/Users/habibaelswify/study/CSS370-Quiz3-StudyGuide.md', filename: 'CSS370-Quiz3-StudyGuide.md', type: 'md' },
  { filepath: '/Users/habibaelswify/study/CSS370-Quiz2-StudyGuide.md', filename: 'CSS370-Quiz2-StudyGuide.md', type: 'md' },
  { filepath: '/Users/habibaelswify/study/CSS370-Quiz2-StudyGuide-v2.md', filename: 'CSS370-Quiz2-StudyGuide-v2.md', type: 'md' },
];

async function extractPdfText(filepath: string): Promise<string> {
  const buffer = fs.readFileSync(filepath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  console.log('=== CSS370 Material Seeder ===\n');

  // Step 1: Delete existing materials for course_id=1
  console.log('Deleting existing materials for course_id=1...');
  const existing = await db.execute({
    sql: 'SELECT COUNT(*) as cnt FROM materials WHERE course_id = ?',
    args: [COURSE_ID],
  });
  console.log(`  Found ${existing.rows[0].cnt} existing materials to remove.`);
  await db.execute({
    sql: 'DELETE FROM materials WHERE course_id = ?',
    args: [COURSE_ID],
  });
  console.log('  Deleted.\n');

  // Step 2: Process and insert each material
  let successCount = 0;
  let errorCount = 0;
  const results: { filename: string; status: string; chars: number }[] = [];

  for (const mat of materials) {
    let contentText = '';
    let status: 'trained' | 'error' = 'trained';

    try {
      if (mat.type === 'pdf') {
        contentText = await extractPdfText(mat.filepath);
        // Check if extraction yielded meaningful text
        const cleanText = contentText.replace(/\s+/g, ' ').trim();
        if (cleanText.length < 50) {
          // Likely scanned/image PDF with no extractable text
          contentText = `[PDF text extraction yielded minimal content. This file (${mat.filename}) may contain scanned images or diagrams that cannot be extracted as text.]`;
          status = 'error';
        }
      } else {
        contentText = fs.readFileSync(mat.filepath, 'utf-8');
      }
    } catch (err: any) {
      contentText = `[Failed to extract text from ${mat.filename}: ${err.message}]`;
      status = 'error';
    }

    // Truncate if too long
    if (contentText.length > MAX_CONTENT_LENGTH) {
      contentText = contentText.substring(0, MAX_CONTENT_LENGTH) + '\n\n[... content truncated at 50000 characters ...]';
    }

    // Insert material
    const insertResult = await db.execute({
      sql: 'INSERT INTO materials (course_id, filename, content_text, status) VALUES (?, ?, ?, ?)',
      args: [COURSE_ID, mat.filename, contentText, status],
    });
    const materialId = Number(insertResult.lastInsertRowid);

    // Insert analytics entry
    await db.execute({
      sql: 'INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)',
      args: [
        COURSE_ID,
        USER_ID,
        'material_upload',
        JSON.stringify({ materialId, filename: mat.filename, status }),
      ],
    });

    if (status === 'trained') {
      successCount++;
    } else {
      errorCount++;
    }

    const charCount = contentText.length;
    results.push({ filename: mat.filename, status, chars: charCount });
    console.log(`  [${status === 'trained' ? 'OK' : 'ERR'}] ${mat.filename} (${charCount} chars)`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total materials processed: ${materials.length}`);
  console.log(`  Successfully extracted: ${successCount}`);
  console.log(`  Errors (scanned/image PDFs): ${errorCount}`);
  console.log(`  Analytics entries created: ${materials.length}`);
  console.log('\nAll materials inserted for course_id=1 (CSS370).\n');
}

main().catch((err) => {
  console.error('Seed materials failed:', err);
  process.exit(1);
});
