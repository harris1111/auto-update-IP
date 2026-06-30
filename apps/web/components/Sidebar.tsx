'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

interface SyncStatus {
  name: string;
  status: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);

  useEffect(() => {
    const fetchSync = async () => {
      try {
        const res = await fetch('/api/agent/sync-status');
        if (res.ok) setSyncStatuses(await res.json());
      } catch (e) {}
    };
    fetchSync();
    const interval = setInterval(fetchSync, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '\u25A6' },
    { href: '/port-groups', label: 'Port Groups', icon: '\u25B8' },
    { href: '/audit', label: 'Audit Logs', icon: '\u29D6' },
    { href: '/settings', label: 'Settings', icon: '\u2699' },
  ];

  const onlineCount = syncStatuses.filter(s => s.status === 'success').length;
  const totalCount = syncStatuses.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Link href="/dashboard" className="sidebar-logo">
          0ERR<span className="sidebar-logo-accent">FW</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? 'sidebar-link-active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Agent Status</div>
        {totalCount === 0 ? (
          <div className="sidebar-status-text">No agents connected</div>
        ) : (
          <div className="sidebar-agents">
            {syncStatuses.map(s => (
              <div key={s.name} className="sidebar-agent">
                <span className={`sidebar-agent-dot ${s.status === 'success' ? 'dot-online' : s.status === 'error' ? 'dot-error' : 'dot-offline'}`} />
                <span className="sidebar-agent-name">{s.name}</span>
              </div>
            ))}
          </div>
        )}
        {totalCount > 0 && (
          <div className="sidebar-status-summary">
            {onlineCount}/{totalCount} online
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-theme-btn" onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <span className="sidebar-link-icon">{theme === 'dark' ? '\u2600' : '\u263D'}</span>
          {theme === 'dark' ? 'Light' : 'Dark'} mode
        </button>
        <button className="sidebar-logout-btn" onClick={handleLogout}>
          <span className="sidebar-link-icon">{'\u2386'}</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
