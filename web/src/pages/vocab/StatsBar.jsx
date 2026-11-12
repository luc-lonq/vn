function Stat({ value, label }) {
  return (
    <span>
      <span className="text-fg text-sm tabular-nums">{value}</span> {label}
    </span>
  );
}

export default function StatsBar({ stats }) {
  return (
    <div className="ml-auto flex flex-wrap gap-5 text-xs text-muted">
      <Stat value={stats.newToday} label="nouvelles" />
      <Stat value={stats.learning} label="en cours" />
      <Stat value={stats.due} label="à revoir" />
      <Stat value={stats.reviewedToday} label="aujourd'hui" />
      <Stat value={stats.streak} label={stats.streak > 1 ? 'jours de suite' : 'jour de suite'} />
      <Stat value={stats.total} label="cartes" />
    </div>
  );
}
