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
  Users, CheckCircle2, X, Loader2, BarChart3, Trash2,
} from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../utils/api';
import ConfirmDialog from '../shared/ConfirmDialog';

const STATUS_BADGE = {
  published: 'bg-emerald-500/15 text-emerald-300',
  draft: 'bg-dark-700 text-dark-300',
  archived: 'bg-red-500/15 text-red-300',
};

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function SettingsPolicies() {
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
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage company policies.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rivvra-500/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-rivvra-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Company Policies</h2>
            <p className="text-dark-400 text-sm">
              {currentCompany?.name ? `For ${currentCompany.name}` : 'Active company'} · employees see these in ESS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-rivvra-500"
            />
            Show archived
          </label>
          <button
            onClick={() => setEditor({})}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Policy
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
        </div>
      ) : policies.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 font-medium">No policies yet</p>
          <p className="text-dark-500 text-sm mt-1">Upload your first policy document for this company.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {policies.map((p) => (
            <div key={p._id} className="card p-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4.5 h-4.5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-medium truncate">{p.title}</p>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-dark-700 text-dark-300">{p.category}</span>
                  {p.acknowledgmentRequired && (
                    <span className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300">Ack required</span>
                  )}
                </div>
                <p className="text-dark-500 text-xs mt-1.5">
                  {p.fileName} {p.size ? `· ${formatBytes(p.size)}` : ''} · v{p.version}
                  {' · '}
                  {(!p.appliesTo || p.appliesTo.length === 0 || p.appliesTo.includes('ALL'))
                    ? 'All employees'
                    : `${p.appliesTo.length} employee type${p.appliesTo.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.acknowledgmentRequired && (
                  <button
                    onClick={() => openReport(p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-700"
                    title="Acknowledgment report"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span className="text-xs tabular-nums">{p.acknowledgedCount || 0}</span>
                  </button>
                )}
                <button
                  onClick={() => setEditor(p)}
                  className="p-1.5 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {p.status !== 'archived' && (
                  <button
                    onClick={() => archivePolicy(p)}
                    className="p-1.5 rounded-lg text-dark-400 hover:text-amber-300 hover:bg-amber-500/10"
                    title="Archive (hide from employees)"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => deletePolicy(p)}
                  className="p-1.5 rounded-lg text-dark-400 hover:text-red-300 hover:bg-red-500/10"
                  title="Delete permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700/50 sticky top-0 bg-dark-800">
          <h3 className="text-white font-semibold">{isEdit ? 'Edit Policy' : 'Add Policy'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full" placeholder="e.g. Code of Conduct" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input w-full">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-full">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                {isEdit && <option value="archived">Archived</option>}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Description <span className="text-dark-500">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input w-full resize-none" placeholder="Short summary shown to employees" />
          </div>

          <div>
            <label className="block text-sm text-dark-300 mb-1.5">
              {isEdit ? 'Replace file' : 'Policy file'} <span className="text-dark-500">(PDF, DOCX, max 10MB)</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-dark-600 cursor-pointer hover:border-dark-500 text-sm text-dark-300">
              <Upload className="w-4 h-4" />
              <span className="truncate">{file ? file.name : (isEdit ? 'Keep current file (choose to replace)' : 'Choose a file')}</span>
              <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div>
            <label className="block text-sm text-dark-300 mb-2 flex items-center gap-1.5"><Users className="w-4 h-4" /> Applies to</label>
            <label className="flex items-center gap-2 text-sm text-dark-200 mb-2 cursor-pointer">
              <input type="checkbox" checked={appliesAll} onChange={(e) => setAppliesAll(e.target.checked)} className="accent-rivvra-500" />
              All employees
            </label>
            {!appliesAll && (
              <div className="grid grid-cols-1 gap-1.5 pl-1">
                {audiences.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                    <input type="checkbox" checked={appliesTo.includes(a.key)} onChange={() => toggleAudience(a.key)} className="accent-rivvra-500" />
                    {a.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
            <input type="checkbox" checked={ackRequired} onChange={(e) => setAckRequired(e.target.checked)} className="accent-rivvra-500" />
            Require employees to acknowledge this policy
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-dark-700/50 sticky bottom-0 bg-dark-800">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-700">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Acknowledgment report panel ──────────────────────────────────────────────
function AckReportPanel({ report, onClose }) {
  const { policy, report: rows = [], total = 0, acknowledged = 0 } = report;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700/50">
          <div>
            <h3 className="text-white font-semibold">{policy?.title}</h3>
            <p className="text-dark-400 text-sm">{acknowledged} of {total} acknowledged (current version)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <p className="text-dark-500 text-sm text-center py-8">No employees currently targeted by this policy.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-3 py-2">Employee</th>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-dark-700/40">
                    <td className="px-3 py-2">
                      <p className="text-white">{r.fullName}</p>
                      <p className="text-dark-500 text-xs">{r.email}</p>
                    </td>
                    <td className="px-3 py-2 text-dark-300 text-xs">{r.audience}</td>
                    <td className="px-3 py-2 text-right">
                      {r.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleDateString() : 'Yes'}
                        </span>
                      ) : (
                        <span className="text-amber-300 text-xs">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
