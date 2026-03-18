import { useState, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import {
  Mail, Edit3, Save, X, Eye, Loader2, AlertCircle, Code, Search,
  Shield, Clock, Briefcase, ChevronDown, ChevronRight,
} from 'lucide-react';
import DOMPurify from 'dompurify';

// ─── Template grouping config ───
const GROUP_CONFIG = [
  {
    id: 'platform',
    label: 'Platform',
    description: 'Authentication, invites & workspace emails',
    icon: Shield,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    match: (key) => ['otp', 'invite', 'welcome', 'workspace_recovery'].includes(key),
  },
  {
    id: 'timesheet',
    label: 'ESS',
    description: 'ESS workflow & payroll emails',
    icon: Clock,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    match: (key) => key.startsWith('ts_'),
  },
  {
    id: 'ats',
    label: 'Recruitment (ATS)',
    description: 'Job applications, interviews & hiring emails',
    icon: Briefcase,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    match: (key) => key.startsWith('ats_'),
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Uncategorized templates',
    icon: Mail,
    color: 'text-dark-400',
    bgColor: 'bg-dark-700',
    match: () => true, // catch-all
  },
];

function getGroup(key) {
  return GROUP_CONFIG.find(g => g.match(key)) || GROUP_CONFIG[GROUP_CONFIG.length - 1];
}

function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

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

  useEffect(() => { loadTemplates(); }, []);

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

  // Group & filter templates
  const { grouped, totalFiltered } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? templates.filter(t =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.key || '').toLowerCase().includes(q) ||
          (t.subject || '').toLowerCase().includes(q)
        )
      : templates;

    const map = {};
    for (const g of GROUP_CONFIG) map[g.id] = [];
    for (const t of filtered) {
      const group = getGroup(t.key);
      map[group.id].push(t);
    }
    // Remove empty groups
    const result = GROUP_CONFIG.filter(g => map[g.id].length > 0).map(g => ({
      ...g,
      templates: map[g.id],
    }));
    return { grouped: result, totalFiltered: filtered.length };
  }, [templates, searchQuery]);

  const toggleGroup = (id) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      const sampleData = {};
      for (const p of editPlaceholders) sampleData[p] = getSampleValue(p);
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
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Email Templates</h1>
          <p className="text-dark-400 text-sm mt-0.5">
            {templates.length} template{templates.length !== 1 ? 's' : ''} across the platform
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full bg-dark-800/50 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-dark-500 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search results count */}
      {searchQuery && (
        <p className="text-xs text-dark-500">
          {totalFiltered} result{totalFiltered !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Grouped Template Cards */}
      <div className="space-y-6">
        {grouped.map(group => {
          const Icon = group.icon;
          const isCollapsed = collapsedGroups.has(group.id);
          return (
            <div key={group.id}>
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex items-center gap-3 mb-3 group w-full text-left"
              >
                <div className={`w-8 h-8 rounded-lg ${group.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={group.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{group.label}</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-800 text-dark-400 font-medium">
                      {group.templates.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-dark-500">{group.description}</p>
                </div>
                {isCollapsed
                  ? <ChevronRight size={16} className="text-dark-500 group-hover:text-dark-300 transition-colors" />
                  : <ChevronDown size={16} className="text-dark-500 group-hover:text-dark-300 transition-colors" />
                }
              </button>

              {/* Template List */}
              {!isCollapsed && (
                <div className="space-y-2 ml-11">
                  {group.templates.map(t => {
                    const isEditing = editingKey === t.key;
                    return (
                      <div key={t.key} className="bg-dark-900/50 border border-dark-800 rounded-xl overflow-hidden">
                        {/* Row */}
                        <div
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-dark-800/30 transition-colors ${
                            isEditing ? 'border-b border-dark-800 bg-dark-800/20' : ''
                          }`}
                          onClick={() => isEditing ? null : startEditing(t.key)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-white">{t.name}</p>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dark-800 text-dark-500 border border-dark-700/50">
                                {t.key}
                              </span>
                            </div>
                            <p className="text-xs text-dark-500 mt-0.5 truncate">Subject: {t.subject}</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {t.updatedAt && (
                              <span className="text-[11px] text-dark-600 hidden sm:block">
                                {new Date(t.updatedAt).toLocaleDateString()}
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
                </div>
              )}
            </div>
          );
        })}

        {totalFiltered === 0 && !loading && (
          <div className="text-center py-12 text-dark-500">
            {searchQuery
              ? `No templates matching "${searchQuery}"`
              : 'No email templates found. They will be seeded automatically on the next backend deploy.'
            }
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
    enabledAppNames: 'Outreach, ESS',
    inviteLink: 'https://www.rivvra.com/#/invite?token=sample-token',
    upgradeLink: 'https://www.rivvra.com/#/org/acme-corp/upgrade',
    userName: 'Jane Smith',
    orgLoginUrl: 'https://www.rivvra.com/#/org/acme-corp/login',
    workspaceUrl: 'https://www.rivvra.com/#/org/acme-corp',
    isGoogleAuth: 'true',
    isPasswordAuth: '',
    recipientEmail: 'jane@example.com',
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
    // Payslip placeholders
    grossPay: '85,000.00',
    tdsAmount: '1,700.00',
    netPay: '83,300.00',
    payType: 'Monthly',
    rate: '85,000',
    leaveDays: '1',
    holidayDays: '2',
    disbursementDate: '07 Feb 2026',
    payslipLink: 'https://www.rivvra.com/#/org/acme-corp/timesheet/earnings',
    // ATS placeholders
    candidateName: 'Rahul Verma',
    jobTitle: 'Senior Frontend Developer',
    companyName: 'Acme Corporation',
    interviewDate: '15 Jan 2026',
    interviewTime: '11:00 AM IST',
    interviewLink: 'https://meet.google.com/abc-defg-hij',
    approverName: 'Jane Smith',
    portalLink: 'https://www.rivvra.com/#/org/acme-corp/ats',
  };
  return samples[placeholder] || `[${placeholder}]`;
}

export default AdminEmailTemplatesPage;
