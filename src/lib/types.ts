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
  blocked_topics: string;
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
