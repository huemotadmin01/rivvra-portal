import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Pencil, Search, X, Plus, Loader2 } from 'lucide-react';
import contactsApi from '../../utils/contactsApi';

/**
 * Searchable contact lookup for linking one contact to another.
 *
 * type='company'    — picks a parent company for an individual. Backed by
 *                     /contacts/companies (returns the full company list,
 *                     filtered client-side as the user types).
 * type='individual' — picks (or creates) an individual, e.g. a person to
 *                     attach to a company. Backed by the paginated list
 *                     endpoint with ?type=individual&search=.
 *
 * Variants:
 *   'row'    — label + value cell, click to edit (used for the parent-company
 *              field on an individual's detail page). Mirrors EmployeeLookup.
 *   'button' — a standalone trigger button (e.g. "Add person") that opens the
 *              search dropdown. Used on the company detail page.
 *
 * Props:
 *   orgSlug         — current org slug
 *   type            — 'company' | 'individual'
 *   currentValue    — selected contact _id (string | null) [row variant]
 *   currentName     — display name when not editing [row variant]
 *   onSelect        — (id, name) => void; ('', '') clears [row variant]
 *   editable        — when false, renders read-only
 *   variant         — 'row' (default) | 'button'
 *   label           — label text (row variant)
 *   linkTo          — optional fn(id) => path; renders the value as a Link
 *   allowClear      — show a "No selection" option (row variant, default true)
 *   allowCreate     — show inline "Create …" option (default true)
 *   parentCompanyId — when creating an individual, link it to this company
 *   excludeIds      — contact ids to hide from results (e.g. already linked)
 *   triggerLabel    — button text for the 'button' variant (default 'Add')
 */
export default function ContactLookup({
  orgSlug,
  type = 'company',
  currentValue,
  currentName,
  onSelect,
  editable = true,
  variant = 'row',
  label = 'Company',
  linkTo = null,
  allowClear = true,
  allowCreate = true,
  parentCompanyId = null,
  excludeIds = [],
  triggerLabel = 'Add',
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);
  // type='company' loads the full list once and filters client-side.
  const companyCacheRef = useRef(null);

  const placeholder = type === 'company' ? 'Search companies…' : 'Search people…';

  const doSearch = async (q) => {
    setLoading(true);
    try {
      if (type === 'company') {
        if (!companyCacheRef.current) {
          const res = await contactsApi.listCompanies(orgSlug);
          companyCacheRef.current = res?.companies || [];
        }
        const term = q.trim().toLowerCase();
        const list = companyCacheRef.current.filter(
          (c) => !excludeIds.includes(c._id) && (!term || (c.name || '').toLowerCase().includes(term))
        );
        setResults(list.slice(0, 25));
      } else {
        const res = await contactsApi.list(orgSlug, { type: 'individual', search: q, limit: 25 });
        const list = (res?.contacts || []).filter((c) => !excludeIds.includes(c._id));
        setResults(list);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      doSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const handleClick = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-contact-lookup-dropdown]')) return;
      setEditing(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const measure = () => {
      const node = inputRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setAnchorRect({ top: r.bottom, left: r.left, width: Math.max(r.width, 240) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [editing]);

  const handleChange = (e) => {
    setQuery(e.target.value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(e.target.value), 250);
  };

  const pick = (id, name) => {
    onSelect?.(id, name);
    setEditing(false);
    setQuery('');
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const payload = { type, name };
      if (type === 'individual' && parentCompanyId) payload.parentCompanyId = parentCompanyId;
      const res = await contactsApi.create(orgSlug, payload);
      const created = res?.contact;
      if (created?._id) {
        // Drop the new company into the client-side cache so a re-open shows it.
        if (type === 'company' && companyCacheRef.current) {
          companyCacheRef.current = [...companyCacheRef.current, { _id: created._id, name: created.name }];
        }
        pick(created._id, created.name);
      }
    } catch {
      // Surface nothing here; parent toasts on its own save failures.
    } finally {
      setCreating(false);
    }
  };

  // Only offer create when the typed name doesn't exactly match a result.
  const trimmed = query.trim();
  const exactMatch = results.some((r) => (r.name || '').toLowerCase() === trimmed.toLowerCase());
  const showCreate = allowCreate && trimmed.length > 0 && !exactMatch;

  const dropdown = anchorRect ? createPortal(
    <div
      data-contact-lookup-dropdown
      style={{
        position: 'fixed',
        top: anchorRect.top + 4,
        left: anchorRect.left,
        width: anchorRect.width,
        zIndex: 1000,
      }}
      className="bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-56 overflow-y-auto"
    >
      {allowClear && variant === 'row' && (
        <button
          type="button"
          onClick={() => pick('', '')}
          className="w-full text-left px-3 py-2 text-xs text-dark-400 hover:bg-dark-700 border-b border-dark-700/50 flex items-center gap-1.5"
        >
          <X size={11} /> No selection
        </button>
      )}
      {loading && <div className="px-3 py-2 text-xs text-dark-500">Searching…</div>}
      {!loading && results.length === 0 && !showCreate && (
        <div className="px-3 py-2 text-xs text-dark-500">
          No {type === 'company' ? 'companies' : 'people'} found
        </div>
      )}
      {results.map((c) => (
        <button
          key={c._id}
          type="button"
          onClick={() => pick(c._id, c.name)}
          className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0"
        >
          <div className="text-xs text-white">{c.name}</div>
          {(c.jobTitle || c.email) && (
            <div className="text-[10px] text-dark-400">{c.jobTitle || c.email}</div>
          )}
        </button>
      ))}
      {showCreate && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="w-full text-left px-3 py-2 text-xs text-rivvra-300 hover:bg-dark-700 flex items-center gap-1.5 border-t border-dark-700/50 disabled:opacity-60"
        >
          {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Create {type === 'company' ? 'company' : 'person'} “{trimmed}”
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  // ── button variant ────────────────────────────────────────────────────
  if (variant === 'button') {
    return (
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => editable && setEditing((s) => !s)}
          disabled={!editable}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-dark-600 text-dark-300 hover:text-rivvra-400 hover:border-rivvra-500 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={12} /> {triggerLabel}
        </button>
        {editing && (
          <div className="absolute right-0 top-full mt-1 w-64 z-50">
            <div className="relative">
              <Search size={12} className="text-dark-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleChange}
                placeholder={placeholder}
                className="w-full bg-dark-900 border border-rivvra-500 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
              />
            </div>
          </div>
        )}
        {dropdown}
      </div>
    );
  }

  // ── row variant ───────────────────────────────────────────────────────
  if (!editing) {
    const linkPath = linkTo && currentValue ? linkTo(currentValue) : null;
    return (
      <div
        className={`grid grid-cols-[140px_1fr] gap-2 py-2 ${editable ? 'group cursor-pointer hover:bg-dark-800/50 rounded px-1 -mx-1' : ''}`}
        onClick={() => editable && setEditing(true)}
      >
        <span className="text-dark-400 text-sm">{label}</span>
        <div className="flex items-center gap-1.5">
          {currentName ? (
            linkPath ? (
              <Link
                to={linkPath}
                onClick={(e) => e.stopPropagation()}
                className="text-rivvra-400 hover:text-rivvra-300 hover:underline text-sm truncate"
              >
                {currentName}
              </Link>
            ) : (
              <span className="text-white text-sm">{currentName}</span>
            )
          ) : (
            <span className="text-dark-500 text-sm">—</span>
          )}
          {editable && <Pencil size={10} className="text-dark-600 opacity-0 group-hover:opacity-100" />}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm pt-1">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        />
        {dropdown}
      </div>
    </div>
  );
}
