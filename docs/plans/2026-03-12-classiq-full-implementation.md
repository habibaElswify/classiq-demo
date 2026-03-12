# ClassIQ Full Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fully functional ClassIQ demo — an AI-powered educational chatbot with student chat, teacher dashboard, admin console, database-backed auth, and a Tampermonkey userscript for Canvas injection.

**Architecture:** Next.js 14 full-stack app with App Router. SQLite via better-sqlite3 for zero-config local database (users, sessions, courses, materials, chat logs, rules). Claude API for AI chat with RAG over uploaded course materials. bcrypt password hashing, JWT session tokens, RBAC middleware. Tampermonkey userscript connects to the local API for Canvas integration demo.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, better-sqlite3, bcrypt, jose (JWT), Anthropic SDK, pdf-parse, Tampermonkey userscript

---

## Project Structure

```
classiq-demo/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with Tailwind
│   │   ├── page.tsx                    # Landing/login page
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts      # POST login
│   │   │   │   ├── register/route.ts   # POST register (admin only in prod)
│   │   │   │   └── me/route.ts         # GET current user
│   │   │   ├── chat/route.ts           # POST send message, GET history
│   │   │   ├── courses/route.ts        # CRUD courses
│   │   │   ├── materials/
│   │   │   │   ├── route.ts            # POST upload, GET list
│   │   │   │   └── [id]/route.ts       # DELETE material
│   │   │   ├── rules/route.ts          # GET/PUT course rules
│   │   │   ├── analytics/route.ts      # GET analytics data
│   │   │   └── admin/
│   │   │       ├── users/route.ts      # CRUD users
│   │   │       └── system/route.ts     # System stats
│   │   ├── student/
│   │   │   └── page.tsx                # Student chat interface
│   │   ├── teacher/
│   │   │   └── page.tsx                # Teacher dashboard
│   │   └── admin/
│   │       └── page.tsx                # Admin console
│   ├── lib/
│   │   ├── db.ts                       # SQLite connection + schema init
│   │   ├── auth.ts                     # JWT helpers, password hashing
│   │   ├── middleware.ts               # Auth middleware for API routes
│   │   ├── ai.ts                       # Claude API + RAG pipeline
│   │   ├── rules-engine.ts             # Topic blocking, study mode logic
│   │   └── types.ts                    # Shared TypeScript types
│   └── components/
│       ├── ChatMessage.tsx
│       ├── ChatInput.tsx
│       ├── Sidebar.tsx
│       ├── MaterialUpload.tsx
│       ├── RulesConfig.tsx
│       ├── AnalyticsCards.tsx
│       └── LoginForm.tsx
├── public/
│   └── classiq-logo.svg
├── tampermonkey/
│   └── classiq-canvas-inject.user.js   # Tampermonkey userscript
├── seed.ts                             # Seed DB with demo data
├── docs/plans/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.local                          # ANTHROPIC_API_KEY, JWT_SECRET
```

---

## Task 1: Project Scaffolding & Database

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/lib/db.ts`, `src/lib/types.ts`
- Create: `.env.local`, `.gitignore`

**Step 1: Initialize Next.js project**

```bash
cd /Users/habibaelswify/Projects/school/CSS370/classiq-demo
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm
```

**Step 2: Install dependencies**

```bash
npm install better-sqlite3 bcryptjs jose @anthropic-ai/sdk pdf-parse
npm install -D @types/better-sqlite3 @types/bcryptjs @types/pdf-parse
```

**Step 3: Create `.env.local`**

```env
ANTHROPIC_API_KEY=your-key-here
JWT_SECRET=classiq-demo-secret-key-2026
DATABASE_PATH=./classiq.db
```

**Step 4: Create `src/lib/types.ts`**

```typescript
export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Course {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  created_at: string;
}

export interface Enrollment {
  id: number;
  user_id: number;
  course_id: number;
  role: UserRole;
}

export interface Material {
  id: number;
  course_id: number;
  filename: string;
  content_text: string;
  status: 'processing' | 'trained' | 'error';
  uploaded_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  course_id: number;
  user_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: string | null;
  created_at: string;
}

export interface CourseRules {
  id: number;
  course_id: number;
  study_mode: 'socratic' | 'direct' | 'practice';
  help_level: 'minimal' | 'guided' | 'full';
  blocked_topics: string; // JSON array
  require_show_work: boolean;
  only_course_materials: boolean;
  block_assignment_solutions: boolean;
  exam_mode: boolean;
  redirect_message: string;
}

export interface AnalyticsEntry {
  id: number;
  course_id: number;
  user_id: number;
  action: string;
  metadata: string | null;
  created_at: string;
}
```

**Step 5: Create `src/lib/db.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './classiq.db';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      filename TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'trained', 'error')),
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS course_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER UNIQUE NOT NULL REFERENCES courses(id),
      study_mode TEXT NOT NULL DEFAULT 'socratic' CHECK(study_mode IN ('socratic', 'direct', 'practice')),
      help_level TEXT NOT NULL DEFAULT 'guided' CHECK(help_level IN ('minimal', 'guided', 'full')),
      blocked_topics TEXT NOT NULL DEFAULT '["Exam answers","Homework solutions","Grade disputes"]',
      require_show_work INTEGER NOT NULL DEFAULT 1,
      only_course_materials INTEGER NOT NULL DEFAULT 1,
      block_assignment_solutions INTEGER NOT NULL DEFAULT 1,
      exam_mode INTEGER NOT NULL DEFAULT 0,
      redirect_message TEXT NOT NULL DEFAULT 'Please contact your instructor during office hours.'
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      sources TEXT,
      feedback TEXT CHECK(feedback IN ('up', 'down', NULL)),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
```

**Step 6: Create `.gitignore`**

```
node_modules/
.next/
*.db
.env.local
```

**Step 7: Initialize git and commit**

```bash
cd /Users/habibaelswify/Projects/school/CSS370/classiq-demo
git init
git add -A
git commit -m "feat: project scaffolding with Next.js, SQLite schema, TypeScript types"
```

---

## Task 2: Authentication System

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/middleware.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/me/route.ts`

**Step 1: Create `src/lib/auth.ts`**

```typescript
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getDb } from './db';
import type { User } from './types';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: number; email: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { userId: number; email: string; role: string };
  } catch {
    return null;
  }
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  return db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (User & { password_hash: string }) | undefined;
}
```

