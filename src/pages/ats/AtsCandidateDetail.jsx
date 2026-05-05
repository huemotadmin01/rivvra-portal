import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, ChevronLeft, Mail, Phone, Linkedin, ExternalLink, Briefcase,
  MapPin, Tag, Edit3, Check, X, Award,
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
              <h1 className="text-2xl font-bold text-white truncate">{candidate.name || 'Unnamed Candidate'}</h1>
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
              <button
                onClick={startEdit}
                className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
                title="Edit"
              >
                <Edit3 size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

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
