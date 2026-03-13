'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      const role = data.user.role;
      if (role === 'student') router.push('/student');
      else if (role === 'teacher') router.push('/teacher');
      else if (role === 'admin') router.push('/admin');
      else router.push('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: 'password123' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      const role = data.user.role;
      if (role === 'student') router.push('/student');
      else if (role === 'teacher') router.push('/teacher');
      else if (role === 'admin') router.push('/admin');
      else router.push('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#5D3FD3] via-[#7B5FE0] to-[#9B7FED] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-5xl">🤖</div>
          <h1 className="mt-3 text-3xl font-bold text-[#5D3FD3]">ClassIQ</h1>
          <p className="mt-1 text-sm text-gray-500">AI-Powered Course Assistant</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
              placeholder="you@university.edu"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#5D3FD3] px-4 py-2.5 text-white font-semibold transition-colors hover:bg-[#4C33B0] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Login */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
            Quick Demo Login
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => quickLogin('habiba@bellevuecollege.edu')}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#5D3FD3] hover:text-[#5D3FD3]"
            >
              👩‍🎓 Student
            </button>
            <button
              type="button"
              onClick={() => quickLogin('morteza.chini@canvas.auto')}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#5D3FD3] hover:text-[#5D3FD3]"
            >
              👨‍🏫 Teacher
            </button>
            <button
              type="button"
              onClick={() => quickLogin('admin@bellevuecollege.edu')}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#5D3FD3] hover:text-[#5D3FD3]"
            >
              🔧 Admin
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-400">
          FERPA Compliant &bull; End-to-End Encrypted &bull; Canvas LMS Integration
        </p>
      </div>
    </div>
  );
}
