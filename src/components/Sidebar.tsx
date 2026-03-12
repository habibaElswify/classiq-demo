'use client';

import { useRouter } from 'next/navigation';

interface SidebarProps {
  role: 'student' | 'teacher' | 'admin';
  activePage: string;
}

const navItems = [
  { label: 'Dashboard', key: 'dashboard', href: '#' },
  {
    label: 'Courses',
    key: 'courses',
    href: '#',
    children: [
      { label: 'CSS 370', key: 'css370', href: '#' },
      { label: 'CSS 343', key: 'css343', href: '#' },
    ],
  },
  { label: 'Calendar', key: 'calendar', href: '#' },
  { label: 'Inbox', key: 'inbox', href: '#' },
];

const toolItems = [
  { label: 'Modules', key: 'modules', href: '#' },
  { label: 'Assignments', key: 'assignments', href: '#' },
  { label: 'Discussions', key: 'discussions', href: '#' },
  { label: 'Grades', key: 'grades', href: '#' },
];

export default function Sidebar({ role, activePage }: SidebarProps) {
  const router = useRouter();

  const handleSignOut = () => {
    localStorage.clear();
    router.push('/');
  };

  return (
    <aside className="flex flex-col h-full w-44 bg-[#2D3B45] text-white text-sm flex-shrink-0">
      {/* CANVAS Header */}
      <div className="px-4 py-4 border-b border-white/10">
        <span className="font-bold text-base tracking-wide">CANVAS</span>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => (
          <div key={item.key}>
            <a
              href={item.href}
              className={`block px-4 py-2 hover:bg-white/10 transition-colors ${
                activePage === item.key ? 'bg-white/15 font-semibold' : ''
              }`}
            >
              {item.label}
            </a>
            {item.children && (
              <div className="pl-6">
                {item.children.map((child) => (
                  <a
                    key={child.key}
                    href={child.href}
                    className={`block px-4 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                      activePage === child.key ? 'bg-white/15 font-semibold' : ''
                    }`}
                  >
                    {child.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* CSS 370 Tools */}
        <div className="mt-4 pt-3 border-t border-white/10">
          <div className="px-4 py-1 text-xs text-gray-400 uppercase tracking-wider">
            CSS 370 Tools
          </div>
          {toolItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`block px-4 py-2 hover:bg-white/10 transition-colors ${
                activePage === item.key ? 'bg-white/15 font-semibold' : ''
              }`}
            >
              {item.label}
            </a>
          ))}

          {/* Role-specific items */}
          {role === 'student' && (
            <a
              href="/student"
              className={`block px-4 py-2 transition-colors ${
                activePage === 'chat'
                  ? 'bg-[#5D3FD3] font-semibold border-l-4 border-yellow-400'
                  : 'hover:bg-white/10'
              }`}
            >
              <span role="img" aria-label="robot">🤖</span> Course Assistant
            </a>
          )}

          {role === 'teacher' && (
            <a
              href="/teacher/config"
              className={`block px-4 py-2 transition-colors ${
                activePage === 'config'
                  ? 'bg-white/15 font-semibold'
                  : 'hover:bg-white/10'
              }`}
            >
              <span role="img" aria-label="gear">&#9881;&#65039;</span> AI Config
            </a>
          )}
        </div>
      </nav>

      {/* Sign Out */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-2 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
