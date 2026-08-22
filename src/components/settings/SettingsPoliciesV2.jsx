// ============================================================================
// SettingsPolicies.jsx — Admin: manage Company Policies (org-admin only)
// ============================================================================
// Company-scoped (active company via the switcher). Upload PDF/DOCX policies,
// target them by employee type, optionally require acknowledgment, and view a
// per-policy acknowledgment report. Backend: src/policies.js.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, AlertCircle, Plus, FileText, Pencil, Archive, Upload,
  Users, CheckCircle2, Loader2, BarChart3, Trash2,
} from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../utils/api';
import {
  Panel, Chip, Button, Input, Select, Textarea, Modal, ConfirmDialog,
  EmptyState, PageSpinner,
} from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ This tab can permanently destroy records. `deletePolicy` hits
// `/policies/:id/permanent`, which removes the document file AND every
// acknowledgment record for it — the audit trail proving employees read the
// policy. Neither it nor Archive, nor either save path, was triggered during
// verification.
//
// Two things carried across byte-identically:
//   · `handleSubmit`'s appliesTo guard. Unchecking "All employees" and then
//     selecting nothing would send `appliesTo: []`, which the BACKEND treats as
//     everyone — the exact opposite of the intent. The guard forces a choice,
//     and the comment explaining why comes with it.
//   · The `appliesTo?.filter((k) => k !== 'ALL')` on editor init, which is what
//     keeps 'ALL' from being round-tripped into the per-type list.
//
// The confirm dialog moves from `shared/ConfirmDialog` to the ds one, which is
// prop-compatible with one deliberate difference: **Enter confirms only when
// `danger` is false**. Both confirms here are `danger: true`, so a stray Enter
// can no longer permanently delete a policy. That is the reason the ds version
// exists.
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle → Chip tone. Same three states legacy coloured by hand. */
const STATUS_TONES = {
  published: 'brand',
  draft: 'neutral',
  archived: 'danger',
};

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** Label above a control, the shape both dialogs repeat. */
function FieldLabel({ htmlFor, children, hint }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block', font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 6 }}>
      {children}
      {hint && <span style={{ color: 'var(--fg-4)' }}> {hint}</span>}
    </label>
  );
}

/** Checkbox + label, matching the accent the rest of the app uses. */
function CheckRow({ checked, onChange, children, style }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', ...style }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: 'var(--brand)' }} />
      {children}
    </label>
  );
}

