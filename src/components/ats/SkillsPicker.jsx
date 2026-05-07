import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { Plus, X, Loader2, Award, ChevronDown } from 'lucide-react';

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
  const [selectedLevelId, setSelectedLevelId] = useState('');

  const fetchSkills = useCallback(async () => {
    if (!orgSlug || !candidateId) return;
    try {
      setLoading(true);
      const [assigned, master, levels] = await Promise.all([
        atsApi.listCandidateSkills(orgSlug, candidateId),
        atsApi.listSkills(orgSlug),
        atsApi.listSkillLevels(orgSlug),
      ]);
      if (assigned.success) setSkills(assigned.skills || []);
      if (master.success) setAllSkills(master.items || []);
      if (levels.success) setSkillLevels((levels.items || []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
    } catch {
      showToast('Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, candidateId, showToast]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

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
      setSelectedSkillId('');
      setSelectedLevelId('');
      setShowAdd(false);
      fetchSkills();
    } catch (err) {
      showToast(err.message || 'Failed to add skill', 'error');
    } finally {
      setAdding(false);
    }
  };

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
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className="input-field text-sm py-1.5"
            >
              <option value="">Select skill...</option>
              {Object.entries(groupedAvailable).map(([type, typeSkills]) => (
                <optgroup key={type} label={type}>
                  {typeSkills.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
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
              onClick={() => { setShowAdd(false); setSelectedSkillId(''); setSelectedLevelId(''); }}
              className="text-dark-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
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