**Step 2: Create `src/lib/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getUserById } from './auth';
import type { User, UserRole } from './types';

export async function authenticate(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) return null;

  return getUserById(payload.userId) || null;
}

export async function requireAuth(req: NextRequest, ...roles: UserRole[]): Promise<User | NextResponse> {
  const user = await authenticate(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}
```

**Step 3: Create `src/app/api/auth/register/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword, createToken, getUserByEmail } from '@/lib/auth';
import type { User } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { email, password, name, role } = await req.json();

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  if (!['student', 'teacher', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);

  const result = db.prepare(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(email, name, passwordHash, role);

  const user: User = {
    id: result.lastInsertRowid as number,
    email,
    name,
    role,
    created_at: new Date().toISOString(),
  };

  const token = await createToken(user);
  return NextResponse.json({ user, token }, { status: 201 });
}
```

**Step 4: Create `src/app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createToken, getUserByEmail } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const { password_hash, ...safeUser } = user;
  const token = await createToken(safeUser);
  return NextResponse.json({ user: safeUser, token });
}
```

**Step 5: Create `src/app/api/auth/me/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  return NextResponse.json({ user: result });
}
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: auth system with bcrypt hashing, JWT tokens, RBAC middleware"
```

---

## Task 3: Course & Enrollment APIs

**Files:**
- Create: `src/app/api/courses/route.ts`
- Create: `src/app/api/rules/route.ts`

**Step 1: Create `src/app/api/courses/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (user instanceof NextResponse) return user;

  const db = getDb();

  if (user.role === 'admin') {
    const courses = db.prepare(`
      SELECT c.*, u.name as teacher_name
      FROM courses c JOIN users u ON c.teacher_id = u.id
    `).all();
    return NextResponse.json({ courses });
  }

  const courses = db.prepare(`
    SELECT c.*, u.name as teacher_name, e.role as enrollment_role
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    JOIN users u ON c.teacher_id = u.id
    WHERE e.user_id = ?
  `).all(user.id);

  return NextResponse.json({ courses });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, 'teacher', 'admin');
  if (user instanceof NextResponse) return user;

  const { name, code } = await req.json();
  if (!name || !code) {
    return NextResponse.json({ error: 'Name and code required' }, { status: 400 });
  }

  const db = getDb();

  const existing = db.prepare('SELECT id FROM courses WHERE code = ?').get(code);
  if (existing) {
    return NextResponse.json({ error: 'Course code already exists' }, { status: 409 });
  }

  const result = db.prepare(
    'INSERT INTO courses (name, code, teacher_id) VALUES (?, ?, ?)'
  ).run(name, code, user.id);

  const courseId = result.lastInsertRowid as number;

  // Auto-enroll the teacher
  db.prepare('INSERT INTO enrollments (user_id, course_id, role) VALUES (?, ?, ?)').run(user.id, courseId, 'teacher');

  // Create default rules
  db.prepare('INSERT INTO course_rules (course_id) VALUES (?)').run(courseId);

  return NextResponse.json({ id: courseId, name, code }, { status: 201 });
}
```

**Step 2: Create `src/app/api/rules/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (user instanceof NextResponse) return user;

  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  const db = getDb();
  const rules = db.prepare('SELECT * FROM course_rules WHERE course_id = ?').get(Number(courseId));
  return NextResponse.json({ rules });
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth(req, 'teacher', 'admin');
  if (user instanceof NextResponse) return user;

  const body = await req.json();
  const { courseId, study_mode, help_level, blocked_topics, require_show_work, only_course_materials, block_assignment_solutions, exam_mode, redirect_message } = body;

  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  const db = getDb();
  db.prepare(`
    UPDATE course_rules SET
      study_mode = COALESCE(?, study_mode),
      help_level = COALESCE(?, help_level),
      blocked_topics = COALESCE(?, blocked_topics),
      require_show_work = COALESCE(?, require_show_work),
      only_course_materials = COALESCE(?, only_course_materials),
      block_assignment_solutions = COALESCE(?, block_assignment_solutions),
      exam_mode = COALESCE(?, exam_mode),
      redirect_message = COALESCE(?, redirect_message)
    WHERE course_id = ?
  `).run(
    study_mode, help_level,
    blocked_topics ? JSON.stringify(blocked_topics) : null,
    require_show_work !== undefined ? (require_show_work ? 1 : 0) : null,
    only_course_materials !== undefined ? (only_course_materials ? 1 : 0) : null,
    block_assignment_solutions !== undefined ? (block_assignment_solutions ? 1 : 0) : null,
    exam_mode !== undefined ? (exam_mode ? 1 : 0) : null,
    redirect_message,
    courseId
  );

  const updated = db.prepare('SELECT * FROM course_rules WHERE course_id = ?').get(courseId);
  return NextResponse.json({ rules: updated });
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: course CRUD, enrollment, and rules engine API"
```

---

## Task 4: Material Upload & Text Extraction

**Files:**
- Create: `src/app/api/materials/route.ts`
- Create: `src/app/api/materials/[id]/route.ts`

**Step 1: Create `src/app/api/materials/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';
import pdfParse from 'pdf-parse';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (user instanceof NextResponse) return user;

  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  const db = getDb();
  const materials = db.prepare(
    'SELECT id, course_id, filename, status, uploaded_at FROM materials WHERE course_id = ?'
  ).all(Number(courseId));

  return NextResponse.json({ materials });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, 'teacher', 'admin');
  if (user instanceof NextResponse) return user;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;

  if (!file || !courseId) {
    return NextResponse.json({ error: 'File and courseId required' }, { status: 400 });
  }

  const db = getDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  let contentText = '';

  try {
    if (file.name.endsWith('.pdf')) {
      const parsed = await pdfParse(buffer);
      contentText = parsed.text;
    } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      contentText = buffer.toString('utf-8');
    } else {
      // For .docx/.pptx we store the filename; in production would use a parser
      contentText = `[Content from ${file.name} - binary format, text extraction pending]`;
    }
  } catch {
    contentText = `[Error extracting text from ${file.name}]`;
  }

  const result = db.prepare(
    'INSERT INTO materials (course_id, filename, content_text, status) VALUES (?, ?, ?, ?)'
  ).run(Number(courseId), file.name, contentText, contentText.length > 10 ? 'trained' : 'error');

  // Log analytics
  db.prepare(
    'INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)'
  ).run(Number(courseId), user.id, 'material_upload', JSON.stringify({ filename: file.name }));

  return NextResponse.json({
    id: result.lastInsertRowid,
    filename: file.name,
    status: contentText.length > 10 ? 'trained' : 'error',
  }, { status: 201 });
}
```

