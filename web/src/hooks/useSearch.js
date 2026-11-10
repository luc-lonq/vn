import { useCallback, useEffect, useState } from 'react';
import { api, withQuery } from '../lib/api.js';

const DEBOUNCE_MS = 150;

/**
 * Debounced search against a list endpoint.
 * Returns the current query, its setter, the results and a `reload` function.
 */
export function useSearch(path) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const reload = useCallback(
    () => api(withQuery(path, query.trim())).then(setResults),
    [path, query]
  );

  useEffect(() => {
    const timer = setTimeout(reload, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [reload]);

  return { query, setQuery, results, reload };
}
