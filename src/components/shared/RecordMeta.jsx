// ============================================================================
// RecordMeta — "Created by X on <date>" / "Updated by Y on <date>" footer
// ============================================================================
//
// Drop-in audit-trail strip for detail pages. Hides Updated when it matches
// Created (i.e. never updated after creation). Falls back gracefully when
// the backend hasn't populated byName fields.
//
// Usage:
//   <RecordMeta
//     createdAt={record.createdAt}
//     createdByName={record.createdByName}
//     updatedAt={record.updatedAt}
//     updatedByName={record.updatedByName}
//   />
//
// ============================================================================

import { User, Clock } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RecordMeta({
  createdAt,
  createdByName,
  updatedAt,
  updatedByName,
  className = '',
  compact = false,
}) {
  if (!createdAt && !updatedAt) return null;

  // Treat updates within 2s of creation as "same as created" so fresh records
  // don't show a redundant second line.
  const sameAsCreated =
    createdAt &&
    updatedAt &&
    Math.abs(new Date(updatedAt).getTime() - new Date(createdAt).getTime()) < 2000;

  const createdStr = formatDate(createdAt);
  const updatedStr = formatDate(updatedAt);
  const showUpdated = updatedAt && !sameAsCreated;

  if (compact) {
    const parts = [];
    if (createdStr) parts.push(`Created ${createdStr}${createdByName ? ` by ${createdByName}` : ''}`);
    if (showUpdated && updatedStr) parts.push(`Updated ${updatedStr}${updatedByName ? ` by ${updatedByName}` : ''}`);
    return (
      <p className={`text-[11px] text-dark-500 ${className}`}>
        {parts.join(' \u00b7 ')}
      </p>
    );
  }

  return (
    <div className={`text-[11px] text-dark-500 space-y-1 ${className}`}>
      {createdStr && (
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-dark-600" />
          <span>
            Created {createdStr}
            {createdByName && (
              <>
                {' by '}
                <span className="inline-flex items-center gap-1 text-dark-400">
                  <User size={10} />{createdByName}
                </span>
              </>
            )}
          </span>
        </div>
      )}
      {showUpdated && updatedStr && (
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-dark-600" />
          <span>
            Updated {updatedStr}
            {updatedByName && (
              <>
                {' by '}
                <span className="inline-flex items-center gap-1 text-dark-400">
                  <User size={10} />{updatedByName}
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
