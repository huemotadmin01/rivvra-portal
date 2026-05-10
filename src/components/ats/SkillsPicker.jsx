import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { Plus, X, Loader2, Award, Search } from 'lucide-react';

/**
 * Reusable SkillsPicker for candidate/application pages.
 * Props:
 *  - orgSlug: string
 *  - candidateId: string — the candidate whose skills we manage
 *  - readOnly: boolean (optional)
 */
export default function SkillsPicker({ orgSlug, candidateId, readOnly = false }) {
  const { showToast } = useToast();
  const [skills, setSkills] = useState([]);       // assigned candidate skills
  const [allSkills, setAllSkills] = useState([]);  // master skill list
  const [skillLevels, setSkillLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Add-skill form state
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  // Typeahead state for the skill picker — searchable list with a
  // "+ Create '<query>'" affordance when no exact match exists.
  const [skillQuery, setSkillQuery] = useState('');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [skillAnchorRect, setSkillAnchorRect] = useState(null);
  const skillInputRef = useRef(null);
  const skillContainerRef = useRef(null);

  const fetchSkills = useCallback(async () => {
    if (!orgSlug || !candidateId) return;
    try {
      setLoading(true);
      const [assigned, master, levels] = await Promise.all([
        atsApi.listCandidateSkills(orgSlug, candidateId),
        atsApi.listSkills(orgSlug),
        atsApi.listSkillLevels(orgSlug),
      ]);
      if (assigned.success) setSkills(assigned.candidateSkills || assigned.skills || []);
      // GET /config/skills returns { skills } and /config/skill-levels returns
      // { skillLevels }; the legacy `items` shape is kept as a fallback in case
      // any future endpoint is added with that name.
      if (master.success) setAllSkills(master.skills || master.items || []);
      if (levels.success) setSkillLevels((levels.skillLevels || levels.items || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
    } catch {
      showToast('Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, candidateId, showToast]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  // Close the typeahead dropdown when the user clicks outside it.
  useEffect(() => {
    if (!skillDropdownOpen) return;
    const handleClick = (e) => {
      if (skillContainerRef.current && skillContainerRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-skill-typeahead]')) return;
      setSkillDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [skillDropdownOpen]);

  // Re-measure anchor rect for portaled dropdown.
  useEffect(() => {
    if (!skillDropdownOpen) return;
    const measure = () => {
      const node = skillInputRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setSkillAnchorRect({ top: r.bottom, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [skillDropdownOpen]);

  // Group assigned skills by type
  const groupedSkills = skills.reduce((acc, s) => {
    const type = s.skillTypeName || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(s);
    return acc;
  }, {});

  // Filter out already-assigned skills
  const assignedSkillIds = new Set(skills.map((s) => s.skillId));
  const availableSkills = allSkills.filter((s) => !assignedSkillIds.has(s._id));

  // Group available skills by type for the dropdown
  const groupedAvailable = availableSkills.reduce((acc, s) => {
    const type = s.skillTypeName || s.skillTypeId || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(s);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!selectedSkillId) return;
    try {
      setAdding(true);
      const payload = { skillId: selectedSkillId };
      if (selectedLevelId) payload.skillLevelId = selectedLevelId;
      await atsApi.addCandidateSkill(orgSlug, candidateId, payload);
      showToast('Skill added');
      resetAddForm();
      setShowAdd(false);
      fetchSkills();
    } catch (err) {
      showToast(err.message || 'Failed to add skill', 'error');
    } finally {
      setAdding(false);
    }
  };

  const resetAddForm = () => {
    setSelectedSkillId('');
    setSelectedSkillName('');
    setSelectedLevelId('');
    setSkillQuery('');
    setSkillDropdownOpen(false);
  };

  // Create a new master skill on the fly when no existing skill matches
  // what the user typed. Closes the typeahead and selects the freshly
  // created skill so the admin can pick a level and click Add.
  const handleCreateSkill = async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    try {
      setCreatingSkill(true);
      const res = await atsApi.createSkill(orgSlug, { name });
      const newSkill = res?.skill;
      if (!newSkill?._id) throw new Error('Create returned no skill');
      setAllSkills((prev) => [...prev, newSkill]);
      setSelectedSkillId(newSkill._id);
      setSelectedSkillName(newSkill.name);
      setSkillQuery(newSkill.name);
      setSkillDropdownOpen(false);
      showToast(`Created skill "${newSkill.name}"`);
    } catch (err) {
      showToast(err.message || 'Failed to create skill', 'error');
    } finally {
      setCreatingSkill(false);
    }
  };

  // Filter master list by the search query, excluding already-assigned.
  const skillSuggestions = (() => {
    const q = skillQuery.trim().toLowerCase();
    const list = availableSkills;
    if (!q) return list.slice(0, 30);
    return list
      .filter((s) => (s.name || '').toLowerCase().includes(q))
      .slice(0, 30);
  })();
  const exactSkillMatch = skillSuggestions.find(
    (s) => (s.name || '').trim().toLowerCase() === skillQuery.trim().toLowerCase(),
  );
  const showCreateOption = skillQuery.trim().length > 0 && !exactSkillMatch;

  const handleRemove = async (assignmentId) => {
    try {
      await atsApi.removeCandidateSkill(orgSlug, candidateId, assignmentId);
      showToast('Skill removed');
      fetchSkills();
    } catch (err) {
      showToast(err.message || 'Failed to remove skill', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
        <span className="text-dark-400 text-sm">Loading skills...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award size={14} className="text-dark-400" />
          <span className="text-sm font-medium text-dark-300">Skills</span>
          <span className="text-xs bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded-full">{skills.length}</span>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-rivvra-400 hover:text-rivvra-300 text-xs flex items-center gap-1 transition-colors"
          >
            <Plus size={12} /> Add Skill
          </button>
        )}
      </div>

      {/* Add skill form */}
      {showAdd && !readOnly && (
        <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Searchable skill typeahead — replaces the long native <select>
                that listed every master skill (and on Huemot, ~360 of them).
                Includes a "+ Create '<query>'" affordance when there's no
                exact match, so admins can add new skills inline. */}
            <div ref={skillContainerRef} className="relative">
              <Search size={11} className="text-dark-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={skillInputRef}
                type="text"
                value={skillQuery}
                placeholder="Search or create skill…"
                onFocus={() => setSkillDropdownOpen(true)}
                onChange={(e) => {
                  setSkillQuery(e.target.value);
                  setSkillDropdownOpen(true);
                  // Typing invalidates a previous pick.
                  if (selectedSkillId) {
                    setSelectedSkillId('');
                    setSelectedSkillName('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSkillDropdownOpen(false);
                  if (e.key === 'Enter' && showCreateOption && !creatingSkill) {
                    e.preventDefault();
                    handleCreateSkill(skillQuery);
                  }
                }}
                className="input-field text-sm py-1.5 pl-7 w-full"
              />
              {selectedSkillId && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-rivvra-300 bg-rivvra-500/10 px-1.5 py-0.5 rounded">
                  picked
                </span>
              )}
            </div>
            <select
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(e.target.value)}
              className="input-field text-sm py-1.5"
            >
              <option value="">Level (optional)</option>
              {skillLevels.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={!selectedSkillId || adding}
              className="bg-rivvra-500 text-dark-950 px-3 py-1 rounded-lg text-xs font-medium hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {adding && <Loader2 size={12} className="animate-spin" />}
              Add
            </button>
            <button
              onClick={() => { setShowAdd(false); resetAddForm(); }}
              className="text-dark-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Skill typeahead dropdown — portaled to body so it escapes any
          parent's backdrop-blur stacking context (which otherwise traps
          the popup behind sibling SectionCards on the detail pages). */}
      {showAdd && !readOnly && skillDropdownOpen && skillAnchorRect && createPortal(
        <div
          data-skill-typeahead
          style={{
            position: 'fixed',
            top: skillAnchorRect.top + 4,
            left: skillAnchorRect.left,
            width: skillAnchorRect.width,
            zIndex: 1000,
          }}
          className="bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {showCreateOption && (
            <button
              type="button"
              onClick={() => handleCreateSkill(skillQuery)}
              disabled={creatingSkill}
              className="w-full text-left px-3 py-2 text-xs text-rivvra-300 hover:bg-dark-700 border-b border-dark-700/50 flex items-center gap-1.5 disabled:opacity-50"
            >
              {creatingSkill ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Create &ldquo;{skillQuery.trim()}&rdquo;
            </button>
          )}
          {skillSuggestions.length === 0 && !showCreateOption && (
            <div className="px-3 py-2 text-xs text-dark-500">
              {skillQuery.trim() ? 'No matching skills' : 'Type to search'}
            </div>
          )}
          {skillSuggestions.map((s) => (
            <button
              key={s._id}
              type="button"
              onClick={() => {
                setSelectedSkillId(s._id);
                setSelectedSkillName(s.name);
                setSkillQuery(s.name);
                setSkillDropdownOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0"
            >
              <div className="text-xs text-white">{s.name}</div>
              {s.skillTypeName && <div className="text-[10px] text-dark-400">{s.skillTypeName}</div>}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* Assigned skills display */}
      {skills.length === 0 ? (
        <p className="text-dark-500 text-xs py-2">No skills assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(groupedSkills).map(([typeName, typeSkills]) => (
            <div key={typeName}>
              <p className="text-dark-500 text-xs font-medium mb-1">{typeName}</p>
              <div className="flex flex-wrap gap-1.5">
                {typeSkills.map((s) => (
                  <span
                    key={s._id}
                    className="inline-flex items-center gap-1 bg-dark-700 text-dark-200 text-xs px-2 py-1 rounded-full group"
                  >
                    <span>{s.skillName}</span>
                    {s.skillLevelName && (
                      <span className="text-dark-400 text-[10px]">({s.skillLevelName})</span>
                    )}
                    {!readOnly && (
                      <button
                        onClick={() => handleRemove(s._id)}
                        className="text-dark-500 hover:text-red-400 transition-colors ml-0.5 opacity-0 group-hover:opacity-100"
                        title="Remove skill"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
