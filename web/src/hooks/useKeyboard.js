import { useEffect, useRef } from 'react';

/**
 * Global keydown listener. Keys typed in inputs are ignored unless
 * `includeInputs` is set (needed for shortcuts like Ctrl+S in the editor).
 */
export function useKeyboard(handler, { enabled = true, includeInputs = false } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      if (!includeInputs && e.target.closest?.('input, textarea')) return;
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, includeInputs]);
}
