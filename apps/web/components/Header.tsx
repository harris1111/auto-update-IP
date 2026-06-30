'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme, THEME_LABELS } from '@/components/ThemeProvider';

export default function Header() {
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <header>
      <div className="header-inner">
        <Link href="/dashboard" className="logo">
          0ERR <span className="logo-accent">Firewall</span>
        </Link>
        <nav className="nav-links">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/port-groups">Port Groups</Link>
          <Link href="/audit">Audit Logs</Link>
          <Link href="/settings">Settings</Link>
          <button className="theme-toggle" onClick={toggle} title={`Theme: ${THEME_LABELS[theme]}`}>
            {theme.includes('dark') ? '\u2600' : '\u263D'}
          </button>
          <button 
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 'inherit',
              fontFamily: 'inherit',
              transition: 'color 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
