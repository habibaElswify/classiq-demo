import Groq from 'groq-sdk';
import { getDb } from './db';
import { getCourseRules, isTopicBlocked, getSystemPrompt } from './rules-engine';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MAX_TOTAL_MATERIALS_CHARS = 60000; // ~15K tokens total for materials context

async function getCourseMaterials(courseId: number): Promise<string> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT filename, content_text FROM materials WHERE course_id = ? AND status = 'trained'",
    args: [courseId],
  });
  const materials = result.rows as unknown as { filename: string; content_text: string }[];
  if (materials.length === 0) return 'No course materials have been uploaded yet.';

  // Build materials context with a total cap to avoid exceeding model context limits
  const perMaterialLimit = Math.min(4000, Math.floor(MAX_TOTAL_MATERIALS_CHARS / materials.length));
  let totalChars = 0;
  const parts: string[] = [];
  for (const m of materials) {
    const chunk = `--- ${m.filename} ---\n${m.content_text.slice(0, perMaterialLimit)}`;
    if (totalChars + chunk.length > MAX_TOTAL_MATERIALS_CHARS) break;
    parts.push(chunk);
    totalChars += chunk.length;
  }
  return parts.join('\n\n');
}

async function getChatHistory(sessionId: number, limit: number = 20): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT role, content FROM chat_messages WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY id DESC LIMIT ?",
    args: [sessionId, limit],
  });
  const messages = result.rows as unknown as { role: 'user' | 'assistant'; content: string }[];
  return messages.reverse();
}

export async function chat(
  courseId: number, sessionId: number, userId: number, message: string
): Promise<{ response: string; blocked: boolean; sources: string[] }> {
  const rules = await getCourseRules(courseId);
  if (!rules) throw new Error('Course rules not found');

  if (rules.exam_mode) {
    return { response: '\u26a0\ufe0f ClassIQ is temporarily disabled for this course during the exam period. Please check back later.', blocked: true, sources: [] };
  }

  if (isTopicBlocked(message, rules)) {
    return { response: `\u26a0\ufe0f I can't help with that topic. ${rules.redirect_message}`, blocked: true, sources: [] };
  }

  const db = getDb();
  const courseResult = await db.execute({
    sql: 'SELECT name FROM courses WHERE id = ?',
    args: [courseId],
  });
  const course = courseResult.rows[0] as unknown as { name: string };
  const systemPrompt = getSystemPrompt(rules, course.name);
  const materials = await getCourseMaterials(courseId);
  const history = await getChatHistory(sessionId);

  const systemContent = `${systemPrompt}\n\n--- COURSE MATERIALS ---\n${materials}`;
  const messages: { role: 'user' | 'assistant'; content: string }[] = [...history, { role: 'user', content: message }];

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemContent },
      ...messages,
    ],
  });

  const aiText = response.choices[0]?.message?.content || '';

  // Extract source citations
  const sourceMatches = aiText.match(/Source: \[([^\]]+)\]/g) || [];
  const sources = sourceMatches.map(s => s.replace('Source: [', '').replace(']', ''));

  await db.execute({
    sql: 'INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)',
    args: [courseId, userId, 'chat_message', JSON.stringify({ blocked: false })],
  });

  return { response: aiText, blocked: false, sources };
}
