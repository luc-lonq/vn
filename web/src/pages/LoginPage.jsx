import { useState } from 'react';
import { api } from '../lib/api.js';

export default function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { password } });
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">tiếng việt</h1>
          <p className="text-muted text-sm mt-1">accès privé</p>
        </div>
        <div>
          <label className="label" htmlFor="password">
            mot de passe
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm border border-fg px-3 py-2">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !password}>
          entrer
        </button>
      </form>
    </div>
  );
}
