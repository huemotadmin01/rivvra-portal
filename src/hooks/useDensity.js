import { useCallback, useEffect, useState } from 'react';

/**
 * useDensity — per-page, per-user density preference.
 *
 * 2026-05-13 ATS list-view audit Q5 = B: two-way toggle (comfortable /
 * compact). Stored in localStorage scoped by a caller-supplied key so
 * each list page persists its own preference (someone who likes a
 * compact Applications list might want comfortable on the smaller
 * Job Positions list).
 *
 * Usage:
 *   const { density, setDensity, rowPadding } = useDensity('ats:applications');
 *   <tr className={`${rowPadding} ...`}>...</tr>
 *
 * Density values:
 *   - 'comfortable' — current default; ~14px vertical row padding
 *   - 'compact'     — ~6px vertical row padding (about ~30% more rows visible)
 */
const DENSITY_VALUES = new Set(['comfortable', 'compact']);

export function useDensity(scope = 'default', initial = 'comfortable') {
  const storageKey = `rivvra:density:${scope}`;
  const [density, setDensityState] = useState(initial);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && DENSITY_VALUES.has(stored)) setDensityState(stored);
    } catch (_) { /* localStorage blocked → keep default */ }
  }, [storageKey]);

  const setDensity = useCallback((next) => {
    if (!DENSITY_VALUES.has(next)) return;
    setDensityState(next);
    try { localStorage.setItem(storageKey, next); } catch (_) {}
  }, [storageKey]);

  // Tailwind helpers — apply on table cells / list items. Use the
  // `rowPadding` slot for the most common case and the rest if a page
  // needs finer-grained density (e.g. card layouts).
  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-3';
  const cellPadding = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';

  return { density, setDensity, rowPadding, cellPadding };
}
