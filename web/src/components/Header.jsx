import { NavLink } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';

const NAV = [
  { to: '/vocab', label: 'vocabulaire' },
  { to: '/notes', label: 'notes' },
  { to: '/historique', label: 'historique' },
];

const linkClass = ({ isActive }) =>
  `px-1 py-1 border-b ${isActive ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'}`;

export default function Header({ onLogout }) {
  const theme = useTheme();

  return (
    <header className="border-b border-line">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6 text-sm">
        <span className="font-semibold tracking-tight">tiếng việt</span>
        <nav className="flex gap-5">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} className={linkClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost" onClick={theme.toggle} title="Changer de thème">
            {theme.dark ? '◐ clair' : '◑ sombre'}
          </button>
          <button className="btn-ghost" onClick={onLogout}>
            quitter
          </button>
        </div>
      </div>
    </header>
  );
}
