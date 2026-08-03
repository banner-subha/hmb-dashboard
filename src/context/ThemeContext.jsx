import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'hmb-dashboard-theme';
const DEFAULT_THEME = 'dark';
const VALID_THEMES = ['dark', 'light'];

// Read the saved preference once, synchronously, so the very first render
// matches the attribute the inline script in index.html already set.
function getInitialTheme() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr && VALID_THEMES.includes(attr)) return attr;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_THEMES.includes(saved)) return saved;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Keep the <html data-theme> attribute + localStorage in sync with state.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};