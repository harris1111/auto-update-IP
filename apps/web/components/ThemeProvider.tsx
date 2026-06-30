'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'nord-dark' | 'nord-light' | 'dark' | 'light';

const THEME_ORDER: Theme[] = ['nord-dark', 'dark', 'nord-light', 'light'];
const THEME_LABELS: Record<Theme, string> = {
  'nord-dark': 'Nord Dark',
  'nord-light': 'Nord Light',
  'dark': 'Dark',
  'light': 'Light',
};

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function isTheme(t: string | null): t is Theme {
  return t === 'nord-dark' || t === 'nord-light' || t === 'dark' || t === 'light';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme');
  if (isTheme(stored)) return stored;
  if (stored === 'dark') return 'nord-dark';
  if (stored === 'light') return 'nord-light';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'nord-light' : 'nord-dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  const toggle = useCallback(() => {
    setTheme(t => {
      const idx = THEME_ORDER.indexOf(t);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export { THEME_LABELS };
