// Dashboard → list deep-link helpers. See components/platform/v2/DashboardFilterNote.jsx.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function dashboardLink(path, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function useDashboardParams(keys) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sig = searchParams.toString();
  const values = useMemo(() => {
    const out = {};
    keys.forEach((k) => { const v = searchParams.get(k); if (v != null && v !== '') out[k] = v; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, keys.join(',')]);
  const report = searchParams.get('report') || '';
  const active = !!report || Object.keys(values).length > 0;
  const clear = () => {
    const np = new URLSearchParams(searchParams);
    [...keys, 'report'].forEach((k) => np.delete(k));
    np.delete('page');
    setSearchParams(np, { replace: true });
  };
  return { values, report, active, clear };
}

export const shortDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// For values that are UTC calendar days (employee dates are stored at UTC
// midnight; the employee dashboard cuts its period in UTC).
export const shortDateUTC = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
