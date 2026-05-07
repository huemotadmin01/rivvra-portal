import { useState, useEffect, useRef } from 'react';
import { Pencil, Search, X } from 'lucide-react';
import contactsApi from '../../utils/contactsApi';

/**
 * Searchable employee lookup. Backed by /contacts/salespersons which returns
 * active employees scoped to the current company. Use for any "person" field
 * (salesperson, account owner, etc.).
 *
 * Props:
 *   orgSlug      — current org slug
 *   currentValue — selected employee _id (string | null)
 *   currentName  — display name to show when not editing
 *   onSelect     — (id, name) => void; called with ('', '') for "no selection"
 *   editable     — when false, renders read-only
 *   placeholder  — search input placeholder
 *   variant      — 'row' (label + value, default) | 'inline' (just the value cell)
 *   label        — label text (used by 'row' variant)
 *   allowClear   — show "No selection" option (default true)
 */
export default function EmployeeLookup({
  orgSlug,
  currentValue,
  currentName,
  onSelect,
  editable = true,
  placeholder = 'Search employees…',
  variant = 'row',
  label = 'Salesperson',
  allowClear = true,
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const searchTimer = useRef(null);

  const doSearch = async (q) => {
    try {
      setLoading(true);
      const res = await contactsApi.listSalespersons(orgSlug, q);
      setResults(res?.salespersons || []);
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
      if (containerRef.current && !containerRef.current.contains(e.target)) setEditing(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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

  const dropdown = (
    <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-56 overflow-y-auto z-50">
      {allowClear && (
        <button
          type="button"
          onClick={() => pick('', '')}
          className="w-full text-left px-3 py-2 text-xs text-dark-400 hover:bg-dark-700 border-b border-dark-700/50 flex items-center gap-1.5"
        >
          <X size={11} /> No selection
        </button>
      )}
      {loading && <div className="px-3 py-2 text-xs text-dark-500">Searching…</div>}
      {!loading && results.length === 0 && (
        <div className="px-3 py-2 text-xs text-dark-500">No employees found</div>
      )}
      {results.map((emp) => (
        <button
          key={emp._id}
          type="button"
          onClick={() => pick(emp._id, emp.name)}
          className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0"
        >
          <div className="text-xs text-white">{emp.name}</div>
          {emp.designation && <div className="text-[10px] text-dark-400">{emp.designation}</div>}
        </button>
      ))}
    </div>
  );

  if (variant === 'inline') {
    if (!editing) {
      return (
        <span
          className={`inline-flex items-center gap-1 ${editable ? 'cursor-pointer hover:text-rivvra-300 group' : ''}`}
          onClick={() => editable && setEditing(true)}
        >
          <span className="truncate" title={currentName || 'Unassigned'}>
            {currentName || <span className="text-dark-500 italic">Unassigned</span>}
          </span>
          {editable && <Pencil size={10} className="text-dark-600 opacity-0 group-hover:opacity-100" />}
        </span>
      );
    }
    return (
      <div ref={containerRef} className="relative w-full">
        <div className="flex items-center gap-1">
          <Search size={11} className="text-dark-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder={placeholder}
            className="w-full bg-dark-900 border border-rivvra-500 rounded pl-7 pr-2 py-1 text-xs text-white focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
        </div>
        {dropdown}
      </div>
    );
  }

  // variant === 'row'
  if (!editing) {
    return (
      <div
        className={`grid grid-cols-[140px_1fr] gap-2 py-2 ${editable ? 'group cursor-pointer hover:bg-dark-800/50 rounded px-1 -mx-1' : ''}`}
        onClick={() => editable && setEditing(true)}
      >
        <span className="text-dark-400 text-sm">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm">{currentName || <span className="text-dark-500">—</span>}</span>
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