**Step 2: Create `src/app/api/materials/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req, 'teacher', 'admin');
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM materials WHERE id = ?').run(Number(id));
  return NextResponse.json({ success: true });
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: material upload with PDF text extraction for RAG"
```

---

## Task 5: AI Chat Engine with Rules Engine

**Files:**
- Create: `src/lib/rules-engine.ts`
- Create: `src/lib/ai.ts`
- Create: `src/app/api/chat/route.ts`

**Step 1: Create `src/lib/rules-engine.ts`**

```typescript
import { getDb } from './db';
import type { CourseRules } from './types';

export function getCourseRules(courseId: number): CourseRules | null {
  const db = getDb();
  return db.prepare('SELECT * FROM course_rules WHERE course_id = ?').get(courseId) as CourseRules | null;
}

export function isTopicBlocked(message: string, rules: CourseRules): boolean {
  const blocked: string[] = JSON.parse(rules.blocked_topics);
  const lower = message.toLowerCase();
  return blocked.some(topic => lower.includes(topic.toLowerCase()));
}

export function getSystemPrompt(rules: CourseRules, courseName: string): string {
  const modeInstructions: Record<string, string> = {
    socratic: 'Use the Socratic method — ask guiding questions to help the student discover the answer. Do NOT give direct answers. Lead them step by step.',
    direct: 'Provide clear, concise explanations and summaries of the topic.',
    practice: 'Generate practice questions related to the topic and provide feedback on answers.',
  };

  const helpInstructions: Record<string, string> = {
    minimal: 'Give only hints and prompts. Do not explain concepts fully.',
    guided: 'Walk through concepts step by step with moderate detail.',
    full: 'Provide complete, detailed explanations with examples.',
  };

  let prompt = `You are ClassIQ, an AI course assistant for "${courseName}".

${modeInstructions[rules.study_mode]}

Help level: ${helpInstructions[rules.help_level]}

Rules:
`;

  if (rules.require_show_work) {
    prompt += '- If a student asks for help with a problem, first ask them what they have tried so far.\n';
  }
  if (rules.block_assignment_solutions) {
    prompt += '- NEVER provide direct solutions to homework or assignments. Guide the student instead.\n';
  }
  if (rules.only_course_materials) {
    prompt += '- Only reference information from the provided course materials. Do not use external knowledge.\n';
  }

  prompt += `
When answering:
1. Reference specific course materials by name when possible (e.g., "According to Week 2 slides...")
2. Be encouraging and supportive
3. If you cite a source, format it as: 📎 Source: [filename]
4. Keep responses focused and educational
`;

  return prompt;
}
```

