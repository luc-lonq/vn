import { useCallback, useEffect, useState } from 'react';
import { useKeyboard } from '../../hooks/useKeyboard.js';
import { api } from '../../lib/api.js';
import { MINUTE, plural } from '../../lib/format.js';
import { speak } from '../../lib/speech.js';

// Values match the server's Rating (1 = again, 3 = good). Shortcuts: A / Z
// (AZERTY home row), 1 / 2, and space for "je sais".
const AGAIN = 1;
const GOOD = 3;
const ANSWERS = [
  { value: AGAIN, label: 'je sais pas', keys: ['a', '1'], hint: 'A' },
  { value: GOOD, label: 'je sais', keys: ['z', '2', ' '], hint: 'Z' },
];
const DIRECTION_LABELS = { 'vi-fr': 'vi → fr', 'fr-vi': 'fr → vi' };

export default function ReviewTab({ onStats }) {
  const [session, setSession] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const loadNext = useCallback(async () => {
    const next = await api('/review/next');
    setSession(next);
    setRevealed(false);
    onStats(next.stats);
  }, [onStats]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const card = session?.card;
  const reverse = card?.direction === 'fr-vi';

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
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'v') return speak(card.front);
      if (!revealed) {
        if (key === ' ' || key === 'enter') {
          e.preventDefault();
          reveal();
        }
        return;
      }
      const answer = ANSWERS.find((a) => a.keys.includes(key));
      if (answer) {
        e.preventDefault();
        rate(answer.value);
      }
    },
    { enabled: Boolean(card) }
  );

  if (!session) return null;
  if (!card) return <EmptyState session={session} onRefresh={loadNext} />;

  const question = reverse ? card.back : card.front;
  const answer = reverse ? card.front : card.back;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center text-xs text-muted mb-3">
        <span>{cardBadge(card)}</span>
        <span>{DIRECTION_LABELS[card.direction]}</span>
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
          <div className="grid grid-cols-2 gap-2">
            {ANSWERS.map(({ value, label, hint }, i) => (
              <button
                key={value}
                className={`${value === GOOD ? 'btn-primary' : 'btn-secondary'} flex-col py-3 gap-0.5`}
                onClick={() => rate(value)}
              >
                <span>{label}</span>
                <span className="text-[11px] opacity-60">
                  {session.previews[i]} · {hint}
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

/** Short description of where the card is in the learning process. */
function cardBadge(card) {
  const lapses = card.lapses ? ` · oubliée ${card.lapses}×` : '';
  switch (card.state) {
    case 'new':
      return 'nouvelle';
    case 'learning':
      return 'en apprentissage';
    case 'relearning':
      return `à réapprendre${lapses}`;
    default:
      return `révision · intervalle ${card.interval} j${lapses}`;
  }
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
      {stats.newLimitReached ? (
        <p className="text-sm text-muted">
          Limite de nouvelles cartes atteinte pour aujourd'hui ({stats.newTotal} en attente).
        </p>
      ) : (
        stats.newWaitingForSibling > 0 && (
          <p className="text-sm text-muted">
            {stats.newWaitingForSibling} {plural(stats.newWaitingForSibling, 'carte')} dans l'autre
            sens {stats.newWaitingForSibling > 1 ? 'arrivent' : 'arrive'} demain.
          </p>
        )
      )}
      {nextLabel && <p className="text-sm text-muted">Prochaine révision {nextLabel}.</p>}
      {nextDue && nextDue - Date.now() < 15 * MINUTE && (
        <button className="btn-secondary mt-4" onClick={onRefresh}>
          actualiser
        </button>
      )}
    </div>
  );
}
