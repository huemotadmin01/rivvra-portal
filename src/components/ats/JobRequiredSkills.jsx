import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { Plus, X, Search, Loader2, Sparkles } from 'lucide-react';

/**
 * JobRequiredSkills — inline editor for a job's structured requiredSkills[]
 * ({ skillId, name }), shipped 2026-06-24; AI auto-fill added 2026-06-25.
 *
 * Skills can be taxonomy-backed (skillId set — chip links to the picklist)
 * or name-only (skillId null — AI-extracted skills not yet in the taxonomy;
 * still used by the matcher). Manual add is restricted to existing master
 * skills; "Auto-fill from JD" uses AI to extract + map them.
 *
 * Props:
 *  - orgSlug, jobId
 *  - value: array of { skillId, name }
 *  - canEdit: boolean
 *  - onSave: (nextArray) => Promise — persists manual edits via updateJob.
 *  - onAutofilled: (nextArray) => void — called after server-side AI autofill
 *    (already saved) so the parent can refresh state + suggestions without a
 *    second write.
 */
export default function JobRequiredSkills({ orgSlug, jobId, value = [], canEdit = false, onSave, onAutofilled }) {
  const { showToast } = useToast();
  const [skills, setSkills] = useState(value || []);
  const [allSkills, setAllSkills] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
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

  // Identity for dedupe/removal: skillId when present, else normalized name.
  const idOf = (s) => (s.skillId ? `id:${s.skillId}` : `name:${String(s.name || '').toLowerCase()}`);

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

  const removeSkill = (chip) => {
    persist(skills.filter((x) => idOf(x) !== idOf(chip)));
  };

  const handleAutofill = async () => {
    try {
      setAutofilling(true);
      const res = await atsApi.autofillJobSkills(orgSlug, jobId);
      const filled = res.requiredSkills || [];
      setSkills(filled);
      onAutofilled?.(filled); // already saved server-side; refresh parent + suggestions
      showToast(
        filled.length
          ? `Filled ${filled.length} skill${filled.length > 1 ? 's' : ''} from the JD${res.aiUsed ? ' (AI)' : ''}`
          : 'No skills could be extracted from the JD',
        filled.length ? 'success' : 'info',
      );
    } catch (err) {
      showToast(err.message || 'Auto-fill failed', 'error');
    } finally {
      setAutofilling(false);
    }
  };

  const assignedIds = new Set(skills.filter((x) => x.skillId).map((x) => String(x.skillId)));
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
        <div className="flex items-center gap-2">
          {saving && <Loader2 size={12} className="animate-spin text-dark-500" />}
          {canEdit && jobId && (
            <button
              onClick={handleAutofill}
              disabled={autofilling}
              className="inline-flex items-center gap-1 text-[11px] text-rivvra-300 hover:text-rivvra-200 disabled:opacity-50 transition-colors"
              title="Use AI to extract required skills from the job description"
            >
              {autofilling ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Auto-fill from JD
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.length === 0 && (
          <span className="text-dark-500 text-xs">
            {canEdit ? 'Add skills or use Auto-fill from JD to sharpen candidate suggestions.' : 'None set.'}
          </span>
        )}
        {skills.map((s) => (
          <span
            key={idOf(s)}
            className="inline-flex items-center gap-1 bg-dark-700 text-dark-200 text-xs px-2 py-1 rounded-full group"
            title={s.skillId ? undefined : 'Extracted from the JD (not in your skills taxonomy)'}
          >
            <span>{s.name}</span>
            {!s.skillId && <span className="text-[9px] text-rivvra-300/70 uppercase tracking-wide">ai</span>}
            {canEdit && (
              <button
                onClick={() => removeSkill(s)}
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