**Step 2: Create `src/lib/ai.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from './db';
import { getCourseRules, isTopicBlocked, getSystemPrompt } from './rules-engine';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getCourseMaterials(courseId: number): string {
  const db = getDb();
  const materials = db.prepare(
    "SELECT filename, content_text FROM materials WHERE course_id = ? AND status = 'trained'"
  ).all(courseId) as { filename: string; content_text: string }[];

  if (materials.length === 0) return 'No course materials have been uploaded yet.';

  return materials
    .map(m => `--- ${m.filename} ---\n${m.content_text.slice(0, 8000)}`)
    .join('\n\n');
}

function getChatHistory(sessionId: number, limit: number = 20): { role: 'user' | 'assistant'; content: string }[] {
  const db = getDb();
  const messages = db.prepare(
    "SELECT role, content FROM chat_messages WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY id DESC LIMIT ?"
  ).all(sessionId, limit) as { role: 'user' | 'assistant'; content: string }[];

  return messages.reverse();
}

export async function chat(
  courseId: number,
  sessionId: number,
  userId: number,
  message: string
): Promise<{ response: string; blocked: boolean; sources: string[] }> {
  const rules = getCourseRules(courseId);
  if (!rules) throw new Error('Course rules not found');

  // Check exam mode
  if (rules.exam_mode) {
    return {
      response: '⚠️ ClassIQ is temporarily disabled for this course during the exam period. Please check back later.',
      blocked: true,
      sources: [],
    };
  }

  // Check blocked topics
  if (isTopicBlocked(message, rules)) {
    return {
      response: `⚠️ I can't help with that topic. ${rules.redirect_message}`,
      blocked: true,
      sources: [],
    };
  }

  const db = getDb();
  const course = db.prepare('SELECT name FROM courses WHERE id = ?').get(courseId) as { name: string };
  const systemPrompt = getSystemPrompt(rules, course.name);
  const materials = getCourseMaterials(courseId);
  const history = getChatHistory(sessionId);

  const systemContent = `${systemPrompt}\n\n--- COURSE MATERIALS ---\n${materials}`;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  const aiText = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract source references
  const sourceMatches = aiText.match(/📎 Source: \[([^\]]+)\]/g) || [];
  const sources = sourceMatches.map(s => s.replace('📎 Source: [', '').replace(']', ''));

  // Log analytics
  db.prepare(
    'INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)'
  ).run(courseId, userId, 'chat_message', JSON.stringify({ blocked: false }));

  return { response: aiText, blocked: false, sources };
}
```

**Step 3: Create `src/app/api/chat/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';
import { chat } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (user instanceof NextResponse) return user;

  const { courseId, message, sessionId } = await req.json();
  if (!courseId || !message) {
    return NextResponse.json({ error: 'courseId and message required' }, { status: 400 });
  }

  const db = getDb();

  // Get or create session
  let sid = sessionId;
  if (!sid) {
    const result = db.prepare(
      'INSERT INTO chat_sessions (user_id, course_id) VALUES (?, ?)'
    ).run(user.id, courseId);
    sid = result.lastInsertRowid as number;
  }

  // Save user message
  db.prepare(
    'INSERT INTO chat_messages (session_id, user_id, course_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).run(sid, user.id, courseId, 'user', message);

  try {
    const result = await chat(courseId, sid, user.id, message);

    // Save AI response
    db.prepare(
      'INSERT INTO chat_messages (session_id, user_id, course_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sid, user.id, courseId, 'assistant', result.response, JSON.stringify(result.sources));

    return NextResponse.json({
      sessionId: sid,
      message: result.response,
      blocked: result.blocked,
      sources: result.sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'AI service error', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (user instanceof NextResponse) return user;

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const courseId = req.nextUrl.searchParams.get('courseId');

  const db = getDb();

  if (sessionId) {
    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC'
    ).all(Number(sessionId));
    return NextResponse.json({ messages });
  }

  if (courseId) {
    const sessions = db.prepare(
      'SELECT cs.*, COUNT(cm.id) as message_count FROM chat_sessions cs LEFT JOIN chat_messages cm ON cs.id = cm.session_id WHERE cs.user_id = ? AND cs.course_id = ? GROUP BY cs.id ORDER BY cs.created_at DESC'
    ).all(user.id, Number(courseId));
    return NextResponse.json({ sessions });
  }

  return NextResponse.json({ error: 'sessionId or courseId required' }, { status: 400 });
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: AI chat engine with rules engine, RAG, blocked topics, exam mode"
```

---

## Task 6: Analytics API

**Files:**
- Create: `src/app/api/analytics/route.ts`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/system/route.ts`

**Step 1: Create `src/app/api/analytics/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, 'teacher', 'admin');
  if (user instanceof NextResponse) return user;

  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  const db = getDb();

  const totalMessages = db.prepare(
    "SELECT COUNT(*) as count FROM chat_messages WHERE course_id = ? AND role = 'user'"
  ).get(Number(courseId)) as { count: number };

  const totalSessions = db.prepare(
    'SELECT COUNT(*) as count FROM chat_sessions WHERE course_id = ?'
  ).get(Number(courseId)) as { count: number };

  const blockedAttempts = db.prepare(
    "SELECT COUNT(*) as count FROM analytics WHERE course_id = ? AND action = 'chat_message' AND json_extract(metadata, '$.blocked') = true"
  ).get(Number(courseId)) as { count: number };

  const uniqueStudents = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as count FROM chat_sessions WHERE course_id = ?'
  ).get(Number(courseId)) as { count: number };

  const recentMessages = db.prepare(
    "SELECT cm.*, u.name as user_name FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.course_id = ? AND cm.role = 'user' ORDER BY cm.created_at DESC LIMIT 20"
  ).all(Number(courseId));

  const topTopics = db.prepare(
    "SELECT content, COUNT(*) as count FROM chat_messages WHERE course_id = ? AND role = 'user' GROUP BY content ORDER BY count DESC LIMIT 10"
  ).all(Number(courseId));

  return NextResponse.json({
    totalMessages: totalMessages.count,
    totalSessions: totalSessions.count,
    blockedAttempts: blockedAttempts.count,
    uniqueStudents: uniqueStudents.count,
    recentMessages,
    topTopics,
  });
}
```

**Step 2: Create `src/app/api/admin/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';
import { hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, 'admin');
  if (user instanceof NextResponse) return user;

  const db = getDb();
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, 'admin');
  if (user instanceof NextResponse) return user;

  const { email, name, password, role } = await req.json();
  if (!email || !name || !password || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);

  try {
    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(email, name, passwordHash, role);

    return NextResponse.json({
      id: result.lastInsertRowid,
      email, name, role,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuth(req, 'admin');
  if (user instanceof NextResponse) return user;

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return NextResponse.json({ success: true });
}
```

**Step 3: Create `src/app/api/admin/system/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, 'admin');
  if (user instanceof NextResponse) return user;

  const db = getDb();

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const totalCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get() as { count: number };
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number };
  const totalMaterials = db.prepare('SELECT COUNT(*) as count FROM materials').get() as { count: number };

  const usersByRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
  const recentActivity = db.prepare(
    'SELECT a.*, u.name as user_name FROM analytics a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 50'
  ).all();

  return NextResponse.json({
    totalUsers: totalUsers.count,
    totalCourses: totalCourses.count,
    totalMessages: totalMessages.count,
    totalMaterials: totalMaterials.count,
    usersByRole,
    recentActivity,
  });
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: analytics API and admin user/system management endpoints"
```

---

## Task 7: Database Seed Script

**Files:**
- Create: `seed.ts`

**Step 1: Create `seed.ts`**

```typescript
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('./classiq.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (same as db.ts)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
    UNIQUE(user_id, course_id)
  );
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    filename TEXT NOT NULL,
    content_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'processing',
    uploaded_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS course_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER UNIQUE NOT NULL REFERENCES courses(id),
    study_mode TEXT NOT NULL DEFAULT 'socratic',
    help_level TEXT NOT NULL DEFAULT 'guided',
    blocked_topics TEXT NOT NULL DEFAULT '["Exam answers","Homework solutions","Grade disputes"]',
    require_show_work INTEGER NOT NULL DEFAULT 1,
    only_course_materials INTEGER NOT NULL DEFAULT 1,
    block_assignment_solutions INTEGER NOT NULL DEFAULT 1,
    exam_mode INTEGER NOT NULL DEFAULT 0,
    redirect_message TEXT NOT NULL DEFAULT 'Please contact your instructor during office hours.'
  );
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources TEXT,
    feedback TEXT CHECK(feedback IN ('up', 'down', NULL)),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const hash = bcrypt.hashSync('password123', 12);

// Clear existing data
db.exec('DELETE FROM analytics; DELETE FROM chat_messages; DELETE FROM chat_sessions; DELETE FROM materials; DELETE FROM course_rules; DELETE FROM enrollments; DELETE FROM courses; DELETE FROM users;');

// Users
const insertUser = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)');
insertUser.run('prof.johnson@bellevuecollege.edu', 'Prof. Johnson', hash, 'teacher');  // id=1
insertUser.run('habiba@bellevuecollege.edu', 'Habiba El-Swify', hash, 'student');      // id=2
insertUser.run('admin@bellevuecollege.edu', 'System Admin', hash, 'admin');             // id=3
insertUser.run('alex.chen@bellevuecollege.edu', 'Alex Chen', hash, 'student');          // id=4
insertUser.run('maria.garcia@bellevuecollege.edu', 'Maria Garcia', hash, 'student');    // id=5

// Courses
const insertCourse = db.prepare('INSERT INTO courses (name, code, teacher_id) VALUES (?, ?, ?)');
insertCourse.run('Software Engineering & Analysis', 'CSS370', 1);  // id=1
insertCourse.run('Data Structures & Algorithms', 'CSS343', 1);     // id=2

// Enrollments
const insertEnroll = db.prepare('INSERT INTO enrollments (user_id, course_id, role) VALUES (?, ?, ?)');
insertEnroll.run(1, 1, 'teacher');
insertEnroll.run(1, 2, 'teacher');
insertEnroll.run(2, 1, 'student');
insertEnroll.run(2, 2, 'student');
insertEnroll.run(4, 1, 'student');
insertEnroll.run(5, 1, 'student');

// Course Rules
const insertRules = db.prepare('INSERT INTO course_rules (course_id, study_mode, help_level, blocked_topics, redirect_message) VALUES (?, ?, ?, ?, ?)');
insertRules.run(1, 'socratic', 'guided', '["Exam answers","Homework solutions","Grade disputes","Final project code"]', 'Please contact Prof. Johnson during office hours (MWF 2-4pm) or email: johnson@bellevuecollege.edu');
insertRules.run(2, 'direct', 'full', '["Exam answers","Assignment solutions"]', 'Please visit office hours for assignment help.');

// Sample materials for CSS 370
const insertMaterial = db.prepare('INSERT INTO materials (course_id, filename, content_text, status) VALUES (?, ?, ?, ?)');
insertMaterial.run(1, 'Syllabus_CSS370_Winter2026.pdf', `CSS 370 - Software Engineering & Analysis
Bellevue College - Winter 2026
Instructor: Prof. Johnson

Course Description: Introduction to software analysis and design concepts including requirements gathering, system modeling, architecture design, security analysis, and cost estimation.

Topics covered:
- Sprint 1: Customer Segmentation
- Sprint 2: Customer Profiles & Personas
- Sprint 3: Customer Scenarios
- Sprint 4: Requirements & Axiomatic Design
- Sprint 5 & 6: System Architecture (4+1 views, UML diagrams)
- Sprint 7: ICONIX Process, Robustness & Sequence Diagrams
- Sprint 8: Security, STRIDE, DREAD, DFDs, Threat Modeling
- Sprint 9: Cost Estimation, NPV, ROI, TCO
- Sprint 10: UX Design & Wireframing

Grading: Quizzes 30%, Team Project 40%, Individual Assignments 20%, Participation 10%`, 'trained');

insertMaterial.run(1, 'Sprint7_ICONIX_Slides.pdf', `ICONIX Process - Transforming Requirements to Code Design

ICONIX = Object-Oriented analysis & design methodology
- Use-case centric approach
- Uses 4 of 9 UML diagrams (robustness is NOT UML)
- Created in the 1990s, sits between heavy-documentation approaches and XP
- Does NOT discard analysis like XP does

Behavior Allocation = the hardest thing in OO development
Sequence diagrams help with behavior allocation

ICONIX Flow:
GUI Prototype → Use Case Model → Robustness Diagram → Sequence Diagram
Domain Model connects to Class Diagram

7 Steps of ICONIX:
1. Domain Model
2. Use Cases
3. VALIDATE
4. Robustness Diagram
5. VALIDATE
6. Sequence Diagram
7. VALIDATE

Robustness Diagram Symbols:
- Entity (circle with underline) = Model in MVC, goes on class diagram 1:1 with domain
- Boundary (circle with T-line) = View in MVC, goes on class diagram
- Control (circle with arrow) = Controller in MVC, does NOT go on class diagram, becomes methods
- Actor (stick figure) = user/external system, NOT an object

Communication Rules:
- Actor ↔ Boundary: ALLOWED
- Boundary ↔ Control: ALLOWED
- Control ↔ Control: ALLOWED
- Control ↔ Entity: ALLOWED
- Actor → Control: NOT ALLOWED
- Boundary → Boundary: NOT ALLOWED
- Boundary → Entity: NOT ALLOWED
- Entity → Entity: NOT ALLOWED
RULE: Nouns never talk to nouns. Control is the hub.

Each use case = exactly 1 robustness diagram
Boundary relationships: Open diamond = ownership

Sequence Diagrams:
- Lifeline = dashed vertical line
- Message = solid arrow (method call)
- Response = dashed arrow
- Activation Box = thick bar on lifeline
- Callback = self-loop
- Loop fragment = [loop: condition]

Robustness → Sequence mapping:
- Controls become MESSAGES (arrows between objects)
- Boundary/Entity become OBJECTS on lifelines`, 'trained');

insertMaterial.run(1, 'Sprint8_Security_Slides.pdf', `Security in Software Engineering

Security = NON-FUNCTIONAL requirement
Weakest link = HUMANS

CIA Triad + Authentication + Non-Repudiation:
- Confidentiality: Non-disclosure of information
- Integrity: Data changed using appropriate methods and parties
- Availability: Services accessible when needed
- Authentication: Verification of identity
- Non-Repudiation: Neither sender nor recipient can deny message/transaction validity

3 Tenets of Cybersecurity (ALL 3 needed for vulnerability):
1. System Susceptibility (misconfiguration, exposed ports, no patches)
2. Threat Accessibility (internet-exposed, misconfigured cloud)
3. Threat Capability (tools, techniques, resources)

STRIDE (Security Development Lifecycle):
S = Spoofing (violates Authentication) - posing as someone else
T = Tampering (violates Integrity) - altering/changing info without permission
R = Repudiation (violates Non-repudiation) - denying being the attacker
I = Info Disclosure (violates Confidentiality) - access to sensitive info
D = Denial of Service (violates Availability) - work stoppage
E = Elevation of Privilege (violates Authorization) - privilege escalation

STRIDE-DFD Mapping:
- External Entity: S, R
- Data Flow: T, I, D
- Data Store: T, R, I, D
- Process: S, T, R, I, D, E (ALL SIX)

DREAD (prioritizes threats AFTER STRIDE identifies them):
D = Damage potential (0=trivial, 5=sensitive, 10=admin level)
R = Reproducibility (0=very difficult, 5=three steps, 10=web browser)
E = Exploitability (0=very skilled, 5=automated, 10=novice)
A = Affected users (0=few, 5=some, 10=all)
D = Discoverability (0=unlikely, 5=few access, 10=published)
Score = D + R + E + A + D (higher = higher priority)

Threat Responses: Accept, Transfer, Mitigate (MOST COMMON), Avoid (RARE)`, 'trained');

insertMaterial.run(1, 'Sprint9_CostEstimation_Slides.pdf', `Cost Estimation in Software Engineering

3 Cost Categories:
1. Initial Investment: dev effort, new infrastructure, migration/rollout (HIGH RISK), training
2. On-going Operations (Non-Eng): infrastructure, ops support, tech support, training, repair
3. Continuing Development (Eng): infrastructure evolution, critical systems, bugs, new features

Estimation Methods (weakest to strongest):
Guessing → Expert → Using Metrics (SCRUM/planning poker)

Ranking: Past Experience > Empirical Models (COCOMO II) > Guesstimates

Planning Poker: Cards 1, 3, 5, 8, 13

Cost/Benefit Analyses:
- Break-Even: old vs new systems, unit costs, economies of scale
- Payback: when cumulative benefits offset costs, zero time = deployment
- Cash-Flow: outlays vs revenues monthly/quarterly
- NPV = 1/(1+i)^n where i=discount rate, n=years
- ROI = (benefits - costs) / costs, calculated over ~5 years
- TCO: Total Cost of Ownership over ~5 years`, 'trained');

// Sample chat sessions and messages for analytics
const insertSession = db.prepare('INSERT INTO chat_sessions (user_id, course_id) VALUES (?, ?)');
insertSession.run(2, 1);  // Habiba, CSS370, session id=1
insertSession.run(4, 1);  // Alex, CSS370, session id=2

const insertMsg = db.prepare('INSERT INTO chat_messages (session_id, user_id, course_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)');
insertMsg.run(1, 2, 1, 'user', 'Can you explain what STRIDE is?', null);
insertMsg.run(1, 2, 1, 'assistant', 'STRIDE is a threat modeling framework used in the Security Development Lifecycle (SDL). Each letter represents a type of security threat:\n\n**S** - Spoofing (violates Authentication)\n**T** - Tampering (violates Integrity)\n**R** - Repudiation (violates Non-repudiation)\n**I** - Information Disclosure (violates Confidentiality)\n**D** - Denial of Service (violates Availability)\n**E** - Elevation of Privilege (violates Authorization)\n\n📎 Source: [Sprint8_Security_Slides.pdf]', '["Sprint8_Security_Slides.pdf"]');
insertMsg.run(1, 2, 1, 'user', 'How does STRIDE map to DFD elements?', null);
insertMsg.run(1, 2, 1, 'assistant', 'Great follow-up! Here is how STRIDE threats map to DFD elements:\n\n- **External Entity**: S, R (Spoofing, Repudiation)\n- **Data Flow**: T, I, D (Tampering, Info Disclosure, DoS)\n- **Data Store**: T, R, I, D (Tampering, Repudiation, Info Disclosure, DoS)\n- **Process**: ALL SIX (S, T, R, I, D, E)\n\nNotice that **Elevation of Privilege only applies to Processes**.\n\n📎 Source: [Sprint8_Security_Slides.pdf]', '["Sprint8_Security_Slides.pdf"]');

// Analytics entries
const insertAnalytics = db.prepare('INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)');
for (let i = 0; i < 50; i++) {
  const userId = [2, 4, 5][Math.floor(Math.random() * 3)];
  insertAnalytics.run(1, userId, 'chat_message', '{"blocked": false}');
}
insertAnalytics.run(1, 2, 'chat_message', '{"blocked": true}');
insertAnalytics.run(1, 1, 'material_upload', '{"filename": "Sprint7_ICONIX_Slides.pdf"}');

console.log('Database seeded successfully!');
console.log('Demo accounts:');
console.log('  Student: habiba@bellevuecollege.edu / password123');
console.log('  Teacher: prof.johnson@bellevuecollege.edu / password123');
console.log('  Admin:   admin@bellevuecollege.edu / password123');

db.close();
```

**Step 2: Add seed script to package.json**

Add to `package.json` scripts:
```json
"seed": "npx tsx seed.ts"
```

**Step 3: Run seed**

```bash
npm install -D tsx
npm run seed
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed script with demo users, courses, materials, and sample chat data"
```

---

## Task 8: Login Page UI

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/LoginForm.tsx`

**Step 1: Create `src/components/LoginForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Route based on role
      switch (data.user.role) {
        case 'student': router.push('/student'); break;
        case 'teacher': router.push('/teacher'); break;
        case 'admin': router.push('/admin'); break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (email: string) => {
    setEmail(email);
    setPassword('password123');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🤖</div>
          <h1 className="text-3xl font-bold text-purple-700">ClassIQ</h1>
          <p className="text-gray-500 mt-1">AI-Powered Course Assistant</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Sign In</h2>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              placeholder="you@bellevuecollege.edu"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center mb-3">Quick Demo Login</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => quickLogin('habiba@bellevuecollege.edu')}
                className="flex-1 text-xs py-2 px-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                👩‍🎓 Student
              </button>
              <button type="button" onClick={() => quickLogin('prof.johnson@bellevuecollege.edu')}
                className="flex-1 text-xs py-2 px-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition">
                👨‍🏫 Teacher
              </button>
              <button type="button" onClick={() => quickLogin('admin@bellevuecollege.edu')}
                className="flex-1 text-xs py-2 px-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                🔧 Admin
              </button>
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          FERPA Compliant • End-to-End Encrypted • Canvas LMS Integration
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Update `src/app/page.tsx`**

```tsx
import LoginForm from '@/components/LoginForm';

export default function Home() {
  return <LoginForm />;
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: login page with quick-demo buttons for all 3 roles"
```

---

## Task 9: Student Chat Interface

**Files:**
- Create: `src/app/student/page.tsx`
- Create: `src/components/ChatMessage.tsx`
- Create: `src/components/ChatInput.tsx`
- Create: `src/components/Sidebar.tsx`

This is the largest UI task. The student page replicates the wireframe from Sprint 10 with a Canvas-like sidebar, chat header with course selector, welcome banner, quick actions, message bubbles with source citations, feedback buttons, suggested follow-ups, academic integrity warnings, and the input bar.

**Step 1: Create `src/components/Sidebar.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';

interface SidebarProps {
  role: 'student' | 'teacher' | 'admin';
  activePage: string;
}

export default function Sidebar({ role, activePage }: SidebarProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  return (
    <div className="w-44 bg-[#2D3B45] text-white flex flex-col min-h-screen flex-shrink-0">
      <div className="p-4 text-sm font-bold border-b border-gray-600">CANVAS</div>
      <nav className="flex-1 pt-2">
        <SidebarItem label="Dashboard" icon="📊" />
        <SidebarItem label="Courses" icon="📚" active />
        <div className="px-4 pt-3 pb-1 text-[10px] text-gray-400 uppercase tracking-wider">CSS 370 Tools</div>
        <SidebarItem label="Modules" icon="📋" />
        <SidebarItem label="Assignments" icon="📝" />
        <SidebarItem label="Discussions" icon="💬" />
        <SidebarItem label="Grades" icon="📊" />
        {role === 'student' && (
          <SidebarItem label="Course Assistant" icon="🤖" active={activePage === 'chat'} highlight
            onClick={() => router.push('/student')} />
        )}
        {role === 'teacher' && (
          <SidebarItem label="AI Config" icon="⚙️" active={activePage === 'config'} highlight
            onClick={() => router.push('/teacher')} />
        )}
      </nav>
      <button onClick={handleLogout} className="m-3 py-2 text-xs text-gray-400 hover:text-white transition">
        ← Sign Out
      </button>
    </div>
  );
}

function SidebarItem({ label, icon, active, highlight, onClick }: {
  label: string; icon: string; active?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-2.5 text-sm flex items-center gap-2 cursor-pointer transition
        ${active && highlight ? 'bg-[#5D3FD3] border-l-3 border-yellow-400' : ''}
        ${active && !highlight ? 'bg-[#3d4f5f]' : ''}
        ${!active ? 'hover:bg-[#3d4f5f]' : ''}
      `}
    >
      <span>{icon}</span> {label}
    </div>
  );
}
```

**Step 2: Create `src/components/ChatMessage.tsx`**

```tsx
'use client';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string[];
  timestamp?: string;
  userName?: string;
  blocked?: boolean;
  onFeedback?: (type: 'up' | 'down') => void;
  onFollowUp?: (question: string) => void;
}

export default function ChatMessage({ role, content, sources, timestamp, userName, blocked, onFeedback, onFollowUp }: ChatMessageProps) {
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (role === 'user') {
    return (
      <div className="mb-5 flex flex-col items-end">
        <div className="text-xs text-gray-400 mb-1">{userName || 'You'} — {time}</div>
        <div className="max-w-[75%] px-4 py-3 rounded-xl rounded-br-sm bg-gradient-to-br from-[#5D3FD3] to-[#4a2c82] text-white text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-col items-start">
      <div className="text-xs text-gray-400 mb-1">🤖 ClassIQ — {time}</div>
      <div className={`max-w-[75%] px-4 py-3 rounded-xl rounded-bl-sm text-sm leading-relaxed
        ${blocked ? 'bg-amber-50 border border-amber-200 border-l-4 border-l-orange-500' : 'bg-white border border-gray-200'}
      `}>
        <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
          __html: content
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-[#5D3FD3]">$1</strong>')
            .replace(/\n/g, '<br/>')
        }} />
        {sources && sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
            {sources.map((s, i) => (
              <span key={i} className="text-blue-600">📎 Source: [{s}] </span>
            ))}
          </div>
        )}
      </div>
      {!blocked && onFeedback && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          <span>Was this helpful?</span>
          <button onClick={() => onFeedback('up')} className="px-2 py-1 bg-gray-100 rounded-full hover:bg-purple-100 transition">👍</button>
          <button onClick={() => onFeedback('down')} className="px-2 py-1 bg-gray-100 rounded-full hover:bg-purple-100 transition">👎</button>
        </div>
      )}
      {!blocked && onFollowUp && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {['Can you give more examples?', 'How is this tested?', 'Explain further'].map((q, i) => (
            <button key={i} onClick={() => onFollowUp(q)}
              className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-600 hover:text-white transition">
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create `src/components/ChatInput.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    onSend(message.trim());
    setMessage('');
  };

  return (
    <div className="border-t border-gray-200 bg-white px-5 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <button type="button" className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg hover:bg-gray-200">
          📎
        </button>
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Type your question..."
          disabled={disabled}
          className="flex-1 px-5 py-3 border-2 border-gray-200 rounded-full text-sm outline-none focus:border-[#5D3FD3] transition disabled:opacity-50"
        />
        <button type="submit" disabled={disabled || !message.trim()}
          className="w-11 h-11 bg-[#5D3FD3] hover:bg-[#4a2c82] text-white rounded-full flex items-center justify-center text-lg transition disabled:opacity-50">
          ➤
        </button>
      </form>
      <p className="text-center text-[11px] text-gray-400 mt-1.5">
        ClassIQ references only your uploaded course materials • FERPA compliant
      </p>
    </div>
  );
}
```

**Step 4: Create `src/app/student/page.tsx`**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';

interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string[];
  blocked?: boolean;
  created_at?: string;
}

interface Course {
  id: number;
  name: string;
  code: string;
}

export default function StudentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored || !token) { router.push('/'); return; }
    setUser(JSON.parse(stored));

    fetch('/api/courses', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setCourses(data.courses || []);
        if (data.courses?.length) setSelectedCourse(data.courses[0].id);
      });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!selectedCourse || !token) return;

    const userMsg: Message = { role: 'user', content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseId: selectedCourse, message: content, sessionId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.sessionId) setSessionId(data.sessionId);

      const aiMsg: Message = {
        role: 'assistant',
        content: data.message,
        sources: data.sources,
        blocked: data.blocked,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error connecting to AI service. Please try again.', created_at: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const courseName = courses.find(c => c.id === selectedCourse)?.name || 'Course';

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role="student" activePage="chat" />

      <div className="flex-1 flex flex-col">
        {/* Canvas top nav */}
        <div className="bg-[#2D3B45] text-white px-5 py-2.5 flex justify-between items-center text-sm">
          <div className="flex gap-5">
            <span className="font-bold">CANVAS</span>
            <span className="opacity-70">Dashboard</span>
            <span className="opacity-70">Courses</span>
            <span className="opacity-70">Calendar</span>
          </div>
          <div className="flex items-center gap-3">
            <span>🔔</span>
            <span>👤 {user?.name}</span>
          </div>
        </div>

        {/* Chat header */}
        <div className="bg-gradient-to-r from-[#5D3FD3] to-[#4a2c82] text-white px-5 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg font-semibold">ClassIQ Course Assistant</h2>
            <select
              value={selectedCourse || ''}
              onChange={e => { setSelectedCourse(Number(e.target.value)); setMessages([]); setSessionId(null); }}
              className="bg-white/20 border border-white/30 text-white px-3 py-1.5 rounded-md text-sm [&>option]:text-black"
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white/15 border border-white/20 rounded-md text-sm hover:bg-white/25">🕐 History</button>
            <button className="px-3 py-1.5 bg-white/15 border border-white/20 rounded-md text-sm hover:bg-white/25">⚙️ Settings</button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 && (
            <>
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-5 text-center mb-5">
                <h3 className="text-[#5D3FD3] font-semibold text-lg mb-2">👋 Welcome to ClassIQ!</h3>
                <p className="text-gray-500 text-sm">
                  I'm your AI study assistant for <strong>{courseName}</strong>.<br />
                  I can help you understand concepts from your course materials. Ask me anything!
                </p>
              </div>
              <div className="flex gap-3 justify-center flex-wrap mb-6">
                {['💡 Explain a concept', '📝 Review for quiz', '📖 Summarize lecture', '🔍 Clarify syllabus'].map(action => (
                  <button key={action} onClick={() => sendMessage(action.slice(2))}
                    className="px-4 py-2 bg-white border-2 border-[#5D3FD3] text-[#5D3FD3] rounded-full text-sm font-medium hover:bg-[#5D3FD3] hover:text-white transition">
                    {action}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              blocked={msg.blocked}
              timestamp={msg.created_at}
              userName={user?.name}
              onFeedback={msg.role === 'assistant' && !msg.blocked ? () => {} : undefined}
              onFollowUp={msg.role === 'assistant' && !msg.blocked ? (q) => sendMessage(q) : undefined}
            />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
              ClassIQ is thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <ChatInput onSend={sendMessage} disabled={loading || !selectedCourse} />
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: student chat interface matching Sprint 10 wireframes"
```

---

## Task 10: Teacher Dashboard

**Files:**
- Create: `src/app/teacher/page.tsx`

This is one large file that replicates the Teacher Configuration Dashboard wireframe — tabs for Configuration/Analytics/Privacy, material upload, blocked topics, study mode selector, help level slider, exam mode toggle, and analytics cards.

**Step 1: Create `src/app/teacher/page.tsx`** — Full teacher dashboard with all wireframe features (material management, rules config, analytics preview, exam mode). Code mirrors the Sprint 10 wireframe layout exactly.

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: teacher dashboard with material upload, rules config, analytics"
```

---

## Task 11: Admin Console

**Files:**
- Create: `src/app/admin/page.tsx`

Admin page with system stats cards, user management table (CRUD), course overview, recent activity log.

**Step 1: Create admin page with user management, system stats, course list**

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: admin console with user management and system stats"
```

---

## Task 12: Tampermonkey Canvas Injection Script

**Files:**
- Create: `tampermonkey/classiq-canvas-inject.user.js`

**Step 1: Create the userscript**

```javascript
// ==UserScript==
// @name         ClassIQ Canvas Integration
// @namespace    classiq-demo
// @version      1.0
// @description  Injects ClassIQ AI Course Assistant into Canvas LMS
// @match        https://*.instructure.com/*
// @match        http://localhost:3000/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
  'use strict';

  const API_BASE = 'http://localhost:3000';
  let token = null;
  let sessionId = null;
  let isOpen = false;
  let courseId = 1; // Default to CSS 370

  // Auto-login as demo student
  async function autoLogin() {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'habiba@bellevuecollege.edu', password: 'password123' }),
    });
    const data = await res.json();
    token = data.token;
  }

  async function sendMessage(message) {
    if (!token) await autoLogin();
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ courseId, message, sessionId }),
    });
    const data = await res.json();
    sessionId = data.sessionId;
    return data;
  }

  // Inject floating button + chat widget
  // ... (full widget HTML/CSS/JS injected into page)

  autoLogin();
})();
```

The full userscript creates a floating purple 🤖 button in the bottom-right corner of Canvas. Clicking it opens a chat widget that connects to the local ClassIQ API. It handles message sending, displays AI responses with source citations, shows blocked topic warnings, and has a minimize/close button.

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: Tampermonkey userscript for Canvas LMS injection"
```

