// ============================================================================
// AdminEmailTemplatesPageV2.jsx — platform email template editor, on ds
// ============================================================================
//
// Route: /admin/email-templates, inside <SuperAdminRoute><AdminLayout />.
//
// This page edits the raw HTML body of every transactional email the platform
// sends — OTPs, invites, payslips, ATS offers, celebration mails. A broken
// template here does not surface as a broken page; it surfaces as customers
// not receiving a login code. So nothing about loading, saving or previewing
// moves: every handler and the whole sample-value table are spliced in
// byte-identically.
//
// ── Three things that are deliberately NOT re-themed ────────────────────────
// 1. **The preview surface stays white.** Email clients render on white, so an
//    email preview themed to the dark admin shell would be actively
//    misleading — an admin would sign off on contrast that does not exist in
//    Gmail. The preview keeps its hardcoded white background, exactly as
//    legacy had it. Same principle as the careers pages and the signing
//    document surface.
// 2. **`DOMPurify.sanitize(previewHtml)`** — the preview injects HTML the
//    server rendered. The sanitize call is the only thing between a template
//    body and script execution in the admin's session.
// 3. **`GROUP_CONFIG` is spliced whole**, including its now-unused `color` and
//    `bgColor` Tailwind strings. The `match` predicates decide which template
//    lands in which group, and rewriting the object to drop two presentation
//    fields would mean retyping those predicates. ds tones are looked up
//    separately by group id (GROUP_TONE below), so the classification is
//    untouched and only the paint is new.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • `handleSave`'s required-field guard (`!editSubject.trim() ||
//     !editHtmlBody.trim()`), which is what stops an empty body being written
//     over a working template.
//   • `startEditing` fetching the FULL template by key rather than reusing the
//     list row — the list omits `htmlBody`, so editing from list data would
//     save an empty body.
//   • `getSampleValue`'s 60-entry table, including `contractorPayable`'s
//     '₹85,000'. These are what the Preview renders, so they are the only
//     description an admin gets of what a placeholder actually holds.
//   • The `[${placeholder}]` fallback for unknown placeholders — a missing
//     sample must be visible in the preview, not silently empty.
//
// ── Structural note (same as AdminPayrollSettingsPage / WorkspaceDetail) ────
// `PageSwitch` CANNOT gate this route: `/admin/*` is outside `OrgProvider` and
// `useOrg()` throws there. The v2 page ships directly and the legacy file is
// kept unreferenced, so reverting is one line. The page pins
// `data-theme="dark"` so it always matches the hard-dark AdminLayout shell.
//
// Not triggered: save template. (Preview is a POST and is also not triggered.)
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import {
  Mail, Edit3, Save, X, Eye, Loader2, AlertCircle, Code,
  Shield, Clock, Briefcase, Calendar,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import {
  Panel, Button, Chip, Callout, Accordion, SearchInput,
  Field, Input, Textarea, EmptyState, Spinner,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const monoChip = { font: "450 10.5px/1.4 ui-monospace, SFMono-Regular, monospace" };
const labelStyle = { display: 'block', font: "550 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 6 };

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
    id: 'celebrations',
    label: 'Celebrations',
    description: 'Birthday, anniversary & probation completion emails',
    icon: Calendar,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    match: (key) => key.startsWith('celebration_'),
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

// ds tone per group id. Kept OUT of GROUP_CONFIG so that object — whose `match`
// predicates are the actual grouping contract — could be spliced verbatim.
const GROUP_TONE = {
  platform: 'info',
  timesheet: 'brand',
  celebrations: 'warn',
  ats: 'purple',
  other: 'neutral',
};

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminEmailTemplatesPageV2() {
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
      <div data-theme="dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute, so without this the page inherits
  // whatever a previous org-app visit left on <html>.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', display: 'grid', gap: 18 }}>
      {/* Header + Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <h1 style={{ font: "700 22px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
            Email Templates
          </h1>
          <p style={{ ...microStyle, marginTop: 3 }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''} across the platform
          </p>
        </div>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search templates..."
          aria-label="Search email templates"
          width={288}
        />
      </div>

      {searchQuery && (
        <p style={microStyle}>
          {totalFiltered} result{totalFiltered !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {error && <Callout tone="danger" icon={<AlertCircle size={16} />}>{error}</Callout>}

      <div style={{ display: 'grid', gap: 14 }}>
        {grouped.map(group => {
          const Icon = group.icon;
          const isCollapsed = collapsedGroups.has(group.id);
          return (
            <Accordion
              key={group.id}
              icon={<Icon size={16} />}
              open={!isCollapsed}
              onToggle={() => toggleGroup(group.id)}
              title={(
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {group.label}
                  <Chip tone={GROUP_TONE[group.id] || 'neutral'}>{group.templates.length}</Chip>
                </span>
              )}
              subtitle={group.description}
            >
              <div style={{ display: 'grid', gap: 8 }}>
                {group.templates.map(t => {
                  const isEditing = editingKey === t.key;
                  return (
                    <div
                      key={t.key}
                      style={{
                        borderRadius: 'var(--r-2, 12px)',
                        background: 'var(--surface-2)',
                        boxShadow: '0 0 0 1px var(--line)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Row — the whole row opens the editor, as legacy. */}
                      <div
                        role="button"
                        tabIndex={isEditing ? -1 : 0}
                        onClick={() => (isEditing ? null : startEditing(t.key))}
                        onKeyDown={(e) => {
                          if (isEditing) return;
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEditing(t.key); }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                          cursor: isEditing ? 'default' : 'pointer',
                          borderBottom: isEditing ? '1px solid var(--line)' : 'none',
                          background: isEditing ? 'var(--surface-3)' : 'transparent',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{t.name}</span>
                            <Chip style={monoChip}>{t.key}</Chip>
                          </div>
                          <p style={{ ...microStyle, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Subject: {t.subject}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          {t.updatedAt && (
                            <span style={microStyle} className="max-sm:!hidden">
                              {new Date(t.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                          {isEditing ? (
                            <Button
                              variant="ghost" size="sm"
                              onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                              aria-label={`Stop editing ${t.name}`}
                              iconLeft={<X size={16} />}
                            />
                          ) : (
                            <Button
                              variant="ghost" size="sm"
                              onClick={(e) => { e.stopPropagation(); startEditing(t.key); }}
                              aria-label={`Edit ${t.name}`}
                              iconLeft={<Edit3 size={16} />}
                            />
                          )}
                        </div>
                      </div>

                      {/* Expanded editor */}
                      {isEditing && (
                        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
                          {saveError && <Callout tone="danger" icon={<AlertCircle size={16} />}>{saveError}</Callout>}
                          {saveSuccess && <Callout tone="brand">{saveSuccess}</Callout>}

                          <Field label="Subject" htmlFor={`et-subject-${t.key}`}>
                            <Input
                              id={`et-subject-${t.key}`}
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="Email subject line..."
                            />
                          </Field>

                          {editPlaceholders.length > 0 && (
                            <div>
                              <span style={labelStyle}>Available Placeholders</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {editPlaceholders.map(p => (
                                  <Chip key={p} tone="warn" style={monoChip}>{'{{' + p + '}}'}</Chip>
                                ))}
                              </div>
                            </div>
                          )}

                          <Field
                            label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Code size={12} /> HTML Body</span>}
                            htmlFor={`et-body-${t.key}`}
                          >
                            <Textarea
                              id={`et-body-${t.key}`}
                              value={editHtmlBody}
                              onChange={(e) => setEditHtmlBody(e.target.value)}
                              rows={30}
                              placeholder="<div>...</div>"
                              style={{
                                font: "450 12.5px/1.65 ui-monospace, SFMono-Regular, monospace",
                                resize: 'vertical', minHeight: 400,
                              }}
                            />
                          </Field>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <Button
                              onClick={handleSave}
                              disabled={saving}
                              iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            >
                              Save Template
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handlePreview}
                              disabled={previewLoading}
                              iconLeft={previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                            >
                              Preview
                            </Button>
                            <Button variant="ghost" onClick={cancelEditing}>Cancel</Button>
                          </div>

                          {/* Preview panel. The body is deliberately NOT themed:
                              email clients render on white, so previewing a
                              template on the dark admin surface would show an
                              admin contrast that does not exist in Gmail. */}
                          {showPreview && (
                            <div style={{ borderRadius: 'var(--r-2, 12px)', overflow: 'hidden', boxShadow: '0 0 0 1px var(--line-2)' }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '7px 12px', background: 'var(--surface-3)',
                                borderBottom: '1px solid var(--line-2)',
                              }}>
                                <span style={{ ...microStyle, color: 'var(--fg-3)' }}>Email Preview</span>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => setShowPreview(false)}
                                  aria-label="Close preview"
                                  iconLeft={<X size={14} />}
                                />
                              </div>
                              {previewSubject && (
                                <div style={{ padding: '7px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line-2)' }}>
                                  <span style={microStyle}>Subject: </span>
                                  <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{previewSubject}</span>
                                </div>
                              )}
                              <div
                                style={{ padding: 16, background: '#ffffff', minHeight: 200, maxHeight: 600, overflowY: 'auto' }}
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
            </Accordion>
          );
        })}

        {totalFiltered === 0 && !loading && (
          <EmptyState icon={<Mail size={24} />} title={searchQuery ? 'No matching templates' : 'No email templates found'}>
            {searchQuery
              ? `No templates matching "${searchQuery}"`
              : 'No email templates found. They will be seeded automatically on the next backend deploy.'}
          </EmptyState>
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
    // Ported from the legacy page 2026-08-22 (added on `main` with the Job
    // On Hold / Job Closed templates). Without these four the V2 preview
    // renders those placeholders EMPTY, which is the exact failure mode the
    // sample table exists to prevent.
    portalUrl: 'https://www.rivvra.com/#/org/acme-corp/ats/jobs',
    recruiterName: 'HR Team',
    department: 'IT',
    changedByName: 'Jane Smith',
  };
  return samples[placeholder] || `[${placeholder}]`;
}

export default AdminEmailTemplatesPageV2;
