'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme, THEME_LABELS } from '@/components/ThemeProvider';
import type { Theme } from '@/components/ThemeProvider';

const THEME_ORDER: Theme[] = ['nord-dark', 'dark', 'nord-light', 'light'];

interface SyncStatus {
  name: string;
  status: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeBtnRect, setThemeBtnRect] = useState<DOMRect | null>(null);

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

  useEffect(() => {
    if (!themeOpen) return;
    const close = () => setThemeOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [themeOpen]);

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
        <button className="sidebar-theme-btn"
          ref={el => { if (el && !themeBtnRect && themeOpen) setThemeBtnRect(el.getBoundingClientRect()); }}
          onClick={(ev) => {
            ev.stopPropagation();
            const rect = ev.currentTarget.getBoundingClientRect();
            setThemeBtnRect(rect);
            setThemeOpen(!themeOpen);
          }}
          title="Select theme">
          <span className="sidebar-link-icon">{theme.includes('dark') ? '\u2600' : '\u263D'}</span>
          {THEME_LABELS[theme]} ▾
        </button>
        <button className="sidebar-logout-btn" onClick={handleLogout}>
          <span className="sidebar-link-icon">{'\u2386'}</span>
          Logout
        </button>
      </div>

      {themeOpen && themeBtnRect && createPortal(
        <div style={{
          position: 'fixed',
          top: themeBtnRect.bottom + 4,
          left: themeBtnRect.left,
          zIndex: 1001,
          background: 'var(--modal-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.25rem 0',
          minWidth: '180px',
          boxShadow: 'var(--shadow-modal)',
        }} onClick={ev => ev.stopPropagation()}>
          {THEME_ORDER.map(t => (
            <button key={t}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.5rem 0.85rem', background: 'none', border: 'none',
                color: t === theme ? 'var(--primary)' : 'var(--text-main)',
                cursor: 'pointer', fontSize: '0.85rem',
                fontWeight: t === theme ? 700 : 400,
              }}
              onMouseOver={ev => ev.currentTarget.style.background = 'var(--btn-secondary-hover)'}
              onMouseOut={ev => ev.currentTarget.style.background = 'none'}
              onClick={() => { setTheme(t); setThemeOpen(false); }}>
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>,
        document.body
      )}
    </aside>
  );
}
