import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Star, Building2, User, Phone, Mail, Briefcase, Trophy, X,
  Globe, Linkedin, IndianRupee, Calendar, Tag, MessageSquare, Plus,
  Check, Clock, Edit3, Trash2, ChevronRight, Loader2, XCircle, RotateCcw,
  ExternalLink, Save,
} from 'lucide-react';

function EvalStars({ value = 0, onChange, size = 16 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <Star
          key={i}
          size={size}
          className={`cursor-pointer transition-colors ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-dark-600 hover:text-dark-500'}`}
          onClick={() => onChange?.(i === value ? 0 : i)}
        />
      ))}
    </div>
  );
}

function StageBar({ stages, currentStageId, isLost, isWon, onStageClick }) {
  const currentIdx = stages.findIndex(s => s._id === currentStageId);
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => {
        const isActive = s._id === currentStageId;
        const isPast = i < currentIdx;
        let colorClass = 'bg-dark-700 text-dark-400 border-dark-600';
        if (isLost) colorClass = isActive ? 'bg-red-500/20 text-red-400 border-red-500/30' : isPast ? 'bg-dark-600 text-dark-400 border-dark-500' : 'bg-dark-700 text-dark-500 border-dark-600';
        else if (isActive) colorClass = s.isWonStage ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rivvra-500/20 text-rivvra-400 border-rivvra-500/30';
        else if (isPast) colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

        return (
          <button
            key={s._id}
            onClick={() => onStageClick(s._id)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors hover:opacity-80 ${colorClass}`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

function ActivityItem({ activity, onToggle, onDelete }) {
  return (
    <div className={`flex items-start gap-3 px-3 py-2 rounded-lg ${activity.isDone ? 'opacity-50' : ''}`}>
      <button onClick={() => onToggle(activity._id, !activity.isDone)}
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          activity.isDone ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-dark-600 hover:border-dark-400'
        }`}>
        {activity.isDone && <Check size={10} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            activity.type === 'call' ? 'bg-blue-500/10 text-blue-400' :
            activity.type === 'meeting' ? 'bg-purple-500/10 text-purple-400' :
            activity.type === 'email' ? 'bg-amber-500/10 text-amber-400' :
            activity.type === 'task' ? 'bg-emerald-500/10 text-emerald-400' :
            'bg-dark-700 text-dark-300'
          }`}>
            {activity.type}
          </span>
          {activity.dueDate && (
            <span className="text-[10px] text-dark-500 flex items-center gap-0.5">
              <Calendar size={9} /> {new Date(activity.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
        {activity.summary && <p className="text-xs text-dark-200 mt-0.5">{activity.summary}</p>}
        {activity.note && <p className="text-xs text-dark-400 mt-0.5">{activity.note}</p>}
        <p className="text-[10px] text-dark-600 mt-0.5">{activity.createdByName} · {new Date(activity.createdAt).toLocaleDateString()}</p>
      </div>
      <button onClick={() => onDelete(activity._id)} className="text-dark-600 hover:text-red-400 flex-shrink-0">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export default function CrmOpportunityDetail() {
  const { orgSlug: slug } = useOrg();
  const { opportunityId } = useParams();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [opp, setOpp] = useState(null);
  usePageTitle(opp?.name);
  const [stages, setStages] = useState([]);
  const [activities, setActivities] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // field name being edited
  const [editValue, setEditValue] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'note', summary: '', note: '', dueDate: '' });
  const [converting, setConverting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [oppRes, stagesRes, activitiesRes, reasonsRes] = await Promise.all([
        crmApi.getOpportunity(slug, opportunityId),
        crmApi.listStages(slug),
        crmApi.listActivities(slug, { opportunityId }),
        crmApi.listLostReasons(slug),
      ]);
      if (oppRes.success) setOpp(oppRes.opportunity);
      if (stagesRes.success) setStages(stagesRes.stages || []);
      if (activitiesRes.success) setActivities(activitiesRes.activities || []);
      if (reasonsRes.success) setLostReasons(reasonsRes.reasons || []);
    } catch {
      addToast('Failed to load opportunity', 'error');
    } finally {
      setLoading(false);
    }
  }, [slug, opportunityId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleFieldSave = async (field, value) => {
    try {
      await crmApi.updateOpportunity(slug, opportunityId, { [field]: value });
      setOpp(prev => ({ ...prev, [field]: value }));
      setEditing(null);
      addToast('Updated', 'success');
    } catch {
      addToast('Failed to update', 'error');
    }
  };


  const handleStageChange = async (stageId) => {
    if (opp?.stageId === stageId) return; // already on this stage
    try {
      const res = await crmApi.moveStage(slug, opportunityId, stageId);
      await fetchAll();
      if (res.jobCreated) {
        addToast(`Won! Job Position "${res.jobCreated.jobName}" created in ATS`, 'success');
      } else if (res.isWonStage) {
        addToast('Marked as Won!', 'success');
      } else {
        addToast('Stage updated', 'success');
      }
    } catch {
      addToast('Failed to move stage', 'error');
    }
  };

  const handleWon = async () => {
    try {
      await crmApi.markWon(slug, opportunityId);
      fetchAll();
      addToast('Marked as Won!', 'success');
    } catch {
      addToast('Failed', 'error');
    }
  };

  const handleLost = async (reasonId) => {
    try {
      await crmApi.markLost(slug, opportunityId, reasonId);
      setShowLostModal(false);
      fetchAll();
      addToast('Marked as Lost', 'success');
    } catch {
      addToast('Failed', 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await crmApi.restore(slug, opportunityId);
      fetchAll();
      addToast('Restored', 'success');
    } catch {
      addToast('Failed', 'error');
    }
  };

  const handleConvert = async () => {
    if (!opp.expectedRole?.trim()) {
      addToast('Please set the Expected Role first — it becomes the Job Position name in ATS', 'error');
      return;
    }
    if (!opp.expectedRevenue) {
      addToast('Please set the Expected Revenue first — it becomes the Client Budget on the Job Position', 'error');
      return;
    }
    setConverting(true);
    try {
      const res = await crmApi.convertToJob(slug, opportunityId);
      if (res.success) {
        setConverting(false);
        fetchAll();
        addToast(`Job Position "${res.jobName}" created!`, 'success');
      }
    } catch (err) {
      setConverting(false);
      addToast('Failed to convert', 'error');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await crmApi.deleteOpportunity(slug, opportunityId);
      setShowDeleteModal(false);
      setDeleting(false);
      navigate(`/org/${slug}/crm/opportunities`, { replace: true });
      addToast('Opportunity deleted successfully', 'success');
    } catch (err) {
      setDeleting(false);
      setShowDeleteModal(false);
      addToast('Failed to delete opportunity', 'error');
    }
  };

  const handleCreateActivity = async (e) => {
    e.preventDefault();
    try {
      const res = await crmApi.createActivity(slug, { ...activityForm, opportunityId });
      if (res.success) {
        setActivities(prev => [res.activity, ...prev]);
        setShowActivityForm(false);
        setActivityForm({ type: 'note', summary: '', note: '', dueDate: '' });
      }
    } catch {
      addToast('Failed to create activity', 'error');
    }
  };

  const handleToggleActivity = async (id, isDone) => {
    try {
      await crmApi.markActivityDone(slug, id, isDone);
      setActivities(prev => prev.map(a => a._id === id ? { ...a, isDone, doneAt: isDone ? new Date() : null } : a));
    } catch {
      addToast('Failed to update activity', 'error');
    }
  };

  const handleDeleteActivity = async (id) => {
    try {
      await crmApi.deleteActivity(slug, id);
      setActivities(prev => prev.filter(a => a._id !== id));
    } catch {
      addToast('Failed to delete activity', 'error');
    }
  };

  // Inline editable field
  const EditableField = ({ label, field, value, icon: Icon, type = 'text' }) => {
    const isEditing = editing === field;
    return (
      <div className="flex items-start gap-2 py-1.5">
        {Icon && <Icon size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">{label}</p>
          {isEditing ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                type={type}
                className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 focus:border-rivvra-500 focus:outline-none"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFieldSave(field, editValue);
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
              <button onClick={() => handleFieldSave(field, editValue)} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} className="text-dark-500 hover:text-dark-300"><X size={14} /></button>
            </div>
          ) : (
            <p
              className="text-xs text-dark-200 cursor-pointer hover:text-rivvra-400 transition-colors flex items-center gap-1 group"
              onClick={() => { setEditing(field); setEditValue(value || ''); }}
            >
              {value || <span className="text-dark-600 italic">Not set</span>}
              <Edit3 size={10} className="opacity-0 group-hover:opacity-100 text-dark-500" />
            </p>
          )}
        </div>
      </div>
    );
  };

  if (!slug || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
  }

  if (!opp) {
    return <div className="text-center py-20 text-dark-500">Opportunity not found</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-dark-100 truncate">{opp.name}</h1>
            <EvalStars value={opp.evaluation || 0} onChange={v => handleFieldSave('evaluation', v)} />
            {opp.isLost && <span className="text-xs bg-red-500/15 text-red-400 rounded-full px-2 py-0.5 border border-red-500/20">LOST</span>}
            {opp.wonAt && !opp.isLost && <span className="text-xs bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5 border border-amber-500/20 flex items-center gap-1"><Trophy size={10} /> WON</span>}
            {opp.isConverted && <span className="text-xs bg-emerald-500/15 text-emerald-400 rounded-full px-2 py-0.5 border border-emerald-500/20">CONVERTED</span>}
          </div>
        </div>
      </div>

      {/* Stage Bar */}
      <div className="mb-4">
        <StageBar stages={stages} currentStageId={opp.stageId} isLost={opp.isLost} isWon={!!opp.wonAt} onStageClick={handleStageChange} />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mb-6">
        {!opp.isLost && !opp.wonAt && (
          <>
            <button onClick={handleWon} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/25">
              <Trophy size={12} /> Won
            </button>
            <button onClick={() => setShowLostModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/15 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/25">
              <XCircle size={12} /> Lost
            </button>
          </>
        )}
        {(opp.isLost || opp.wonAt) && (
          <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600">
            <RotateCcw size={12} /> Restore
          </button>
        )}
        {!opp.isConverted && opp.requirementType !== 'Project Based' && (opp.wonAt || !opp.isLost) && (
          <button onClick={handleConvert} disabled={converting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50">
            {converting ? <Loader2 size={12} className="animate-spin" /> : <Briefcase size={12} />}
            Convert to Job
          </button>
        )}
        {opp.isConverted && opp.relatedJobId && (
          <button
            onClick={() => navigate(`/org/${slug}/ats/jobs/${opp.relatedJobId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-lg hover:bg-purple-500/25"
          >
            <ExternalLink size={12} /> View Job Position
          </button>
        )}
        {/* Save & Delete — pushed to the right */}
        <div className="flex-1" />
        {editing && (
          <button onClick={() => handleFieldSave(editing, editValue)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 rounded-lg transition-colors">
            <Save size={12} /> Save
          </button>
        )}
        <button onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg transition-colors">
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {/* Two-column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contact & Company */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Contact & Company</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {/* Contact Name — link to contact record if contactId exists */}
              {opp.contactId ? (
                <div className="flex items-start gap-2 py-1.5">
                  <User size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Contact Name</p>
                    <Link
                      to={`/org/${slug}/contacts/${opp.contactId}`}
                      className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors flex items-center gap-1"
                    >
                      {opp.contactName || 'View Contact'} <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ) : (
                <EditableField label="Contact Name" field="contactName" value={opp.contactName} icon={User} />
              )}
              {/* Company — link to company contact record if contactCompanyId exists */}
              {opp.contactCompanyId ? (
                <div className="flex items-start gap-2 py-1.5">
                  <Building2 size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Company</p>
                    <Link
                      to={`/org/${slug}/contacts/${opp.contactCompanyId}`}
                      className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors flex items-center gap-1"
                    >
                      {opp.companyName || 'View Company'} <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ) : (
                <EditableField label="Company" field="companyName" value={opp.companyName} icon={Building2} />
              )}
              <EditableField label="Email" field="contactEmail" value={opp.contactEmail} icon={Mail} />
              <EditableField label="Phone" field="contactPhone" value={opp.contactPhone} icon={Phone} />
              <EditableField label="LinkedIn" field="linkedinUrl" value={opp.linkedinUrl} icon={Linkedin} />
              <EditableField label="Website" field="website" value={opp.website} icon={Globe} />
            </div>
          </div>

          {/* Opportunity Info */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Opportunity Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <EditableField label="Expected Role" field="expectedRole" value={opp.expectedRole} icon={Briefcase} />
              <div className="flex items-start gap-2 py-1.5">
                <Tag size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Requirement Type</p>
                  <select
                    value={opp.requirementType || ''}
                    onChange={e => handleFieldSave('requirementType', e.target.value || null)}
                    className="bg-dark-900 border border-dark-600 rounded px-2 py-0.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none mt-0.5"
                  >
                    <option value="">Not set</option>
                    <option value="Staff Augmentation">Staff Augmentation</option>
                    <option value="Project Based">Project Based</option>
                    <option value="Full-time Hire">Full-time Hire</option>
                  </select>
                </div>
              </div>
              <EditableField label="Expected Revenue" field="expectedRevenue" value={opp.expectedRevenue} icon={IndianRupee} type="number" />
              <EditableField label="Probability (%)" field="probability" value={opp.probability} type="number" />
              <div className="flex items-start gap-2 py-1.5">
                <Tag size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Client Type</p>
                  <select
                    value={opp.clientType || 'new'}
                    onChange={e => handleFieldSave('clientType', e.target.value)}
                    className="bg-dark-900 border border-dark-600 rounded px-2 py-0.5 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none mt-0.5"
                  >
                    <option value="new">New</option>
                    <option value="existing">Existing</option>
                  </select>
                </div>
              </div>
              <EditableField label="Expected Closing" field="expectedClosing"
                value={opp.expectedClosing ? new Date(opp.expectedClosing).toISOString().split('T')[0] : ''} icon={Calendar} type="date" />
            </div>
          </div>

          {/* Marketing */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Marketing</h3>
            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
              <EditableField label="Source" field="source" value={opp.source} />
              <EditableField label="Medium" field="medium" value={opp.medium} />
              <EditableField label="Campaign" field="campaign" value={opp.campaign} />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Internal Notes</h3>
            <textarea
              value={opp.notes || ''}
              onChange={e => setOpp(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={e => handleFieldSave('notes', e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-dark-200 focus:border-rivvra-500 focus:outline-none min-h-[80px] resize-y"
              placeholder="Add notes..."
            />
          </div>
        </div>

        {/* Right: Activities + Meta */}
        <div className="space-y-4">
          {/* Quick Info */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-dark-500">Salesperson</span>
                <span className="text-dark-200">{opp.salespersonName || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Created</span>
                <span className="text-dark-200">{new Date(opp.createdAt).toLocaleDateString()}</span>
              </div>
              {opp.wonAt && (
                <div className="flex justify-between">
                  <span className="text-dark-500">Won At</span>
                  <span className="text-amber-400">{new Date(opp.wonAt).toLocaleDateString()}</span>
                </div>
              )}
              {opp.isConverted && opp.convertedAt && (
                <div className="flex justify-between">
                  <span className="text-dark-500">Converted</span>
                  <span className="text-emerald-400">{new Date(opp.convertedAt).toLocaleDateString()}</span>
                </div>
              )}
              {opp.relatedJob && (
                <div className="flex justify-between">
                  <span className="text-dark-500">Job Position</span>
                  <button
                    onClick={() => navigate(`/org/${slug}/ats/jobs/${opp.relatedJob._id}`)}
                    className="text-purple-400 hover:underline flex items-center gap-0.5"
                  >
                    {opp.relatedJob.name} <ExternalLink size={9} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Activities */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Activities</h3>
              <button onClick={() => setShowActivityForm(!showActivityForm)}
                className="text-dark-400 hover:text-rivvra-400">
                <Plus size={14} />
              </button>
            </div>

            {showActivityForm && (
              <form onSubmit={handleCreateActivity} className="mb-3 space-y-2 bg-dark-900 rounded-lg p-3">
                <div className="flex gap-2">
                  <select value={activityForm.type} onChange={e => setActivityForm(f => ({ ...f, type: e.target.value }))}
                    className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none">
                    <option value="note">Note</option>
                    <option value="call">Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                    <option value="task">Task</option>
                  </select>
                  <input type="date" value={activityForm.dueDate} onChange={e => setActivityForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none" />
                </div>
                <input value={activityForm.summary} onChange={e => setActivityForm(f => ({ ...f, summary: e.target.value }))}
                  placeholder="Summary" className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none" />
                <textarea value={activityForm.note} onChange={e => setActivityForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Details..." className="w-full bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 focus:outline-none min-h-[50px]" />
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => setShowActivityForm(false)} className="px-2 py-1 text-[10px] text-dark-400">Cancel</button>
                  <button type="submit" className="px-2 py-1 text-[10px] bg-rivvra-500 text-white rounded">Add</button>
                </div>
              </form>
            )}

            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {activities.map(a => (
                <ActivityItem key={a._id} activity={a} onToggle={handleToggleActivity} onDelete={handleDeleteActivity} />
              ))}
              {activities.length === 0 && (
                <p className="text-center text-xs text-dark-600 py-4">No activities yet</p>
              )}
            </div>
          </div>

          {/* Stage History */}
          {opp.stageHistory?.length > 0 && (
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Stage History</h3>
              <div className="space-y-1.5">
                {[...opp.stageHistory].reverse().map((sh, i) => {
                  const stageName = stages.find(s => s._id === sh.stageId)?.name || 'Unknown';
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-dark-600 flex-shrink-0" />
                      <span className="text-dark-300">{stageName}</span>
                      <span className="text-dark-600">·</span>
                      <span className="text-dark-500">{new Date(sh.enteredAt).toLocaleDateString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Opportunity</h2>
            <p className="text-xs text-dark-400 mb-1">
              Are you sure you want to permanently delete <span className="text-dark-200 font-medium">{opp.name}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">This will also remove all related activities. Linked contacts will not be affected.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-3">Mark as Lost</h2>
            <p className="text-xs text-dark-400 mb-4">Select a reason for losing this opportunity.</p>
            <div className="space-y-1.5">
              {lostReasons.map(r => (
                <button key={r._id} onClick={() => handleLost(r._id)}
                  className="w-full text-left px-3 py-2 text-xs text-dark-200 bg-dark-900 border border-dark-600 rounded-lg hover:border-red-500/40 hover:bg-red-500/5 transition-colors">
                  {r.name}
                </button>
              ))}
              <button onClick={() => handleLost(null)}
                className="w-full text-left px-3 py-2 text-xs text-dark-400 bg-dark-900 border border-dark-600 rounded-lg hover:border-dark-500">
                No reason
              </button>
            </div>
            <button onClick={() => setShowLostModal(false)} className="w-full mt-3 px-3 py-2 text-xs text-dark-400 hover:text-dark-200 text-center">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