export default function SettingsPoliciesV2() {
  const { orgSlug, isOrgAdmin } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [meta, setMeta] = useState({ categories: [], audiences: [] });
  const [editor, setEditor] = useState(null);   // policy object or {} for new
  const [report, setReport] = useState(null);    // { policy, report, total, acknowledged }
  const [confirm, setConfirm] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const companyId = currentCompany?._id;

  const load = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const [list, m] = await Promise.all([
        api.request(`/api/org/${orgSlug}/policies/admin${showArchived ? '?includeArchived=true' : ''}`),
        api.request(`/api/org/${orgSlug}/policies/audiences`),
      ]);
      setPolicies(list.policies || []);
      setMeta({ categories: m.categories || [], audiences: m.audiences || [] });
    } catch {
      showToast('Failed to load policies', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast, showArchived]);

  // Reload when the active company or archived filter changes.
  useEffect(() => { load(); }, [load, companyId]);

  const openReport = async (p) => {
    try {
      const res = await api.request(`/api/org/${orgSlug}/policies/${p._id}/acknowledgments`);
      setReport(res);
    } catch {
      showToast('Failed to load report', 'error');
    }
  };

  const archivePolicy = (p) => {
    setConfirm({
      title: 'Archive policy',
      message: `Archive "${p.title}"? Employees will no longer see it. This does not delete acknowledgment records.`,
      confirmLabel: 'Archive',
      danger: true,
      action: async () => {
        await api.request(`/api/org/${orgSlug}/policies/${p._id}`, { method: 'DELETE' });
        showToast('Policy archived');
        await load();
      },
    });
  };

  const deletePolicy = (p) => {
    setConfirm({
      title: 'Delete policy permanently',
      message: `Permanently delete "${p.title}"? This removes the document file and ALL acknowledgment records. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      action: async () => {
        await api.request(`/api/org/${orgSlug}/policies/${p._id}/permanent`, { method: 'DELETE' });
        showToast('Policy deleted');
        await load();
      },
    });
  };

  if (!isOrgAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage company policies." />
      </Panel>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 'var(--r-2)', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--brand-soft)', color: 'var(--brand-ink)',
          }}>
            <ShieldCheck size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>Company Policies</h2>
            <p style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
              {currentCompany?.name ? `For ${currentCompany.name}` : 'Active company'} · employees see these in ESS
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckRow checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}>
            Show archived
          </CheckRow>
          <Button size="sm" onClick={() => setEditor({})} iconLeft={<Plus size={15} />}>Add Policy</Button>
        </div>
      </div>

      {loading ? (
        <PageSpinner label="Loading policies…" />
      ) : policies.length === 0 ? (
        <Panel>
          <EmptyState icon={<FileText size={22} />} title="No policies yet">
            Upload your first policy document for this company.
          </EmptyState>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {policies.map((p) => (
            <Panel key={p._id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 4 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 'var(--r-1)', flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: 'var(--surface-2)', color: 'var(--danger)',
                }}>
                  <FileText size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{
                      font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{p.title}</span>
                    <Chip tone={STATUS_TONES[p.status] || 'neutral'}>{p.status}</Chip>
                    <Chip tone="neutral">{p.category}</Chip>
                    {p.acknowledgmentRequired && <Chip tone="warn">Ack required</Chip>}
                  </div>
                  <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 0' }}>
                    {p.fileName} {p.size ? `· ${formatBytes(p.size)}` : ''} · v{p.version}
                    {' · '}
                    {(!p.appliesTo || p.appliesTo.length === 0 || p.appliesTo.includes('ALL'))
                      ? 'All employees'
                      : `${p.appliesTo.length} employee type${p.appliesTo.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {p.acknowledgmentRequired && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => openReport(p)}
                      title="Acknowledgment report"
                      aria-label={`Acknowledgment report for ${p.title}`}
                      iconLeft={<BarChart3 size={15} />}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.acknowledgedCount || 0}</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditor(p)} title="Edit"
                    aria-label={`Edit ${p.title}`} iconLeft={<Pencil size={15} />} />
                  {p.status !== 'archived' && (
                    <Button variant="ghost" size="sm" onClick={() => archivePolicy(p)}
                      title="Archive (hide from employees)"
                      aria-label={`Archive ${p.title}`} iconLeft={<Archive size={15} />} />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deletePolicy(p)}
                    title="Delete permanently"
                    aria-label={`Delete ${p.title} permanently`} iconLeft={<Trash2 size={15} />} />
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {editor && (
        <PolicyEditor
          orgSlug={orgSlug}
          policy={editor._id ? editor : null}
          categories={meta.categories}
          audiences={meta.audiences}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await load(); }}
          showToast={showToast}
        />
      )}

      {report && <AckReportPanel report={report} onClose={() => setReport(null)} />}

      <ConfirmDialog
        open={!!confirm}
        {...(confirm || {})}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.action(); setConfirm(null); }}
      />
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────────────
function PolicyEditor({ orgSlug, policy, categories, audiences, onClose, onSaved, showToast }) {
  const isEdit = !!policy;
  const [title, setTitle] = useState(policy?.title || '');
  const [category, setCategory] = useState(policy?.category || 'HR');
  const [description, setDescription] = useState(policy?.description || '');
  const [appliesAll, setAppliesAll] = useState(
    !policy || !policy.appliesTo || policy.appliesTo.length === 0 || policy.appliesTo.includes('ALL'),
  );
  const [appliesTo, setAppliesTo] = useState(
    policy?.appliesTo?.filter((k) => k !== 'ALL') || [],
  );
  const [ackRequired, setAckRequired] = useState(!!policy?.acknowledgmentRequired);
  const [status, setStatus] = useState(policy?.status || 'published');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const toggleAudience = (key) => {
    setAppliesTo((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return showToast('Title is required', 'error');
    if (!isEdit && !file) return showToast('Please choose a file', 'error');
    // Guard the silent footgun: unchecking "All employees" and selecting no
    // type would otherwise send appliesTo:[] which the backend treats as
    // everyone — the opposite of intent. Force an explicit choice.
    if (!appliesAll && appliesTo.length === 0) {
      return showToast('Select at least one employee type, or choose "All employees"', 'error');
    }
    const finalAppliesTo = appliesAll ? ['ALL'] : appliesTo;
    setSaving(true);
    try {
      if (isEdit) {
        await api.request(`/api/org/${orgSlug}/policies/${policy._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: title.trim(), category, description,
            appliesTo: finalAppliesTo, acknowledgmentRequired: ackRequired, status,
          }),
        });
        if (file) {
          const fd = new FormData();
          fd.append('file', file);
          await api.uploadFile(`/api/org/${orgSlug}/policies/${policy._id}/file`, fd);
        }
        showToast('Policy updated');
      } else {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title.trim());
        fd.append('category', category);
        fd.append('description', description);
        fd.append('appliesTo', JSON.stringify(finalAppliesTo));
        fd.append('acknowledgmentRequired', ackRequired ? 'true' : 'false');
        fd.append('status', status);
        await api.uploadFile(`/api/org/${orgSlug}/policies`, fd);
        showToast('Policy created');
      }
      await onSaved();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit Policy' : 'Add Policy'}
      footer={(
        <>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            {isEdit ? 'Save changes' : 'Create policy'}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <FieldLabel htmlFor="pol-title">Title</FieldLabel>
          <Input id="pol-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Code of Conduct" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <FieldLabel htmlFor="pol-category">Category</FieldLabel>
            <Select id="pol-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="pol-status">Status</FieldLabel>
            <Select id="pol-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              {isEdit && <option value="archived">Archived</option>}
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="pol-desc" hint="(optional)">Description</FieldLabel>
          <Textarea id="pol-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Short summary shown to employees" style={{ resize: 'none' }} />
        </div>

        <div>
          <FieldLabel hint="(PDF, DOCX, max 10MB)">{isEdit ? 'Replace file' : 'Policy file'}</FieldLabel>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer',
            borderRadius: 'var(--r-2)', border: '1px dashed var(--line-2)',
            font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
          }}>
            <Upload size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file ? file.name : (isEdit ? 'Keep current file (choose to replace)' : 'Choose a file')}
            </span>
            <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} /> Applies to</span>
          </FieldLabel>
          <CheckRow checked={appliesAll} onChange={(e) => setAppliesAll(e.target.checked)} style={{ marginBottom: 8 }}>
            All employees
          </CheckRow>
          {!appliesAll && (
            <div style={{ display: 'grid', gap: 6, paddingLeft: 4 }}>
              {audiences.map((a) => (
                <CheckRow key={a.key} checked={appliesTo.includes(a.key)} onChange={() => toggleAudience(a.key)}>
                  {a.label}
                </CheckRow>
              ))}
            </div>
          )}
        </div>

        <CheckRow checked={ackRequired} onChange={(e) => setAckRequired(e.target.checked)}>
          Require employees to acknowledge this policy
        </CheckRow>
      </div>
    </Modal>
  );
}

// ── Acknowledgment report panel ──────────────────────────────────────────────
function AckReportPanel({ report, onClose }) {
  const { policy, report: rows = [], total = 0, acknowledged = 0 } = report;
  const th = { padding: '8px 12px', font: "500 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' };
  return (
    <Modal open onClose={onClose} size="lg" title={policy?.title}
      sub={`${acknowledged} of ${total} acknowledged (current version)`}>
      {rows.length === 0 ? (
        <EmptyState compact title="No employees currently targeted by this policy." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Employee</th>
                <th style={{ ...th, textAlign: 'left' }}>Type</th>
                <th style={{ ...th, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <p style={{ font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{r.fullName}</p>
                    <p style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '2px 0 0' }}>{r.email}</p>
                  </td>
                  <td style={{ padding: '8px 12px', font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{r.audience}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {r.acknowledged ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--acc-emerald)' }}>
                        <CheckCircle2 size={13} />
                        {r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleDateString() : 'Yes'}
                      </span>
                    ) : (
                      <span style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)' }}>Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
