import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, ChevronLeft, Mail, Phone, Linkedin, ExternalLink, Briefcase,
  MapPin, Tag, Edit3, Check, X, Award, Archive, ArchiveRestore,
} from 'lucide-react';

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function getInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
}

function StageBadge({ stageName }) {
  if (!stageName) return <span className="text-dark-500 text-xs">—</span>;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-300">
      {stageName}
    </span>
  );
}

function ResultBadge({ result }) {
  if (!result) return null;
  const styles = {
    hired: 'bg-emerald-500/10 text-emerald-400',
    refused: 'bg-red-500/10 text-red-400',
  };
  const key = (result || '').toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {key.charAt(0).toUpperCase() + key.slice(1)}
    </span>
  );
}

export default function AtsCandidateDetail() {
  const { slug, candidateId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  const [candidate, setCandidate] = useState(null);
  const [applications, setApplications] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);

  usePageTitle(candidate?.name);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await atsApi.getCandidate(slug, candidateId);
      if (!res?.success || !res.candidate) {
        showToast('Candidate not found', 'error');
        navigate(orgPath('/ats/candidates'), { replace: true });
        return;
      }
      setCandidate(res.candidate);
      setApplications(res.applications || []);
      try {
        const sk = await atsApi.listCandidateSkills(slug, candidateId);
        if (sk?.success) setSkills(sk.skills || sk.data || []);
      } catch { /* skills are optional */ }
    } catch (err) {
      console.error('Failed to load candidate:', err);
      showToast(err.message || 'Failed to load candidate', 'error');
      navigate(orgPath('/ats/candidates'), { replace: true });
    } finally {
      setLoading(false);
    }
  }, [slug, candidateId, navigate, orgPath, showToast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    setEditForm({
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      linkedin: candidate.linkedin || '',
      currentTitle: candidate.currentTitle || '',
      location: candidate.location || '',
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEditForm({}); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await atsApi.updateCandidate(slug, candidateId, editForm);
      if (res?.success) {
        setCandidate({ ...candidate, ...editForm });
        setEditing(false);
        showToast('Candidate updated', 'success');
      } else {
        showToast(res?.error || 'Failed to update', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openArchiveModal = async () => {
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await atsApi.archiveCandidatePreview(slug, candidateId);
      setArchivePreview(res || { dependencies: [], activeApplications: 0 });
    } catch {
      setArchivePreview({ dependencies: [], activeApplications: 0 });
    }
  };

  const handleArchive = async (cascade = false) => {
    setArchiving(true);
    try {
      const res = await atsApi.archiveCandidate(slug, candidateId, { cascade });
      setShowArchiveModal(false);
      setCandidate((c) => ({ ...c, archived: true }));
      const cnt = res?.cascadedAppCount || 0;
      showToast(
        cascade && cnt > 0
          ? `Archived (with ${cnt} application${cnt === 1 ? '' : 's'})`
          : 'Archived',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Failed to archive', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    try {
      await atsApi.unarchiveCandidate(slug, candidateId);
      setCandidate((c) => ({ ...c, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!candidate) return null;

  const tags = candidate.tagNames || candidate.tags || [];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate(orgPath('/ats/candidates'))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Candidates
      </button>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-orange-400">{getInitials(candidate.name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-xl font-semibold text-white focus:border-rivvra-500 focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white truncate">{candidate.name || 'Unnamed Candidate'}</h1>
                {candidate.archived && (
                  <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                    <Archive size={11} /> ARCHIVED
                  </span>
                )}
              </div>
            )}
            {!editing && candidate.currentTitle && (
              <p className="text-dark-400 mt-1 truncate">{candidate.currentTitle}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {tags.map((tag, i) => (
                <span key={i} className="bg-dark-700 text-dark-300 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Tag size={10} />
                  {typeof tag === 'string' ? tag : tag.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Cancel"
                >
                  <X size={18} />
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="p-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-400 text-dark-950 transition-colors disabled:opacity-50"
                  title="Save"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                </button>
              </>
            ) : (
              <>
                {!candidate.archived && (
                  <button
                    onClick={startEdit}
                    className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
                    title="Edit"
                  >
                    <Edit3 size={18} />
                  </button>
                )}
                {candidate.archived ? (
                  <button
                    onClick={handleUnarchive}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                  >
                    <ArchiveRestore size={14} /> Unarchive
                  </button>
                ) : (
                  <button
                    onClick={openArchiveModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all text-dark-300 border-transparent hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30"
                  >
                    <Archive size={14} /> Archive
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Archive size={16} /> Archive Candidate
            </h2>
            <p className="text-sm text-dark-400 mb-3">
              Archive <span className="text-white font-medium">{candidate.name}</span>? Hidden from list views, can be restored at any time.
            </p>
            {archivePreview === null ? (
              <div className="text-xs text-dark-500 mb-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking linked records…</div>
            ) : archivePreview.activeApplications > 0 ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-300 font-medium mb-1">Linked records:</p>
                <p className="text-xs text-dark-200">
                  {archivePreview.activeApplications} active application{archivePreview.activeApplications === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-dark-500 mt-2">Choose whether to archive the applications too.</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchive(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive candidate only
              </button>
              {archivePreview?.activeApplications > 0 && (
                <button
                  onClick={() => handleArchive(true)}
                  disabled={archiving}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive candidate + {archivePreview.activeApplications} application{archivePreview.activeApplications === 1 ? '' : 's'}
                </button>
              )}
              <button
                onClick={() => setShowArchiveModal(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact info */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">Contact Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            icon={<Mail size={14} />}
            label="Email"
            value={candidate.email}
            editing={editing}
            editValue={editForm.email}
            onEditChange={(v) => setEditForm({ ...editForm, email: v })}
            type="email"
          />
          <Field
            icon={<Phone size={14} />}
            label="Phone"
            value={candidate.phone}
            editing={editing}
            editValue={editForm.phone}
            onEditChange={(v) => setEditForm({ ...editForm, phone: v })}
          />
          <Field
            icon={<Linkedin size={14} />}
            label="LinkedIn"
            value={candidate.linkedin}
            editing={editing}
            editValue={editForm.linkedin}
            onEditChange={(v) => setEditForm({ ...editForm, linkedin: v })}
            renderValue={(v) => v ? (
              <a href={v} target="_blank" rel="noopener noreferrer" className="text-rivvra-400 hover:text-rivvra-300 inline-flex items-center gap-1">
                Profile <ExternalLink size={11} />
              </a>
            ) : null}
          />
          <Field
            icon={<Briefcase size={14} />}
            label="Current Title"
            value={candidate.currentTitle}
            editing={editing}
            editValue={editForm.currentTitle}
            onEditChange={(v) => setEditForm({ ...editForm, currentTitle: v })}
          />
          <Field
            icon={<MapPin size={14} />}
            label="Location"
            value={candidate.location}
            editing={editing}
            editValue={editForm.location}
            onEditChange={(v) => setEditForm({ ...editForm, location: v })}
          />
        </div>
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide flex items-center gap-2">
            <Award size={14} /> Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={s._id || i} className="bg-dark-700 text-dark-200 text-sm px-3 py-1 rounded-full">
                {s.skillName || s.name}
                {s.proficiency && <span className="text-dark-500 ml-1">· {s.proficiency}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Applications */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">
          Applications ({applications.length})
        </h2>
        {applications.length === 0 ? (
          <p className="text-dark-500 text-sm">This candidate has no applications yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase">
                  <th className="text-left px-6 py-2 font-medium">Job</th>
                  <th className="text-left px-4 py-2 font-medium">Stage</th>
                  <th className="text-left px-4 py-2 font-medium">Result</th>
                  <th className="text-left px-4 py-2 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app._id}
                    onClick={() => navigate(orgPath(`/ats/applications/${app._id}`))}
                    className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-white">{app.jobName || '—'}</td>
                    <td className="px-4 py-3"><StageBadge stageName={app.stageName} /></td>
                    <td className="px-4 py-3"><ResultBadge result={app.kanbanState === 'done' ? 'hired' : app.kanbanState === 'blocked' ? 'refused' : null} /></td>
                    <td className="px-4 py-3 text-dark-400 text-xs">{formatDate(app.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ icon, label, value, editing, editValue, onEditChange, type = 'text', renderValue }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-dark-500 text-xs mb-1">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      {editing ? (
        <input
          type={type}
          value={editValue || ''}
          onChange={(e) => onEditChange(e.target.value)}
          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 focus:outline-none"
        />
      ) : (
        <div className="text-white text-sm">
          {renderValue ? (renderValue(value) || <span className="text-dark-500">—</span>) : (value || <span className="text-dark-500">—</span>)}
        </div>
      )}
    </div>
  );
}
