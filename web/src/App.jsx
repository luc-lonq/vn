import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import { api, setUnauthorizedHandler } from './lib/api.js';
import HistoryPage from './pages/history/HistoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotesPage from './pages/notes/NotesPage.jsx';
import VocabPage from './pages/vocab/VocabPage.jsx';

export default function App() {
  // null = still checking the session
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    api('/auth/me')
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setAuthed(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header onLogout={logout} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/vocab" replace />} />
          <Route path="/vocab/*" element={<VocabPage />} />
          <Route path="/notes/:id?" element={<NotesPage />} />
          <Route path="/historique" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/vocab" replace />} />
        </Routes>
      </main>
    </div>
  );
}
