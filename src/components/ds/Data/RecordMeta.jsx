import { User, Clock } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Audit-trail footer for a record: "Created <date> by <name>", plus an
 * Updated line when the record has actually changed since creation.
 *
 * The suppression rule matters: a freshly created record usually has
 * `updatedAt` set within milliseconds of `createdAt`, so showing both lines
 * would tell every new record it was "updated". Anything inside 2 seconds
 * of creation counts as never-updated (matching the legacy
 * `shared/RecordMeta.jsx`).
 *
 * Renders nothing at all when neither timestamp is present.
 */
export function RecordMeta({ createdAt, createdByName, updatedAt, updatedByName, compact = false, style }) {
  if (!createdAt && !updatedAt) return null;

  const sameAsCreated = createdAt && updatedAt
    && Math.abs(new Date(updatedAt).getTime() - new Date(createdAt).getTime()) < 2000;
  const createdStr = formatDate(createdAt);
  const updatedStr = formatDate(updatedAt);
  const showUpdated = updatedAt && !sameAsCreated && updatedStr;

  const base = { font: "450 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' };

  if (compact) {
    const parts = [];
    if (createdStr) parts.push(`Created ${createdStr}${createdByName ? ` by ${createdByName}` : ''}`);
    if (showUpdated) parts.push(`Updated ${updatedStr}${updatedByName ? ` by ${updatedByName}` : ''}`);
    return <p style={{ ...base, ...style }}>{parts.join(' · ')}</p>;
  }

  const line = (label, dateStr, byName) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Clock size={11} style={{ color: 'var(--fg-faint, #4a5563)', flexShrink: 0 }} />
      <span>
        {label} {dateStr}
        {byName && (
          <>
            {' by '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-3, #98a4b2)' }}>
              <User size={10} />{byName}
            </span>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div style={{ ...base, display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {createdStr && line('Created', createdStr, createdByName)}
      {showUpdated && line('Updated', updatedStr, updatedByName)}
    </div>
  );
}
