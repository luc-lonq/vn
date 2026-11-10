export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth')) onUnauthorized();
    throw new ApiError(res.status, data.error || `Erreur ${res.status}`);
  }
  return data;
}

// Synthèse vocale vietnamienne du navigateur (si une voix vi-VN est installée)
export function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function relTime(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
