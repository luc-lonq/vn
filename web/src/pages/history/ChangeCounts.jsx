const BLOCKS = 5;

/** "+12 −3 ■■■■□", like GitHub's diffstat. */
export default function ChangeCounts({ added, removed, className = '' }) {
  const total = added + removed;
  const filled = total ? Math.round((added / total) * BLOCKS) : 0;

  return (
    <span className={`text-xs flex items-center gap-2 ${className}`}>
      <span>+{added}</span>
      <span className="text-muted">−{removed}</span>
      <span className="flex gap-px" aria-hidden="true">
        {Array.from({ length: BLOCKS }, (_, i) => (
          <span key={i} className={`w-2 h-2 ${i < filled ? 'bg-fg' : 'border border-muted'}`} />
        ))}
      </span>
    </span>
  );
}
