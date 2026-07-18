import { useState, useEffect, useCallback } from 'react';
import atsApi from '../../../utils/atsApi';
import {
  X, Loader2, Mail, Eye, Edit2,
  ToggleLeft, ToggleRight, RotateCcw, Save,
} from 'lucide-react';

const TEMPLATE_LABELS = {
  ats_stage_new: 'Application Received',
  ats_stage_qualification: 'Initial Qualification',
  ats_stage_l1_interview: 'L1 Interview',
  ats_stage_l2_interview: 'L2 Interview',
  ats_stage_documents: 'Documents Collection',
  ats_stage_hired: 'Hired / Welcome',
  ats_refused: 'Application Refused',
  ats_job_approval_request: 'Job Approval Request',
  ats_job_approved: 'Job Approved',
};

const EVENT_TEMPLATE_KEYS = ['ats_refused', 'ats_job_approval_request', 'ats_job_approved'];

export default function EmailTemplatesSection({ orgSlug, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', htmlBody: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [togglingStage, setTogglingStage] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.listEmailTemplates(orgSlug);
      if (res.success) {
        setTemplates(res.templates || []);
        setStages(res.stages || []);
      }
    } catch (err) {
      showToast('Failed to load email templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const getTemplate = (key) => templates.find(t => t.key === key);

  const handleEdit = (key) => {
    const t = getTemplate(key);
    setEditForm({
      subject: t?.subject || '',
      htmlBody: t?.htmlBody || '',
      name: t?.name || TEMPLATE_LABELS[key] || key,
    });
    setEditingKey(key);
    setPreviewHtml(null);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      const res = await atsApi.updateEmailTemplate(orgSlug, editingKey, editForm);
      if (res.success) {
        showToast('Email template saved', 'success');
        setEditingKey(null);
        loadData();
      } else {
        showToast(res.error || 'Failed to save template', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (key) => {
    const label = TEMPLATE_LABELS[key] || key;
    if (!window.confirm(`Revert "${label}" to the system default? Your custom subject and body will be deleted. This cannot be undone.`)) return;
    try {
      const res = await atsApi.deleteEmailTemplate(orgSlug, key);
      if (res.success) {
        showToast('Reverted to system default', 'success');
        loadData();
      } else {
        showToast(res.error || 'Failed to revert template', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to revert template', 'error');
    }
  };

  // `draft` ({ subject, htmlBody }) — passed when previewing from the edit
  // modal so unsaved edits render; omitted elsewhere (previews saved version).
  const handlePreview = async (key, draft) => {
    setPreviewLoading(true);
    try {
      const res = await atsApi.previewEmailTemplate(orgSlug, key, undefined, draft);
      if (res.success) {
        setPreviewHtml(res.html);
      } else {
        showToast(res.error || 'Preview failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Preview failed', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleToggleStageEmail = async (stageId, currentEnabled) => {
    setTogglingStage(stageId);
    try {
      const res = await atsApi.toggleStageEmail(orgSlug, stageId, !currentEnabled);
      if (res.success) {
        setStages(prev => prev.map(s => s._id === stageId ? { ...s, emailEnabled: !currentEnabled } : s));
        showToast(`Stage email ${!currentEnabled ? 'enabled' : 'disabled'}`, 'success');
      }
    } catch {
      showToast('Failed to toggle stage email', 'error');
    } finally {
      setTogglingStage(null);
    }
  };

  const placeholderChips = ['candidateName', 'jobTitle', 'orgName', 'stageName', 'portalUrl', 'refuseReason', 'approverName', 'recruiterName', 'department'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-rivvra-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stage-based email templates */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Mail size={18} className="text-rivvra-400" />
          Stage Email Notifications
        </h3>
        <p className="text-dark-400 text-sm mb-4">
          Emails automatically sent to candidates when their application moves to a stage.
        </p>

        <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Stage</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Email Enabled</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Template</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Subject</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => {
                const tpl = stage.emailTemplateKey ? getTemplate(stage.emailTemplateKey) : null;
                return (
                  <tr key={stage._id} className="border-b border-dark-700/50 hover:bg-dark-750/30">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">{stage.name}</span>
                      <span className="text-xs text-dark-500 ml-2">seq {stage.sequence}</span>
                    </td>
                    <td className="px-4 py-3">
                      {stage.emailTemplateKey ? (
                        <button
                          onClick={() => handleToggleStageEmail(stage._id, stage.emailEnabled)}
                          disabled={togglingStage === stage._id}
                          className="flex items-center gap-1.5"
                        >
                          {togglingStage === stage._id ? (
                            <Loader2 size={18} className="animate-spin text-dark-400" />
                          ) : stage.emailEnabled ? (
                            <ToggleRight size={22} className="text-rivvra-500" />
                          ) : (
                            <ToggleLeft size={22} className="text-dark-500" />
                          )}
                          <span className={`text-xs ${stage.emailEnabled ? 'text-rivvra-400' : 'text-dark-500'}`}>
                            {stage.emailEnabled ? 'On' : 'Off'}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-dark-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tpl ? (
                        <span className="text-sm text-dark-300">{TEMPLATE_LABELS[stage.emailTemplateKey] || tpl.name}</span>
                      ) : (
                        <span className="text-xs text-dark-600 italic">No template</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tpl ? (
                        <span className="text-xs text-dark-400 truncate block max-w-[250px]">{tpl.subject}</span>
                      ) : (
                        <span className="text-xs text-dark-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {stage.emailTemplateKey && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handlePreview(stage.emailTemplateKey)}
                            className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => handleEdit(stage.emailTemplateKey)}
                            className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          {tpl?.isCustom && (
                            <button
                              onClick={() => handleRevert(stage.emailTemplateKey)}
                              className="p-1.5 text-dark-400 hover:text-amber-400 rounded transition-colors"
                              title="Revert to default"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event-based email templates */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Event Email Templates</h3>
        <p className="text-dark-400 text-sm mb-4">
          Emails triggered by specific events (refusal, job approval).
        </p>

        <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Event</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Subject</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Recipient</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_TEMPLATE_KEYS.map(key => {
                const tpl = getTemplate(key);
                const recipientMap = {
                  ats_refused: 'Candidate',
                  ats_job_approval_request: 'Approver',
                  ats_job_approved: 'Recruiter',
                };
                return (
                  <tr key={key} className="border-b border-dark-700/50 hover:bg-dark-750/30">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">{TEMPLATE_LABELS[key]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-400 truncate block max-w-[300px]">{tpl?.subject || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-300 bg-dark-700 px-2 py-0.5 rounded">{recipientMap[key]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handlePreview(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Preview">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleEdit(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        {tpl?.isCustom && (
                          <button onClick={() => handleRevert(key)} className="p-1.5 text-dark-400 hover:text-amber-400 rounded transition-colors" title="Revert to default">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h3 className="text-lg font-semibold text-white">Edit Email Template</h3>
                <p className="text-sm text-dark-400 mt-0.5">{TEMPLATE_LABELS[editingKey] || editingKey}</p>
              </div>
              <button onClick={() => setEditingKey(null)} className="text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Placeholder chips */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Available Placeholders</label>
                <div className="flex flex-wrap gap-1.5">
                  {placeholderChips.map(p => (
                    <button
                      key={p}
                      onClick={() => navigator.clipboard.writeText(`{{${p}}}`).then(() => showToast(`Copied {{${p}}}`, 'success'))}
                      className="text-xs bg-dark-700 text-rivvra-400 px-2 py-1 rounded hover:bg-dark-600 transition-colors cursor-pointer font-mono"
                    >
                      {`{{${p}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="Email subject with {{placeholders}}"
                />
              </div>

              {/* HTML Body */}
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">HTML Body</label>
                <textarea
                  value={editForm.htmlBody}
                  onChange={e => setEditForm(f => ({ ...f, htmlBody: e.target.value }))}
                  rows={14}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm font-mono focus:border-rivvra-500 focus:outline-none resize-y"
                  placeholder="<div>Email HTML body with {{placeholders}}</div>"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-dark-700">
              <button
                onClick={() => handlePreview(editingKey, { subject: editForm.subject, htmlBody: editForm.htmlBody })}
                disabled={previewLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-dark-700 text-dark-200 rounded-lg hover:bg-dark-600 transition-colors"
              >
                {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Preview
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingKey(null)}
                  className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-500 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-dark-800 border-b border-dark-700">
              <h3 className="text-sm font-semibold text-white">Email Preview</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-dark-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[80vh]">
              <iframe
                srcDoc={previewHtml}
                sandbox=""
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main AtsConfig Component ─────────────────────────────────────────── */
