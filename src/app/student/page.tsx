'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
  blocked?: boolean;
}

interface Course {
  id: number;
  name: string;
  code: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  token: string;
}

const quickActions = [
  { label: 'Explain concept', prompt: 'Can you explain a key concept from this course?' },
  { label: 'Review for quiz', prompt: 'Help me review for an upcoming quiz.' },
  { label: 'Summarize lecture', prompt: 'Can you summarize the latest lecture material?' },
  { label: 'Clarify syllabus', prompt: 'Can you clarify something from the syllabus?' },
];

export default function StudentChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!stored || !token) {
      router.push('/');
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      setUser({ ...parsed, token });
    } catch {
      router.push('/');
    }
  }, [router]);

  // Fetch courses
  useEffect(() => {
    if (!user?.token) return;

    fetch('/api/courses', {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch courses');
        return res.json();
      })
      .then((data: Course[]) => {
        setCourses(data);
        if (data.length > 0 && !selectedCourse) {
          setSelectedCourse(data[0].id);
        }
      })
      .catch((err) => console.error('Error fetching courses:', err));
  }, [user?.token, selectedCourse]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Course switching resets messages and session
  const handleCourseChange = (courseId: number) => {
    setSelectedCourse(courseId);
    setMessages([]);
    setSessionId(null);
  };

  // Send message
  const sendMessage = async (content: string) => {
    if (!selectedCourse || !user?.token) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          courseId: selectedCourse,
          message: content,
          sessionId: sessionId || undefined,
        }),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const data = await res.json();

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        sources: data.sources,
        timestamp: new Date().toISOString(),
        blocked: data.blocked,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Error sending message:', err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = (question: string) => {
    sendMessage(question);
  };

  const selectedCourseName =
    courses.find((c) => c.id === selectedCourse)?.code || 'Select Course';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar role="student" activePage="chat" />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Canvas Top Nav */}
        <header className="flex items-center justify-between h-12 px-4 bg-[#2D3B45] text-white text-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold tracking-wide">CANVAS</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="hover:text-gray-300 transition-colors" aria-label="Notifications">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <span className="text-sm">{user?.name || 'Student'}</span>
          </div>
        </header>

        {/* Chat Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-[#5D3FD3] to-[#7C5FE8] text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl" role="img" aria-label="robot">
              &#129302;
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">ClassIQ</h1>
              <p className="text-xs text-white/70">Your AI Course Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Course dropdown */}
            <select
              value={selectedCourse ?? ''}
              onChange={(e) => handleCourseChange(Number(e.target.value))}
              className="rounded-md bg-white/20 text-white text-sm px-3 py-1.5 outline-none border border-white/30 hover:bg-white/30 transition-colors cursor-pointer"
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id} className="text-gray-800">
                  {course.code}
                </option>
              ))}
            </select>

            {/* History button */}
            <button className="text-xs px-3 py-1.5 rounded-md bg-white/20 border border-white/30 hover:bg-white/30 transition-colors">
              History
            </button>

            {/* Settings button */}
            <button className="text-xs px-3 py-1.5 rounded-md bg-white/20 border border-white/30 hover:bg-white/30 transition-colors">
              Settings
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Welcome banner when no messages */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="text-center max-w-md">
                <div className="text-5xl mb-4" role="img" aria-label="robot">
                  &#129302;
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Welcome to ClassIQ!
                </h2>
                <p className="text-gray-500 mb-6">
                  I can help you understand course materials, review for exams, and answer
                  questions about <span className="font-medium text-[#5D3FD3]">{selectedCourseName}</span>.
                </p>

                {/* Quick action buttons */}
                <div className="grid grid-cols-2 gap-3">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.prompt)}
                      className="px-4 py-3 rounded-xl border border-[#5D3FD3]/20 bg-white text-sm text-[#5D3FD3] hover:bg-[#5D3FD3]/5 hover:border-[#5D3FD3]/40 transition-colors text-left"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, index) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              timestamp={msg.timestamp}
              userName={msg.role === 'user' ? user?.name : undefined}
              blocked={msg.blocked}
              onFeedback={msg.role === 'assistant' ? () => {} : undefined}
              onFollowUp={
                msg.role === 'assistant' && index === messages.length - 1 && !loading
                  ? handleFollowUp
                  : undefined
              }
            />
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-3 px-4 mb-4">
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#5D3FD3] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[#5D3FD3] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#5D3FD3] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400 ml-2">ClassIQ is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <ChatInput onSend={sendMessage} disabled={loading || !selectedCourse} />
      </div>
    </div>
  );
}
