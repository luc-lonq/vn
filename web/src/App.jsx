import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import Login from './pages/Login.jsx';
import Notes from './pages/Notes.jsx';
import Vocab from './pages/Vocab.jsx';
import History from './pages/History.jsx';

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

const linkCls = ({ isActive }) =>
  `px-1 py-1 border-b ${isActive ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'}`;

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [dark, toggleTheme] = useTheme();

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    api('/auth/me').then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setAuthed(false); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6 text-sm">
          <span className="font-semibold tracking-tight">tiếng việt</span>
          <nav className="flex gap-5">
            <NavLink to="/vocab" className={linkCls}>vocabulaire</NavLink>
            <NavLink to="/notes" className={linkCls}>notes</NavLink>
            <NavLink to="/historique" className={linkCls}>historique</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost" onClick={toggleTheme} title="Changer de thème">
              {dark ? '◐ clair' : '◑ sombre'}
            </button>
            <button className="btn-ghost" onClick={logout}>quitter</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/vocab" replace />} />
          <Route path="/vocab/*" element={<Vocab />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:id" element={<Notes />} />
          <Route path="/historique" element={<History />} />
          <Route path="*" element={<Navigate to="/vocab" replace />} />
        </Routes>
      </main>
    </div>
  );
}
