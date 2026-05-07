import { useEffect, useState, useCallback } from 'react';
import { Check, Plus, Loader2 } from 'lucide-react';
import signApi from '../../utils/signApi';

// TagPicker — reusable multi-select for sign template tags with inline create.
// Used in the upload modal, template editor header, and templates-list edit
// modal so the picker logic doesn't drift across three places.
//
// value:    array of selected tag IDs
// onChange: (ids: string[]) => void
// onError:  optional toast/error callback (msg, type)
export default function TagPicker({ orgSlug, value = [], onChange, onError }) {
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    setLoading(true);
    signApi
      .listTags(orgSlug)
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.tags || res.items || []);
      })
      .catch(() => !cancelled && setAvailable([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [orgSlug]);

  const toggle = useCallback((id) => {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    onChange(next);
  }, [value, onChange]);

  const createInline = useCallback(async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await signApi.createTag(orgSlug, { name });
      const created = res.data || res.tag || res.item;
      if (created && created._id) {
        setAvailable((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        onChange([...value, created._id]);
        setNewName('');
      } else if (onError) {
        onError(res.error || 'Failed to create tag', 'error');
      }
    } catch (err) {
      if (onError) onError(err?.message || 'Failed to create tag', 'error');
    } finally {
      setCreating(false);
    }
  }, [newName, creating, orgSlug, value, onChange, onError]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 size={14} className="animate-spin text-dark-400" />
        <span className="text-dark-500 text-xs">Loading tags…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.map((tag) => {
            const isSelected = value.includes(tag._id);
            return (
              <button
                key={tag._id}
                type="button"
                onClick={() => toggle(tag._id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-dark-900 border-dark-700 text-dark-400 hover:border-dark-600 hover:text-dark-300'
                }`}
              >
                {isSelected && <Check size={12} />}
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              createInline();
            }
          }}
          placeholder={available.length === 0 ? 'Create your first tag…' : 'Add a new tag'}
          className="input-field text-xs flex-1"
        />
        <button
          type="button"
          onClick={createInline}
          disabled={!newName.trim() || creating}
          className="px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add
        </button>
      </div>
    </div>
  );
}
