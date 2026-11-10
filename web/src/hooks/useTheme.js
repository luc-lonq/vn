import { useEffect, useState } from 'react';
import { storage } from '../lib/storage.js';

/**
 * Dark by default. The initial class is set by an inline script in index.html
 * to avoid a flash of the wrong theme.
 */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    storage.set('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
