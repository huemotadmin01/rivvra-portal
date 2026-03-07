import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import {
  Mail, Edit3, Save, X, Eye, Loader2, AlertCircle, ChevronDown, ChevronRight, Code
} from 'lucide-react';
import DOMPurify from 'dompurify';

function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editing state
  const [editingKey, setEditingKey] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editHtmlBody, setEditHtmlBody] = useState('');
  const [editPlaceholders, setEditPlaceholders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Preview state
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getEmailTemplates();
      setTemplates(res.templates || []);
    } catch (err) {
      setError(err.message || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = async (key) => {
    try {
      setEditingKey(key);
      setSaveError('');
      setSaveSuccess('');
      setShowPreview(false);
      setPreviewHtml('');

      const res = await api.getEmailTemplate(key);
      const t = res.template;
      setEditSubject(t.subject || '');
      setEditHtmlBody(t.htmlBody || '');
      setEditPlaceholders(t.placeholders || []);
    } catch (err) {
      setSaveError('Failed to load template: ' + err.message);
    }
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditSubject('');
    setEditHtmlBody('');
    setEditPlaceholders([]);
    setShowPreview(false);
    setPreviewHtml('');
    setSaveError('');
    setSaveSuccess('');
  };

  const handleSave = async () => {
    if (!editSubject.trim() || !editHtmlBody.trim()) {
      setSaveError('Subject and HTML body are required');
      return;
    }

    try {
      setSaving(true);
      setSaveError('');
      setSaveSuccess('');

      await api.updateEmailTemplate(editingKey, {
        subject: editSubject,
        htmlBody: editHtmlBody,
        placeholders: editPlaceholders,
      });

      setSaveSuccess('Template saved successfully');
      await loadTemplates();
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      setSaveError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      setShowPreview(true);

      // Build sample data from placeholders
      const sampleData = {};
      for (const p of editPlaceholders) {
        sampleData[p] = getSampleValue(p);
      }

      const res = await api.previewEmailTemplate(editingKey, sampleData);
      setPreviewSubject(res.subject || '');
      setPreviewHtml(res.html || '');
    } catch (err) {
      setPreviewHtml(`<p style="color: red;">Preview failed: ${err.message}</p>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Email Templates</h1>
        <p className="text-dark-400 mt-1">Manage system email templates used across the platform</p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Template Cards */}
      <div className="space-y-4">
        {templates.map((t) => {
          const isEditing = editingKey === t.key;
          return (
            <div key={t.key} className="bg-dark-900/50 border border-dark-800 rounded-xl overflow-hidden">
              {/* Card Header */}
              <div
                className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-dark-800/20 transition-colors ${
                  isEditing ? 'border-b border-dark-800' : ''
                }`}
                onClick={() => isEditing ? null : startEditing(t.key)}
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-800 text-dark-400">{t.key}</span>
                  </div>
                  <p className="text-xs text-dark-500 mt-0.5 truncate">Subject: {t.subject}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {t.updatedAt && (
                    <span className="text-xs text-dark-500">
                      Updated {new Date(t.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                  {isEditing ? (
                    <button onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50">
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); startEditing(t.key); }}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-amber-400 hover:bg-amber-500/10">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Editor */}
              {isEditing && (
                <div className="p-5 space-y-4">
                  {/* Save messages */}
                  {saveError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{saveError}</div>
                  )}
                  {saveSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">{saveSuccess}</div>
                  )}

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider">Subject</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="input-field text-sm"
                      placeholder="Email subject line..."
                    />
                  </div>

                  {/* Placeholders */}
                  {editPlaceholders.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider">Available Placeholders</label>
                      <div className="flex flex-wrap gap-1.5">
                        {editPlaceholders.map(p => (
                          <span key={p} className="text-xs font-mono px-2 py-1 rounded bg-dark-800 text-amber-400 border border-dark-700">
                            {'{{' + p + '}}'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* HTML Body */}
                  <div>
                    <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                      <Code className="w-3 h-3" /> HTML Body
                    </label>
                    <textarea
                      value={editHtmlBody}
                      onChange={(e) => setEditHtmlBody(e.target.value)}
                      rows={30}
                      className="input-field text-sm font-mono leading-relaxed resize-y min-h-[400px]"
                      placeholder="<div>...</div>"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-dark-950 font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Template
                    </button>
                    <button
                      onClick={handlePreview}
                      disabled={previewLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 text-sm transition-colors"
                    >
                      {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      Preview
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="px-4 py-2 rounded-lg text-dark-400 hover:text-white text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Preview Panel */}
                  {showPreview && (
                    <div className="mt-4 border border-dark-700 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-dark-800 border-b border-dark-700 flex items-center justify-between">
                        <span className="text-xs font-medium text-dark-400">Email Preview</span>
                        <button onClick={() => setShowPreview(false)} className="text-dark-400 hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {previewSubject && (
                        <div className="px-4 py-2 bg-dark-800/50 border-b border-dark-700">
                          <span className="text-xs text-dark-500">Subject: </span>
                          <span className="text-sm text-white">{previewSubject}</span>
                        </div>
                      )}
                      <div
                        className="p-4 bg-white min-h-[200px] max-h-[600px] overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {templates.length === 0 && !loading && (
          <div className="text-center py-12 text-dark-400">
            No email templates found. They will be seeded automatically on the next backend deploy.
          </div>
        )}
      </div>
    </div>
  );
}

// Generate sample values for placeholders
function getSampleValue(placeholder) {
  const samples = {
    otp: '123456',
    expiryMinutes: '10',
    orgName: 'Acme Corporation',
    inviterName: 'John Doe',
    enabledAppNames: 'Outreach, Timesheet',
    inviteLink: 'https://www.rivvra.com/#/invite?token=sample-token',
    upgradeLink: 'https://www.rivvra.com/#/org/acme-corp/upgrade',
    userName: 'Jane Smith',
    orgLoginUrl: 'https://www.rivvra.com/#/org/acme-corp/login',
    // Timesheet placeholders
    employeeName: 'Priya Sharma',
    monthName: 'January',
    year: '2026',
    totalHours: '168',
    totalWorkingDays: '21',
    projectName: 'Acme Web Platform',
    reviewLink: 'https://www.rivvra.com/#/org/acme-corp/timesheet/approvals',
    timesheetLink: 'https://www.rivvra.com/#/org/acme-corp/timesheet/my-timesheet',
    approvedByName: 'John Doe',
    contractorPayable: '\u20B985,000',
    rejectionReason: 'Hours for Dec 25 need correction — it was a public holiday.',
    revertedByName: 'John Doe',
    pendingCount: '3',
    managerName: 'John Doe',
    payslipLink: 'https://www.rivvra.com/#/org/acme-corp/timesheet/payslips',
  };
  return samples[placeholder] || `[${placeholder}]`;
}

export default AdminEmailTemplatesPage;
