'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface Course {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  teacher_name: string;
  created_at: string;
}

interface RoleCount {
  role: string;
  count: number;
}

interface ActivityEntry {
  id: number;
  course_id: number;
  user_id: number;
  action: string;
  metadata: string;
  created_at: string;
  user_name: string;
}

interface SystemStats {
  totalUsers: number;
  totalCourses: number;
  totalMessages: number;
  totalMaterials: number;
  usersByRole: RoleCount[];
  recentActivity: ActivityEntry[];
}

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('student');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const authHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch {
      setError('Failed to load system stats');
    }
  }, [authHeaders]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch {
      setError('Failed to load users');
    }
  }, [authHeaders]);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch('/api/courses', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch courses');
      const data = await res.json();
      setCourses(data);
    } catch {
      setError('Failed to load courses');
    }
  }, [authHeaders]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchUsers(), fetchCourses()]);
  }, [fetchStats, fetchUsers, fetchCourses]);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');
    if (!stored || !storedToken) {
      router.push('/');
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== 'admin') {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [token, refreshAll]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setFormError('All fields are required.');
      return;
    }
    if (formPassword.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create user');
        return;
      }
      // Reset form and refresh
      setFormName('');
      setFormEmail('');
      setFormPassword('');
      setFormRole('student');
      setShowAddForm(false);
      await refreshAll();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
        return;
      }
      await refreshAll();
    } catch {
      setError('Network error. Please try again.');
    }
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      student: 'bg-blue-100 text-blue-800',
      teacher: 'bg-orange-100 text-orange-800',
      admin: 'bg-green-100 text-green-800',
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
        {role}
      </span>
    );
  };

  const activityStyle = (action: string) => {
    const styles: Record<string, string> = {
      chat_message: 'bg-purple-100 text-purple-800',
      material_upload: 'bg-blue-100 text-blue-800',
      login: 'bg-green-100 text-green-800',
      course_create: 'bg-yellow-100 text-yellow-800',
    };
    return styles[action] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">&#128295;</div>
          <p className="text-gray-500">Loading Admin Console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="admin" activePage="admin" />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#5D3FD3] to-[#7B5FE0] px-8 py-6 text-white shadow-lg">
          <h1 className="text-2xl font-bold">&#128295; ClassIQ Admin Console</h1>
          <p className="mt-1 text-sm text-white/80">Manage users, courses, and system settings</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Error Banner */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-4">
                &times;
              </button>
            </div>
          )}

          {/* System Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: '\uD83D\uDC65' },
              { label: 'Total Courses', value: stats?.totalCourses ?? 0, icon: '\uD83D\uDCDA' },
              { label: 'Total Messages', value: stats?.totalMessages ?? 0, icon: '\uD83D\uDCAC' },
              { label: 'Total Materials', value: stats?.totalMaterials ?? 0, icon: '\uD83D\uDCC4' },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl shadow-md p-6 text-center hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-2">{card.icon}</div>
                <div className="text-3xl font-bold text-[#5D3FD3]">{card.value}</div>
                <div className="mt-1 text-sm text-gray-500">{card.label}</div>
              </div>
            ))}
          </div>

          {/* User Management Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">User Management</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-[#5D3FD3] text-white text-sm font-medium rounded-lg hover:bg-[#4C33B0] transition-colors"
              >
                {showAddForm ? 'Cancel' : '+ Add User'}
              </button>
            </div>

            {/* Add User Form */}
            {showAddForm && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New User</h3>
                {formError && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                )}
                <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
                      placeholder="user@university.edu"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
                      placeholder="Min 6 characters"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20"
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={formLoading}
                      className="px-6 py-2 bg-[#5D3FD3] text-white text-sm font-medium rounded-lg hover:bg-[#4C33B0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {formLoading ? 'Creating...' : 'Create User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setFormError('');
                      }}
                      className="px-6 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Name</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Email</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Role</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Created</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-gray-800">{user.name}</td>
                        <td className="px-6 py-3 text-gray-600">{user.email}</td>
                        <td className="px-6 py-3">{roleBadge(user.role)}</td>
                        <td className="px-6 py-3 text-gray-500">{formatDate(user.created_at)}</td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Course Overview Section */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Course Overview</h2>
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Code</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Name</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Teacher</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {courses.map((course) => (
                      <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 font-mono font-medium text-[#5D3FD3]">{course.code}</td>
                        <td className="px-6 py-3 text-gray-800">{course.name}</td>
                        <td className="px-6 py-3 text-gray-600">{course.teacher_name}</td>
                        <td className="px-6 py-3 text-gray-500">{formatDate(course.created_at)}</td>
                      </tr>
                    ))}
                    {courses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                          No courses found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Users by Role Section */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Users by Role</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(stats?.usersByRole ?? []).map((entry) => (
                <div key={entry.role} className="bg-white rounded-xl shadow-md p-5 flex items-center gap-4">
                  <div className="text-2xl">
                    {entry.role === 'student' ? '\uD83D\uDC69\u200D\uD83C\uDF93' : entry.role === 'teacher' ? '\uD83D\uDC68\u200D\uD83C\uDFEB' : '\uD83D\uDD27'}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-[#5D3FD3]">{entry.count}</div>
                    <div className="text-sm text-gray-500 capitalize">{entry.role}s</div>
                  </div>
                </div>
              ))}
              {(!stats?.usersByRole || stats.usersByRole.length === 0) && (
                <div className="col-span-3 bg-white rounded-xl shadow-md p-6 text-center text-gray-400">
                  No role data available.
                </div>
              )}
            </div>
          </section>

          {/* Recent Activity Section */}
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="divide-y divide-gray-100">
                {(stats?.recentActivity ?? []).slice(0, 20).map((entry) => (
                  <div key={entry.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${activityStyle(entry.action)}`}>
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{entry.user_name}</span>
                    <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{formatDate(entry.created_at)}</span>
                  </div>
                ))}
                {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                  <div className="px-6 py-8 text-center text-gray-400">
                    No recent activity.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
