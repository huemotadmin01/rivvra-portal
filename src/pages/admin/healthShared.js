// Shared by the Platform Health page and the Overview strip (2026-11-20).
// Plain helpers only — kept out of the .jsx files for react-refresh.

export const STATUS = {
  ok:   { label: 'Working', tone: 'brand', color: 'var(--brand, #22c55e)', soft: 'var(--brand-soft, rgba(34,197,94,.14))', ring: 'var(--brand-line, rgba(34,197,94,.28))' },
  warn: { label: 'Look at this', tone: 'warn', color: 'var(--warn, #f59e0b)', soft: 'var(--warn-soft, rgba(245,158,11,.14))', ring: 'color-mix(in srgb, var(--warn, #f59e0b) 34%, transparent)' },
  bad:  { label: 'Not working', tone: 'danger', color: 'var(--danger, #ef4444)', soft: 'var(--danger-soft, rgba(239,68,68,.14))', ring: 'color-mix(in srgb, var(--danger, #ef4444) 34%, transparent)' },
  off:  { label: 'Not set up', tone: 'neutral', color: 'var(--fg-4, #6b7785)', soft: 'var(--surface-2)', ring: 'var(--line)' },
};

/** "5 min ago", "3 h ago", "2 days ago" — or "in 4 days" for the future. */
export function relTime(value) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return String(value);
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  const word = (n, unit) => `${n} ${unit}${unit === 'min' || unit === 'h' || n === 1 ? '' : 's'}`;
  let txt;
  if (abs < 60 * 1000) return diff >= 0 ? 'just now' : 'in a moment';
  if (abs < 3600 * 1000) txt = word(Math.round(abs / 60000), 'min');
  else if (abs < 48 * 3600 * 1000) txt = word(Math.round(abs / 3600000), 'h');
  else txt = word(Math.round(abs / 86400000), 'day');
  return diff >= 0 ? `${txt} ago` : `in ${txt}`;
}

export function exactTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : '';
}

export function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  return `${Math.round(ms / 60000)} min`;
}

/** The one-line verdict for the whole platform. */
export function headline(o) {
  if (o.status === 'bad') {
    return {
      title: `${o.bad} thing${o.bad === 1 ? ' is' : 's are'} not working`,
      sub: o.warn ? `Plus ${o.warn} to look at. Everything else is fine.` : 'Everything else is fine.',
    };
  }
  if (o.status === 'warn') {
    return {
      title: `Working, with ${o.warn} thing${o.warn === 1 ? '' : 's'} to look at`,
      sub: 'Nothing is broken. The amber items below need a look when you have time.',
    };
  }
  return { title: 'Everything is working', sub: 'Every check passed.' };
}
