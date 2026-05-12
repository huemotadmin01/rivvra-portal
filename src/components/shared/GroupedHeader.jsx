import { ChevronDown } from 'lucide-react';

/**
 * GroupedHeader — collapsible group header row with visual hooks.
 *
 * 2026-05-13 ATS list-view audit Q3 = A+B.
 *   A: visual hooks per group (initials avatar / icon / accent colour bar)
 *   B: sticky positioning so the header stays pinned while scrolling its
 *      group's records.
 *
 * Renders as a single full-width <tr> so it slots into existing tables.
 * Children: pass extras (e.g. extra inline stats) — they sit after the count.
 *
 * Props:
 *   label, count, recordSingular, recordPlural
 *   colSpan      — total table column count (pages know this; required)
 *   onToggle, collapsed
 *   accent       — tailwind colour class for the left bar (e.g. 'bg-rivvra-500')
 *   avatarText   — initials to show in a circle (e.g. 'AS' for Aishwarya Sinha)
 *   avatarColor  — tailwind bg class for the avatar circle
 *   icon         — alternative to avatarText (lucide component)
 *   sticky       — when true, header stays pinned while scrolling
 *   stickyTop    — CSS top offset for the sticky position (default '0')
 */
function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function GroupedHeader({
  label,
  count = 0,
  recordSingular = 'record',
  recordPlural,
  colSpan,
  collapsed = false,
  onToggle,
  accent = 'bg-dark-600',
  avatarText, // pass null/undefined to skip
  avatarColor = 'bg-dark-700 text-dark-200',
  icon: Icon,
  sticky = false,
  stickyTop = '0',
  children,
}) {
  const plural = recordPlural || `${recordSingular}s`;
  const noun = count === 1 ? recordSingular : plural;
  const initials = avatarText === '' ? '' : (avatarText ?? initialsOf(label));

  // The `<tr>` itself can't be position:sticky reliably across browsers
  // for table layouts; sticky on the inner <td> works in modern Chromium.
  return (
    <tr
      className={`bg-dark-800/60 backdrop-blur-sm ${sticky ? 'relative z-10' : ''}`}
    >
      <td
        colSpan={colSpan}
        className={`px-0 py-0 ${sticky ? 'sticky' : ''}`}
        style={sticky ? { top: stickyTop } : undefined}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center w-full text-left hover:bg-dark-800/80 transition-colors"
        >
          {/* Accent colour bar */}
          <span className={`shrink-0 w-1 self-stretch ${accent}`} aria-hidden />
          <span className="flex items-center gap-3 px-4 py-2.5 flex-1 min-w-0">
            <ChevronDown
              size={14}
              className={`text-dark-400 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
            {/* Avatar / icon */}
            {Icon ? (
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${avatarColor}`}>
                <Icon size={13} />
              </span>
            ) : initials ? (
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarColor}`}>
                {initials}
              </span>
            ) : null}
            <span className="text-sm font-semibold text-dark-100 truncate">{label}</span>
            <span className="text-xs text-dark-400 font-normal whitespace-nowrap">
              {count} {noun}
            </span>
            {children && <span className="ml-auto flex items-center gap-2 text-xs text-dark-400">{children}</span>}
          </span>
        </button>
      </td>
    </tr>
  );
}
