import { SearchInput } from './SearchInput';
import { SavedViews } from './SavedViews';
import { FilterChip } from './FilterChip';

/** The list-page control strip: search, saved views, applied filter chips,
 *  add-filter, clear-all, and a right-aligned slot for actions.
 *  Every piece is optional — pass only what the page needs. */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onRemoveFilter,
  onEditFilter,
  onAddFilter,
  onClearAll,
  views,
  activeViewId,
  viewsDirty,
  onViewSelect,
  onViewSave,
  onViewDelete,
  resultCount,
  noun = 'result',
  left,
  children,
  style,
  ...rest
}) {
  // The handoff prototype resolved these through a window namespace
  // (RivvraDesignSystem_dee6b5); in-app they are plain sibling imports.
  const NS = { SearchInput, SavedViews, FilterChip };
  const showClear = filters.length > 0 || !!search;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
        padding: '10px 12px', borderRadius: 'var(--r-3, 14px)',
        background: 'var(--surface-1, #0e131a)',
        boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {onSearchChange && NS.SearchInput && (
          <NS.SearchInput value={search || ''} onChange={onSearchChange} placeholder={searchPlaceholder} size="sm" width={220} />
        )}
        {views && NS.SavedViews && (
          <NS.SavedViews views={views} activeId={activeViewId} dirty={viewsDirty} onSelect={onViewSelect} onSave={onViewSave} onDelete={onViewDelete} />
        )}
        {left}

        {filters.map((f) => (
          NS.FilterChip ? (
            <NS.FilterChip
              key={f.id ?? f.label}
              label={f.label}
              value={f.value}
              onClick={onEditFilter ? () => onEditFilter(f) : undefined}
              onRemove={onRemoveFilter ? () => onRemoveFilter(f) : undefined}
            />
          ) : null
        ))}

        {onAddFilter && NS.FilterChip && <NS.FilterChip add onClick={onAddFilter} />}

        {showClear && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            style={{
              font: "500 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)',
              padding: '6px 4px', flexShrink: 0, textDecoration: 'underline', textUnderlineOffset: 3,
              textDecorationColor: 'var(--line-strong, rgba(255,255,255,.18))',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-2, #bac4d0)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4, #828e9f)'; }}
          >
            Clear all
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
        {resultCount != null && (
          <span style={{ font: "450 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {resultCount.toLocaleString()} {resultCount === 1 ? noun : `${noun}s`}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
