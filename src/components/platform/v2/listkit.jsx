import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SelectChip, BooleanChip, GroupByChip, ArchivedToggle, RangeFilter, MoreFilters,
  PageHeader,
} from '../../ds';

/* v2 list-page kit — URL BINDING ONLY.
 *
 * Phase 1 moved the presentational primitives into `components/ds/` as
 * controlled components (value + onChange). What stays here is the app-layer
 * concern the design system must not own: reading and writing the query
 * string. Every control below is a thin adapter — URL in, ds component out.
 *
 * Param semantics match the legacy shared/FilterBar exactly (filters live in
 * the URL; any filter change resets `page`), so a URL bookmarked under one
 * shell keeps meaning the same thing under the other.
 *
 * The `*V2` names are kept as the public surface so the ~20 existing call
 * sites did not have to change in this phase; they are the URL-bound
 * variants, not duplicates of the ds components.
 */

export function useListParams(keys = []) {
  const [searchParams] = useSearchParams();
  const out = {};
  for (const k of keys) {
    const v = searchParams.get(k);
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

export function useUpdateParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === '' || value === false) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };
}

export function usePageParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(raw) && raw >= 1 ? raw : 1;
  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };
  return [page, setPage];
}

/** Debounced URL-synced search value for SearchInput (300ms, like legacy). */
export function useSearchParamValue(key = 'search') {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  const urlValue = searchParams.get(key) || '';
  const [value, setValue] = useState(urlValue);
  const debounceRef = useRef(null);
  const skipRef = useRef(true);

  // External URL change (back button, clear-all) → adopt it.
  useEffect(() => { setValue(urlValue); }, [urlValue]);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    if (value === urlValue) return;
    debounceRef.current = setTimeout(() => updateParam(key, value), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue];
}

/* ── URL-bound filter controls ─────────────────────────────────────── */

export function SelectChipV2({ paramKey, label, options = [], placeholder = 'No options' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  return (
    <SelectChip
      label={label}
      value={searchParams.get(paramKey) || ''}
      onChange={(next) => updateParam(paramKey, next)}
      options={options}
      placeholder={placeholder}
    />
  );
}

export function BooleanChipV2({ paramKey, label }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  return (
    <BooleanChip
      label={label}
      checked={searchParams.get(paramKey) === '1'}
      onChange={(next) => updateParam(paramKey, next ? '1' : '')}
    />
  );
}

export function GroupByChipV2({ options = [], paramKey = 'groupBy', label = 'Group by' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  return (
    <GroupByChip
      options={options}
      value={searchParams.get(paramKey) || ''}
      onChange={(next) => updateParam(paramKey, next)}
      label={label}
    />
  );
}

export function ArchivedToggleV2({ activeCount, archivedCount }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  return (
    <ArchivedToggle
      archived={searchParams.get('archived') === '1'}
      onChange={(next) => updateParam('archived', next ? '1' : '')}
      activeCount={activeCount}
      archivedCount={archivedCount}
    />
  );
}

export function RangeFilterV2({ fromKey, toKey, label, type = 'date' }) {
  const [searchParams] = useSearchParams();
  const updateParam = useUpdateParam();
  return (
    <RangeFilter
      label={label}
      type={type}
      from={searchParams.get(fromKey) || ''}
      to={searchParams.get(toKey) || ''}
      onFromChange={(v) => updateParam(fromKey, v)}
      onToChange={(v) => updateParam(toKey, v)}
    />
  );
}

export function MoreFiltersV2({ paramKeys = [], label = 'More filters', children }) {
  const [searchParams] = useSearchParams();
  const activeCount = paramKeys.filter((k) => {
    const v = searchParams.get(k);
    return v != null && v !== '';
  }).length;
  return <MoreFilters activeCount={activeCount} label={label}>{children}</MoreFilters>;
}

/* ── Deprecated re-export (phase 1) ────────────────────────────────
   PageHeaderV2 has no URL binding — it is purely presentational and now
   lives in ds/Surface/PageHeader. Kept here for one phase so existing call
   sites keep working; new pages must import PageHeader from ds. */
export const PageHeaderV2 = PageHeader;
