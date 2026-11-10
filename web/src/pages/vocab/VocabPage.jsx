import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from '../../lib/api.js';
import CardsTab from './CardsTab.jsx';
import ImportTab from './ImportTab.jsx';
import ReviewTab from './ReviewTab.jsx';
import StatsBar from './StatsBar.jsx';

const TABS = [
  { to: '/vocab', label: 'réviser', end: true },
  { to: '/vocab/cartes', label: 'cartes' },
  { to: '/vocab/importer', label: 'importer' },
];

const tabClass = ({ isActive }) =>
  `px-3 py-1.5 text-sm border ${isActive ? 'border-fg' : 'border-transparent text-muted hover:text-fg'}`;

export default function VocabPage() {
  const [stats, setStats] = useState(null);
  const refreshStats = useCallback(() => api('/stats').then(setStats), []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={tabClass}>
            {label}
          </NavLink>
        ))}
        {stats && <StatsBar stats={stats} />}
      </div>

      <Routes>
        <Route index element={<ReviewTab onStats={setStats} />} />
        <Route path="cartes" element={<CardsTab onChange={refreshStats} />} />
        <Route path="importer" element={<ImportTab onChange={refreshStats} />} />
      </Routes>
    </div>
  );
}
