import { useCallback, useEffect, useState } from 'react';
import { useKeyboard } from '../../hooks/useKeyboard.js';
import { api } from '../../lib/api.js';
import { MINUTE } from '../../lib/format.js';
import { storage } from '../../lib/storage.js';
import { speak } from '../../lib/speech.js';

// Must match the server's Rating values (1–4).
const RATINGS = [
  { value: 1, label: 'à revoir' },
  { value: 2, label: 'difficile' },
  { value: 3, label: 'bien' },
  { value: 4, label: 'facile' },
];
const GOOD = 3;

export default function ReviewTab({ onStats }) {
  const [session, setSession] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [reverse, setReverse] = useState(() => storage.get('reverse') === '1');

  const loadNext = useCallback(async () => {
    const next = await api('/review/next');
    setSession(next);
    setRevealed(false);
    onStats(next.stats);
  }, [onStats]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  useEffect(() => storage.set('reverse', reverse ? '1' : '0'), [reverse]);

  const card = session?.card;

  const reveal = () => {
    setRevealed(true);
    if (reverse) speak(card.front);
  };

  const rate = async (rating) => {
    await api(`/review/${card.id}`, { method: 'POST', body: { rating } });
    loadNext();
  };

  useKeyboard(
    (e) => {
      if (e.key === 'v') return speak(card.front);
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        return reveal();
      }
      if (revealed && e.key === ' ') {
        e.preventDefault();
        return rate(GOOD);
      }
      if (revealed && RATINGS.some((r) => String(r.value) === e.key)) rate(Number(e.key));
    },
    { enabled: Boolean(card) }
  );

  if (!session) return null;
  if (!card) return <EmptyState session={session} onRefresh={loadNext} />;

  const question = reverse ? card.back : card.front;
  const answer = reverse ? card.front : card.back;
  const isNew = card.reps === 0 && card.lapses === 0 && card.interval === 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center text-xs text-muted mb-3">
        <span>
          {isNew
            ? 'nouvelle'
            : card.lapses
              ? `oubliée ${card.lapses}×`
              : `intervalle ${card.interval} j`}
        </span>
        <button className="hover:text-fg" onClick={() => setReverse((r) => !r)}>
          sens : {reverse ? 'fr → vi' : 'vi → fr'}
        </button>
      </div>

      <div className="border border-fg min-h-80 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
          <div className="text-3xl md:text-4xl">{question}</div>
          {!reverse && <ListenButton text={card.front} />}
        </div>
        {revealed && (
          <div className="border-t border-line px-6 py-10 text-center space-y-3">
            <div className="text-2xl">{answer}</div>
            {reverse && <ListenButton text={card.front} />}
            {card.example && <p className="text-sm text-muted italic">{card.example}</p>}
            {card.tags && <Tags tags={card.tags} />}
          </div>
        )}
      </div>

      <div className="mt-4">
        {revealed ? (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map(({ value, label }, i) => (
              <button
                key={value}
                className={`${value === GOOD ? 'btn-primary' : 'btn-secondary'} flex-col py-3 gap-0.5`}
                onClick={() => rate(value)}
              >
                <span>{label}</span>
                <span className="text-[11px] opacity-60">
                  {session.previews[i]} · {value}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn-primary w-full py-3" onClick={reveal}>
            afficher la réponse <span className="text-[10px] opacity-60">espace</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ListenButton({ text }) {
  return (
    <button className="text-xs text-muted hover:text-fg" onClick={() => speak(text)}>
      ▶ écouter <span className="kbd">v</span>
    </button>
  );
}

function Tags({ tags }) {
  const list = tags.split(/[\s,]+/).filter(Boolean);
  return <p className="text-xs text-muted">{list.map((t) => `#${t}`).join(' ')}</p>;
}

function EmptyState({ session, onRefresh }) {
  const { stats, nextDue } = session;

  if (stats.total === 0) {
    return (
      <div className="border border-line py-20 text-center space-y-3">
        <p className="text-lg">Aucune carte pour l'instant.</p>
        <p className="text-sm text-muted">Ajoute des mots dans « cartes » ou « importer ».</p>
      </div>
    );
  }

  const nextLabel =
    nextDue &&
    new Date(nextDue).toLocaleString('fr-FR', {
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="border border-line py-20 text-center space-y-3">
      <p className="text-lg">Terminé pour le moment. Giỏi lắm !</p>
      {nextLabel && <p className="text-sm text-muted">Prochaine révision {nextLabel}.</p>}
      {nextDue && nextDue - Date.now() < 15 * MINUTE && (
        <button className="btn-secondary mt-4" onClick={onRefresh}>
          actualiser
        </button>
      )}
    </div>
  );
}
