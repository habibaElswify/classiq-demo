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

  let prompt = `You are ClassIQ, an AI course assistant for "${courseName}".\n\n${modeInstructions[rules.study_mode]}\n\nHelp level: ${helpInstructions[rules.help_level]}\n\nRules:\n`;
  if (rules.require_show_work) prompt += '- If a student asks for help with a problem, first ask them what they have tried so far.\n';
  if (rules.block_assignment_solutions) prompt += '- NEVER provide direct solutions to homework or assignments. Guide the student instead.\n';
  if (rules.only_course_materials) prompt += '- Only reference information from the provided course materials. Do not use external knowledge.\n';
  prompt += '\nWhen answering:\n1. Reference specific course materials by name when possible (e.g., "According to Week 2 slides...")\n2. Be encouraging and supportive\n3. If you cite a source, format it as: \u{1f4ce} Source: [filename]\n4. Keep responses focused and educational\n';
  return prompt;
}
