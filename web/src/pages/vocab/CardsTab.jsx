import { useState } from 'react';
import { useSearch } from '../../hooks/useSearch.js';
import { api } from '../../lib/api.js';
import { daysUntil, plural } from '../../lib/format.js';
import CardForm from './CardForm.jsx';

/** Status of one direction of a card. */
function directionStatus(progress) {
  if (!progress || progress.state === 'new') return 'nouvelle';
  if (progress.state !== 'review') return 'en cours';
  return progress.due <= Date.now() ? 'à revoir' : daysUntil(progress.due);
}

function CardProgress({ progress }) {
  return (
    <span className="text-xs text-muted whitespace-nowrap text-right leading-relaxed">
      <span className="block">vi→fr · {directionStatus(progress['vi-fr'])}</span>
      <span className="block">fr→vi · {directionStatus(progress['fr-vi'])}</span>
    </span>
  );
}

export default function CardsTab({ onChange }) {
  const { query, setQuery, results: cards, reload } = useSearch('/cards');
  const [editingId, setEditingId] = useState(null);

  const create = async (values) => {
    await api('/cards', { method: 'POST', body: values });
    reload();
    onChange();
  };

  const update = async (values) => {
    await api(`/cards/${editingId}`, { method: 'PUT', body: values });
    setEditingId(null);
    reload();
  };

  const remove = async (card) => {
    if (!confirm(`Supprimer « ${card.front} » ?`)) return;
    await api(`/cards/${card.id}`, { method: 'DELETE' });
    setEditingId(null);
    reload();
    onChange();
  };

  return (
    <div className="space-y-10">
      <section className="border border-line p-5">
        <h2 className="label mb-4">nouvelle carte</h2>
        <CardForm onSubmit={create} submitLabel="ajouter" />
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <input
            className="input max-w-xs"
            placeholder="rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="text-xs text-muted">
            {cards.length} {plural(cards.length, 'carte')}
          </span>
        </div>

        <div className="border-t border-line">
          {cards.map((card) =>
            editingId === card.id ? (
              <div key={card.id} className="border-b border-line py-4 px-2 bg-soft">
                <CardForm
                  initial={{
                    front: card.front,
                    back: card.back,
                    example: card.example,
                    tags: card.tags,
                  }}
                  onSubmit={update}
                  onCancel={() => setEditingId(null)}
                  submitLabel="enregistrer"
                />
                <button className="btn-ghost mt-2 -ml-2" onClick={() => remove(card)}>
                  supprimer cette carte
                </button>
              </div>
            ) : (
              <button
                key={card.id}
                onClick={() => setEditingId(card.id)}
                className="w-full text-left grid grid-cols-[1fr_1fr_9rem] gap-4 items-center py-2 px-2 border-b border-line hover:bg-soft"
              >
                <span className="truncate">{card.front}</span>
                <span className="truncate text-muted">{card.back}</span>
                <CardProgress progress={card.progress} />
              </button>
            )
          )}
          {cards.length === 0 && <p className="text-sm text-muted py-6 px-2">aucune carte</p>}
        </div>
      </section>
    </div>
  );
}
