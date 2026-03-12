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
  return materials.map(m => `--- ${m.filename} ---\n${m.content_text.slice(0, 8000)}`).join('\n\n');
}

function getChatHistory(sessionId: number, limit: number = 20): { role: 'user' | 'assistant'; content: string }[] {
  const db = getDb();
  const messages = db.prepare(
    "SELECT role, content FROM chat_messages WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY id DESC LIMIT ?"
  ).all(sessionId, limit) as { role: 'user' | 'assistant'; content: string }[];
  return messages.reverse();
}

export async function chat(
  courseId: number, sessionId: number, userId: number, message: string
): Promise<{ response: string; blocked: boolean; sources: string[] }> {
  const rules = getCourseRules(courseId);
  if (!rules) throw new Error('Course rules not found');

  if (rules.exam_mode) {
    return { response: '\u26a0\ufe0f ClassIQ is temporarily disabled for this course during the exam period. Please check back later.', blocked: true, sources: [] };
  }

  if (isTopicBlocked(message, rules)) {
    return { response: `\u26a0\ufe0f I can't help with that topic. ${rules.redirect_message}`, blocked: true, sources: [] };
  }

  const db = getDb();
  const course = db.prepare('SELECT name FROM courses WHERE id = ?').get(courseId) as { name: string };
  const systemPrompt = getSystemPrompt(rules, course.name);
  const materials = getCourseMaterials(courseId);
  const history = getChatHistory(sessionId);

  const systemContent = `${systemPrompt}\n\n--- COURSE MATERIALS ---\n${materials}`;
  const messages: { role: 'user' | 'assistant'; content: string }[] = [...history, { role: 'user', content: message }];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  const aiText = response.content[0].type === 'text' ? response.content[0].text : '';
  const sourceMatches = aiText.match(/\u{1f4ce} Source: \[([^\]]+)\]/g) || [];
  const sources = sourceMatches.map(s => s.replace('\u{1f4ce} Source: [', '').replace(']', ''));

  db.prepare('INSERT INTO analytics (course_id, user_id, action, metadata) VALUES (?, ?, ?, ?)').run(courseId, userId, 'chat_message', JSON.stringify({ blocked: false }));

  return { response: aiText, blocked: false, sources };
}
