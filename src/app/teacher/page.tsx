'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface Course {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  created_at: string;
}

interface MaterialItem {
  id: number;
  course_id: number;
  filename: string;
  status: 'processing' | 'trained' | 'error';
  uploaded_at: string;
}

interface RulesData {
  id: number;
  course_id: number;
  study_mode: 'socratic' | 'direct' | 'practice';
  help_level: 'minimal' | 'guided' | 'full';
  blocked_topics: string;
  require_show_work: number | boolean;
  only_course_materials: number | boolean;
  block_assignment_solutions: number | boolean;
  exam_mode: number | boolean;
  redirect_message: string;
}

interface AnalyticsData {
  totalMessages: number;
  totalSessions: number;
  blockedAttempts: number;
  uniqueStudents: number;
  recentMessages: { id: number; content: string; created_at: string; user_name: string }[];
  topTopics: { content: string; count: number }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token') ?? '';
  return { Authorization: `Bearer ${token}` };
}

function toBool(v: number | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  return v === 1;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TeacherDashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth + data
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [rules, setRules] = useState<RulesData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'config' | 'analytics' | 'privacy'>('config');
  const [selectedMaterials, setSelectedMaterials] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Config state (local mirrors of rules)
  const [studyMode, setStudyMode] = useState<'socratic' | 'direct' | 'practice'>('socratic');
  const [helpLevel, setHelpLevel] = useState<'minimal' | 'guided' | 'full'>('guided');
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [redirectMessage, setRedirectMessage] = useState('');
  const [requireShowWork, setRequireShowWork] = useState(false);
  const [onlyCourseMaterials, setOnlyCourseMaterials] = useState(false);
  const [blockAssignmentSolutions, setBlockAssignmentSolutions] = useState(false);
  const [allowPracticeProblems, setAllowPracticeProblems] = useState(true);
  const [examMode, setExamMode] = useState(false);

  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  /* ---- Auth check ---- */
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/');
      return;
    }
    const parsed: User = JSON.parse(stored);
    if (parsed.role !== 'teacher') {
      router.push('/');
      return;
    }
    setUser(parsed);
  }, [router]);

  /* ---- Fetch courses ---- */
  useEffect(() => {
    if (!user) return;
    fetch('/api/courses', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const list: Course[] = Array.isArray(data) ? data : data.courses ?? [];
        setCourses(list);
        if (list.length > 0) setActiveCourseId(list[0].id);
      })
      .catch(console.error);
  }, [user]);

  /* ---- Fetch materials ---- */
  const fetchMaterials = useCallback(() => {
    if (!activeCourseId) return;
    fetch(`/api/materials?courseId=${activeCourseId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const list: MaterialItem[] = Array.isArray(data) ? data : data.materials ?? [];
        setMaterials(list);
      })
      .catch(console.error);
  }, [activeCourseId]);

  /* ---- Fetch rules ---- */
  const fetchRules = useCallback(() => {
    if (!activeCourseId) return;
    fetch(`/api/rules?courseId=${activeCourseId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: RulesData) => {
        if (data && data.id) {
          setRules(data);
          setStudyMode(data.study_mode ?? 'socratic');
          setHelpLevel(data.help_level ?? 'guided');
          setBlockedTopics(
            data.blocked_topics ? data.blocked_topics.split(',').filter(Boolean) : []
          );
          setRedirectMessage(data.redirect_message ?? '');
          setRequireShowWork(toBool(data.require_show_work));
          setOnlyCourseMaterials(toBool(data.only_course_materials));
          setBlockAssignmentSolutions(toBool(data.block_assignment_solutions));
          setExamMode(toBool(data.exam_mode));
        }
      })
      .catch(console.error);
  }, [activeCourseId]);

  /* ---- Fetch analytics ---- */
  const fetchAnalytics = useCallback(() => {
    if (!activeCourseId) return;
    fetch(`/api/analytics?courseId=${activeCourseId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: AnalyticsData) => setAnalytics(data))
      .catch(console.error);
  }, [activeCourseId]);

  useEffect(() => {
    fetchMaterials();
    fetchRules();
    fetchAnalytics();
  }, [fetchMaterials, fetchRules, fetchAnalytics]);

  /* ---- Save rules ---- */
  const saveRules = async (overrides?: Partial<{
    study_mode: string;
    help_level: string;
    blocked_topics: string[];
    require_show_work: boolean;
    only_course_materials: boolean;
    block_assignment_solutions: boolean;
    exam_mode: boolean;
    redirect_message: string;
  }>) => {
    if (!activeCourseId) return;
    setSaving(true);
    try {
      await fetch('/api/rules', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: activeCourseId,
          study_mode: overrides?.study_mode ?? studyMode,
          help_level: overrides?.help_level ?? helpLevel,
          blocked_topics: overrides?.blocked_topics ?? blockedTopics,
          require_show_work: overrides?.require_show_work ?? requireShowWork,
          only_course_materials: overrides?.only_course_materials ?? onlyCourseMaterials,
          block_assignment_solutions: overrides?.block_assignment_solutions ?? blockAssignmentSolutions,
          exam_mode: overrides?.exam_mode ?? examMode,
          redirect_message: overrides?.redirect_message ?? redirectMessage,
        }),
      });
      setLastSaved(new Date());
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Upload material ---- */
  const uploadFile = async (file: File) => {
    if (!activeCourseId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('courseId', String(activeCourseId));
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: fd,
      });
      if (res.ok) {
        fetchMaterials();
      }
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  /* ---- Delete material ---- */
  const deleteMaterial = async (id: number) => {
    try {
      await fetch(`/api/materials/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      setSelectedMaterials((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  /* ---- Drag & drop handlers ---- */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
  };

  /* ---- Blocked topics ---- */
  const addTopic = () => {
    const t = newTopic.trim();
    if (!t || blockedTopics.includes(t)) return;
    const updated = [...blockedTopics, t];
    setBlockedTopics(updated);
    setNewTopic('');
    setShowTopicInput(false);
    saveRules({ blocked_topics: updated });
  };

  const removeTopic = (topic: string) => {
    const updated = blockedTopics.filter((t) => t !== topic);
    setBlockedTopics(updated);
    saveRules({ blocked_topics: updated });
  };

  /* ---- Reset to defaults ---- */
  const resetDefaults = () => {
    setStudyMode('socratic');
    setHelpLevel('guided');
    setBlockedTopics([]);
    setRedirectMessage('');
    setRequireShowWork(false);
    setOnlyCourseMaterials(false);
    setBlockAssignmentSolutions(false);
    setAllowPracticeProblems(true);
    setExamMode(false);
    saveRules({
      study_mode: 'socratic',
      help_level: 'guided',
      blocked_topics: [],
      require_show_work: false,
      only_course_materials: false,
      block_assignment_solutions: false,
      exam_mode: false,
      redirect_message: '',
    });
  };

  /* ---- Active course info ---- */
  const activeCourse = courses.find((c) => c.id === activeCourseId);

  /* ---- Status badge helper ---- */
  const statusBadge = (status: string) => {
    switch (status) {
      case 'trained':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <span className="text-green-500">&#9679;</span> Trained
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
            <span className="text-orange-500">&#9679;</span> Processing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
            <span className="text-gray-400">&#9675;</span> Not uploaded
          </span>
        );
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar role="teacher" activePage="config" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ===== Canvas-style Header ===== */}
        <header className="flex items-center justify-between px-6 py-3 bg-[#4a2c82] text-white flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              aria-label="Go back"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium">
              Canvas | Course: {activeCourse?.code ?? 'CSS 370'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">{user.name || 'Prof. Johnson'}</span>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
              {(user.name || 'P')[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* ===== Page Title ===== */}
        <div className="bg-gradient-to-r from-[#5D3FD3] to-[#7B5FE0] px-8 py-5 flex-shrink-0">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">&#129302;</span> AI Assistant Configuration
          </h1>
          <p className="text-white/70 text-sm mt-1">
            Configure how the AI assistant behaves for your students
          </p>
        </div>

        {/* ===== Tabs ===== */}
        <div className="bg-white border-b border-gray-200 px-8 flex-shrink-0">
          <nav className="flex gap-1 -mb-px pt-2">
            {([
              { key: 'config' as const, label: '\u2699\uFE0F Configuration' },
              { key: 'analytics' as const, label: '\uD83D\uDCCA Analytics' },
              { key: 'privacy' as const, label: '\uD83D\uDD12 Privacy & Safety' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#5D3FD3] text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ===== Tab Content ===== */}
        <div className="flex-1 overflow-y-auto">
          {/* ---------- CONFIGURATION TAB ---------- */}
          {activeTab === 'config' && (
            <div className="max-w-7xl mx-auto px-8 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ======= LEFT COLUMN ======= */}
                <div className="space-y-6">
                  {/* --- Training Materials --- */}
                  <section className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Training Materials</h2>

                    {/* Drag & Drop Zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        dragOver
                          ? 'border-[#5D3FD3] bg-[#5D3FD3]/5'
                          : 'border-[#5D3FD3]/30 hover:border-[#5D3FD3]/60 bg-gray-50'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="text-4xl mb-2">&#128228;</div>
                      <p className="text-sm font-medium text-gray-700">
                        {uploading ? 'Uploading...' : 'Drag & drop files here'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Supported: PDF, PPTX, DOCX, TXT (max 50MB)
                      </p>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.pptx,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f);
                        e.target.value = '';
                      }}
                    />

                    {/* Material List */}
                    {materials.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {materials.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-100"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedMaterials.has(m.id)}
                                onChange={() => {
                                  setSelectedMaterials((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[#5D3FD3] focus:ring-[#5D3FD3]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{m.filename}</p>
                                <p className="text-xs text-gray-400">
                                  {new Date(m.uploaded_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {statusBadge(m.status)}
                              <button
                                onClick={() => deleteMaterial(m.id)}
                                className="text-red-400 hover:text-red-600 transition-colors p-1"
                                title="Delete material"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-[#5D3FD3]/30 text-[#5D3FD3] text-sm font-medium hover:bg-[#5D3FD3]/5 transition-colors disabled:opacity-50"
                    >
                      {uploading ? 'Uploading...' : '+ Upload New Material'}
                    </button>
                  </section>

                  {/* --- Blocked Topics --- */}
                  <section className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Blocked Topics</h2>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {blockedTopics.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No blocked topics yet</p>
                      )}
                      {blockedTopics.map((topic) => (
                        <span
                          key={topic}
                          className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-sm"
                        >
                          {topic}
                          <button
                            onClick={() => removeTopic(topic)}
                            className="text-red-400 hover:text-red-600 font-bold"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>

                    {showTopicInput ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTopic}
                          onChange={(e) => setNewTopic(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                          placeholder="Enter topic name..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20 focus:border-[#5D3FD3]"
                          autoFocus
                        />
                        <button
                          onClick={addTopic}
                          className="px-4 py-2 bg-[#5D3FD3] text-white rounded-lg text-sm font-medium hover:bg-[#4C33B0] transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setShowTopicInput(false); setNewTopic(''); }}
                          className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowTopicInput(true)}
                        className="inline-flex items-center gap-1 px-4 py-2 border-2 border-dashed border-[#5D3FD3]/30 text-[#5D3FD3] rounded-lg text-sm font-medium hover:bg-[#5D3FD3]/5 transition-colors"
                      >
                        + Add topic
                      </button>
                    )}

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Custom redirect message
                      </label>
                      <input
                        type="text"
                        value={redirectMessage}
                        onChange={(e) => setRedirectMessage(e.target.value)}
                        onBlur={() => saveRules({ redirect_message: redirectMessage })}
                        placeholder="Message shown when a blocked topic is requested..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20 focus:border-[#5D3FD3]"
                      />
                    </div>
                  </section>

                  {/* --- Study Mode --- */}
                  <section className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Study Mode</h2>
                    <div className="space-y-3">
                      {([
                        {
                          value: 'socratic' as const,
                          icon: '\uD83E\uDDE0',
                          label: 'Socratic Questioning',
                          desc: 'AI asks guiding questions to help students arrive at answers themselves',
                        },
                        {
                          value: 'direct' as const,
                          icon: '\uD83D\uDCD6',
                          label: 'Direct Summary',
                          desc: 'AI provides concise summaries and direct explanations',
                        },
                        {
                          value: 'practice' as const,
                          icon: '\u270F\uFE0F',
                          label: 'Practice Problems',
                          desc: 'AI generates practice questions and exercises for active learning',
                        },
                      ]).map((mode) => (
                        <label
                          key={mode.value}
                          className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            studyMode === mode.value
                              ? 'border-[#5D3FD3] bg-[#5D3FD3]/5'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="studyMode"
                            value={mode.value}
                            checked={studyMode === mode.value}
                            onChange={() => {
                              setStudyMode(mode.value);
                              saveRules({ study_mode: mode.value });
                            }}
                            className="mt-1 w-4 h-4 text-[#5D3FD3] focus:ring-[#5D3FD3]"
                          />
                          <div>
                            <p className="font-medium text-gray-900">
                              <span className="mr-1">{mode.icon}</span> {mode.label}
                            </p>
                            <p className="text-sm text-gray-500 mt-0.5">{mode.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>

                {/* ======= RIGHT COLUMN ======= */}
                <div className="space-y-6">
                  {/* --- Assistance Limits --- */}
                  <section className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Assistance Limits</h2>

                    {/* 3-position slider */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">Minimal Help</span>
                        <span className="text-xs font-medium text-gray-500">Guided</span>
                        <span className="text-xs font-medium text-gray-500">Full Answers</span>
                      </div>
                      <div className="relative h-2 bg-gray-200 rounded-full">
                        <div
                          className="absolute top-0 left-0 h-full bg-[#5D3FD3] rounded-full transition-all"
                          style={{
                            width:
                              helpLevel === 'minimal'
                                ? '16.67%'
                                : helpLevel === 'guided'
                                ? '50%'
                                : '100%',
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2">
                        {(['minimal', 'guided', 'full'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => {
                              setHelpLevel(level);
                              saveRules({ help_level: level });
                            }}
                            className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                              helpLevel === level
                                ? 'border-[#5D3FD3] bg-[#5D3FD3] text-white scale-110'
                                : 'border-gray-300 bg-white text-gray-400 hover:border-[#5D3FD3]/50'
                            }`}
                          >
                            <div className="w-2 h-2 rounded-full bg-current" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-3">
                      {([
                        {
                          label: 'Require students to show work first',
                          checked: requireShowWork,
                          onChange: (v: boolean) => {
                            setRequireShowWork(v);
                            saveRules({ require_show_work: v });
                          },
                        },
                        {
                          label: 'Only reference uploaded materials',
                          checked: onlyCourseMaterials,
                          onChange: (v: boolean) => {
                            setOnlyCourseMaterials(v);
                            saveRules({ only_course_materials: v });
                          },
                        },
                        {
                          label: 'Block requests for assignment solutions',
                          checked: blockAssignmentSolutions,
                          onChange: (v: boolean) => {
                            setBlockAssignmentSolutions(v);
                            saveRules({ block_assignment_solutions: v });
                          },
                        },
                        {
                          label: 'Allow practice problem generation',
                          checked: allowPracticeProblems,
                          onChange: (v: boolean) => {
                            setAllowPracticeProblems(v);
                          },
                        },
                      ]).map((item) => (
                        <label key={item.label} className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => item.onChange(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[#5D3FD3] focus:ring-[#5D3FD3]"
                          />
                          <span className="text-sm text-gray-700 group-hover:text-gray-900">
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* --- Exam Mode --- */}
                  <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
                          <span>&#9888;&#65039;</span> Exam Mode
                        </h2>
                        <p className="text-sm text-amber-700 mt-1">
                          Disables all AI assistance during active exams. Students will see a notice that
                          the assistant is temporarily unavailable.
                        </p>
                      </div>
                      {/* Toggle switch */}
                      <button
                        onClick={() => {
                          const next = !examMode;
                          setExamMode(next);
                          saveRules({ exam_mode: next });
                        }}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                          examMode ? 'bg-[#5D3FD3]' : 'bg-gray-300'
                        }`}
                        role="switch"
                        aria-checked={examMode}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform ${
                            examMode ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </section>

                  {/* --- This Week's Activity --- */}
                  <section className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">This Week&apos;s Activity</h2>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gradient-to-br from-[#5D3FD3]/10 to-[#5D3FD3]/5 rounded-xl p-4 text-center border border-[#5D3FD3]/10">
                        <p className="text-2xl font-bold text-[#5D3FD3]">
                          {analytics?.totalMessages ?? 0}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Student Questions</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-50/50 rounded-xl p-4 text-center border border-green-100">
                        <p className="text-2xl font-bold text-green-600">
                          {analytics && analytics.totalMessages > 0
                            ? Math.round(
                                ((analytics.totalMessages - analytics.blockedAttempts) /
                                  analytics.totalMessages) *
                                  100
                              )
                            : 0}
                          %
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Resolved by AI</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-50/50 rounded-xl p-4 text-center border border-blue-100">
                        <p className="text-2xl font-bold text-blue-600">
                          {analytics?.totalSessions
                            ? `${Math.max(1, Math.round(analytics.totalMessages / analytics.totalSessions * 2))}s`
                            : '0s'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Avg Response Time</p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* ===== Action Buttons ===== */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/student')}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Preview Student View
                  </button>
                  <button
                    onClick={resetDefaults}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Reset to Default
                  </button>
                </div>
                <button
                  onClick={() => saveRules()}
                  disabled={saving}
                  className="px-8 py-2.5 rounded-lg bg-[#5D3FD3] text-white text-sm font-semibold hover:bg-[#4C33B0] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>

              {/* Auto-save indicator */}
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-400">
                  {lastSaved
                    ? `Last saved: Today at ${formatTime(lastSaved)} \u2022 Auto-save enabled`
                    : 'Auto-save enabled'}
                </p>
              </div>
            </div>
          )}

          {/* ---------- ANALYTICS TAB ---------- */}
          {activeTab === 'analytics' && (
            <div className="max-w-5xl mx-auto px-8 py-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 font-medium">Total Messages</p>
                  <p className="text-3xl font-bold text-[#5D3FD3] mt-1">
                    {analytics?.totalMessages ?? 0}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 font-medium">Unique Students</p>
                  <p className="text-3xl font-bold text-[#5D3FD3] mt-1">
                    {analytics?.uniqueStudents ?? 0}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 font-medium">Blocked Attempts</p>
                  <p className="text-3xl font-bold text-red-500 mt-1">
                    {analytics?.blockedAttempts ?? 0}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 font-medium">Total Sessions</p>
                  <p className="text-3xl font-bold text-[#5D3FD3] mt-1">
                    {analytics?.totalSessions ?? 0}
                  </p>
                </div>
              </div>

              {/* Recent Messages */}
              <section className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Student Messages</h2>
                {analytics?.recentMessages && analytics.recentMessages.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.recentMessages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="w-8 h-8 rounded-full bg-[#5D3FD3]/10 flex items-center justify-center text-[#5D3FD3] text-sm font-semibold flex-shrink-0">
                          {msg.user_name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-gray-900">{msg.user_name}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(msg.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 break-words">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No messages yet. Student activity will appear here.
                  </p>
                )}
              </section>

              {/* Top Topics */}
              {analytics?.topTopics && analytics.topTopics.length > 0 && (
                <section className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Queried Topics</h2>
                  <div className="space-y-2">
                    {analytics.topTopics.map((topic, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                          <div
                            className="h-full bg-[#5D3FD3]/20 rounded-full flex items-center px-3"
                            style={{
                              width: `${Math.max(
                                20,
                                (topic.count / (analytics.topTopics[0]?.count || 1)) * 100
                              )}%`,
                            }}
                          >
                            <span className="text-xs text-gray-700 truncate">{topic.content}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 font-medium w-8 text-right">
                          {topic.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ---------- PRIVACY & SAFETY TAB ---------- */}
          {activeTab === 'privacy' && (
            <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">
              <section className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>&#128737;&#65039;</span> FERPA Compliance
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-green-600 text-lg mt-0.5">&#10003;</span>
                    <div>
                      <p className="font-medium text-green-800">Data Privacy</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        All student interactions are encrypted and stored securely. No personally
                        identifiable information is shared with third-party AI providers.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-green-600 text-lg mt-0.5">&#10003;</span>
                    <div>
                      <p className="font-medium text-green-800">Access Control</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        Only enrolled students can access the course AI assistant. Teachers and admins
                        can view aggregate analytics but not individual chat contents unless flagged.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-green-600 text-lg mt-0.5">&#10003;</span>
                    <div>
                      <p className="font-medium text-green-800">Data Retention</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        Chat logs are retained for the duration of the academic term and automatically
                        purged 30 days after course completion, in compliance with institutional policies.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-green-600 text-lg mt-0.5">&#10003;</span>
                    <div>
                      <p className="font-medium text-green-800">Audit Trail</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        All configuration changes, material uploads, and access events are logged with
                        timestamps for compliance auditing.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>&#128170;</span> Safety Features
                </h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-blue-600 text-lg mt-0.5">&#128737;&#65039;</span>
                    <div>
                      <p className="font-medium text-blue-800">Content Filtering</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        AI responses are filtered for inappropriate content and academic integrity
                        violations before being delivered to students.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-blue-600 text-lg mt-0.5">&#128275;</span>
                    <div>
                      <p className="font-medium text-blue-800">Topic Blocking</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        Configure specific topics that the AI should not discuss, with custom redirect
                        messages to guide students to appropriate resources.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-blue-600 text-lg mt-0.5">&#9888;&#65039;</span>
                    <div>
                      <p className="font-medium text-blue-800">Exam Mode</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        Instantly disable AI assistance during exams with a single toggle. Students
                        are notified that the assistant is temporarily unavailable.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