---

## Task 13: Final Testing & Demo Script

**Step 1: Start the app and verify all flows**

```bash
cd /Users/habibaelswify/Projects/school/CSS370/classiq-demo
npm run seed
npm run dev
```

**Step 2: Test all 3 roles**

1. Open http://localhost:3000
2. Click "Student" quick login → verify chat works, sources shown, blocked topics rejected
3. Go back, click "Teacher" → verify material list, rules config, analytics
4. Go back, click "Admin" → verify user list, system stats

**Step 3: Test Tampermonkey injection**

1. Install Tampermonkey extension
2. Add the userscript from `tampermonkey/classiq-canvas-inject.user.js`
3. Navigate to Canvas → floating button appears → chat works

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: ClassIQ v1.0 - full implementation ready for demo"
```

---

## Demo Script (for presenting to teacher)

1. **Login Page** — Show 3-role authentication system with bcrypt + JWT
2. **Student View** — Ask "What is STRIDE?" → show source citations from Sprint 8 slides
3. **Academic Integrity** — Ask "Give me the exam answers" → show blocked topic response
4. **Teacher Dashboard** — Upload a material, toggle exam mode, change study mode
5. **Admin Console** — Show user management, system analytics
6. **Canvas Integration** — Switch to Canvas tab, show floating chatbot widget injected via Tampermonkey
7. **Database** — Show SQLite DB with real data (optional: open with DB viewer)

---

## Architecture Diagram (for presentation)

```
┌─────────────────────────────────────────────────┐
│                  BROWSER                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Student  │  │ Teacher  │  │ Admin        │  │
│  │ Chat UI  │  │ Dashboard│  │ Console      │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       └──────────────┼───────────────┘          │
│                      │ REST API                  │
├──────────────────────┼──────────────────────────┤
│              NEXT.JS SERVER                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Auth    │  │ Rules    │  │ AI Engine    │   │
│  │ (JWT)   │  │ Engine   │  │ (Claude API) │   │
│  └────┬────┘  └────┬─────┘  └──────┬───────┘   │
│       └─────────────┼───────────────┘           │
│                     │                            │
│              ┌──────┴──────┐                     │
│              │  SQLite DB  │                     │
│              │  (users,    │                     │
│              │   courses,  │                     │
│              │   materials,│                     │
│              │   chat logs)│                     │
│              └─────────────┘                     │
├─────────────────────────────────────────────────┤
│  TAMPERMONKEY SCRIPT → injects widget into      │
│  Canvas LMS → connects to localhost:3000 API    │
└─────────────────────────────────────────────────┘
```
