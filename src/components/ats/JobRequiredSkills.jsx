import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { Plus, X, Search, Loader2 } from 'lucide-react';

/**
 * JobRequiredSkills — inline editor for a job's structured requiredSkills[]
 * ({ skillId, name }), shipped 2026-06-24. Drives the Suggested-Candidates
 * matcher. Restricted to existing master skills (no inline create — admins
 * add new skills in Settings), matching SkillsPicker's policy.
 *
 * Props:
 *  - orgSlug
 *  - value: array of { skillId, name }
 *  - canEdit: boolean
 *  - onSave: (nextArray) => Promise  — persists via updateJob; should resolve
 *    once the job is updated so the parent can refresh suggestions.
 */
export default function JobRequiredSkills({ orgSlug, value = [], canEdit = false, onSave }) {
  const { showToast } = useToast();
  const [skills, setSkills] = useState(value || []);
  const [allSkills, setAllSkills] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => { setSkills(value || []); }, [value]);

  const loadMaster = useCallback(async () => {
    if (!orgSlug || allSkills.length > 0) return;
    try {
      const res = await atsApi.listSkills(orgSlug);
      if (res.success) setAllSkills(res.skills || res.items || []);
    } catch {
      /* non-fatal: typeahead just shows empty */
    }
  }, [orgSlug, allSkills.length]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const persist = async (next) => {
    const prev = skills;
    setSkills(next);
    try {
      setSaving(true);
      await onSave?.(next);
    } catch (err) {
      setSkills(prev); // rollback on failure
      showToast(err.message || 'Failed to save required skills', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addSkill = (s) => {
    if (skills.some((x) => String(x.skillId) === String(s._id))) return;
    persist([...skills, { skillId: String(s._id), name: s.name }]);
    setQuery('');
    setOpen(false);
  };

  const removeSkill = (skillId) => {
    persist(skills.filter((x) => String(x.skillId) !== String(skillId)));
  };

  const assignedIds = new Set(skills.map((x) => String(x.skillId)));
  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    const list = allSkills.filter((s) => !assignedIds.has(String(s._id)));
    if (!q) return list.slice(0, 30);
    return list.filter((s) => (s.name || '').toLowerCase().includes(q)).slice(0, 30);
  })();

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-dark-400 text-sm">Required Skills</span>
        {saving && <Loader2 size={12} className="animate-spin text-dark-500" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.length === 0 && (
          <span className="text-dark-500 text-xs">
            {canEdit ? 'Add skills to sharpen candidate suggestions.' : 'None set.'}
          </span>
        )}
        {skills.map((s) => (
          <span
            key={s.skillId}
            className="inline-flex items-center gap-1 bg-dark-700 text-dark-200 text-xs px-2 py-1 rounded-full group"
          >
            <span>{s.name}</span>
            {canEdit && (
              <button
                onClick={() => removeSkill(s.skillId)}
                className="text-dark-500 hover:text-red-400 transition-colors ml-0.5 opacity-0 group-hover:opacity-100"
                title="Remove"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <div ref={containerRef} className="relative mt-2">
          <div className="relative">
            <Search size={11} className="text-dark-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              placeholder="Add a required skill…"
              onFocus={() => { setOpen(true); loadMaster(); }}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              className="input-field text-sm py-1.5 pl-7 w-full max-w-xs"
            />
          </div>
          {open && (
            <div className="absolute z-50 mt-1 w-full max-w-xs bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
              {suggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-dark-500">
                  {query.trim() ? 'No matching skill — add it in Settings' : 'Type to search'}
                </div>
              ) : (
                suggestions.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => addSkill(s)}
                    className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0 flex items-center gap-2"
                  >
                    <Plus size={11} className="text-rivvra-300" />
                    <span className="text-xs text-white">{s.name}</span>
                    {s.skillTypeName && <span className="text-[10px] text-dark-400 ml-auto">{s.skillTypeName}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
