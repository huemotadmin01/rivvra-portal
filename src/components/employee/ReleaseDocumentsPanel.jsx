// ============================================================================
// ReleaseDocumentsPanel.jsx — admin: documents HR shares with an employee
// ============================================================================
// Rendered on the employee profile (admins only). HR uploads official docs
// (Form-16, offer/experience/appraisal letters, …) for this employee; the
// employee is emailed and can download them in ESS → My Documents (or, after
// they leave, the Document Vault). Shows per-doc distribution status.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { FolderUp, FileText, Loader2, Upload, Trash2, Download, CheckCircle2, Eye, Send } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';

const DISTRIBUTION_BADGE = {
  downloaded: { label: 'Downloaded', cls: 'bg-emerald-500/15 text-emerald-300', icon: CheckCircle2 },
  viewed: { label: 'Viewed', cls: 'bg-blue-500/15 text-blue-300', icon: Eye },
  sent: { label: 'Sent', cls: 'bg-dark-700 text-dark-300', icon: Send },
};

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function ReleaseDocumentsPanel({ orgSlug, employeeId, showToast }) {
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ docType: 'offer_letter', label: '', period: '', notify: true, file: null });

  const load = useCallback(async () => {
    if (!orgSlug || !employeeId) return;
    setLoading(true);
    try {
      const [typeRes, docRes] = await Promise.all([
        employeeApi.listReleaseDocTypes(orgSlug).catch(() => ({ types: [] })),
        employeeApi.listEmployeeReleaseDocs(orgSlug, employeeId),
      ]);
      setTypes(typeRes.types || []);
      setDocs(docRes.documents || []);
    } catch {
      showToast?.('Failed to load shared documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, employeeId, showToast]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.file) { showToast?.('Choose a file first', 'error'); return; }
    if (form.docType === 'other' && !form.label.trim()) { showToast?.('A label is required for "Other"', 'error'); return; }
    setUploading(true);
    try {
      await employeeApi.uploadReleaseDoc(orgSlug, employeeId, form.file, {
        docType: form.docType,
        label: form.label.trim(),
        period: form.period.trim(),
        notify: form.notify,
      });
      showToast?.(form.notify ? 'Document shared — employee notified' : 'Document shared');
      setShowForm(false);
      setForm({ docType: 'offer_letter', label: '', period: '', notify: true, file: null });
      load();
    } catch (err) {
      showToast?.(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const download = async (d) => {
    setBusyId(d._id);
    try {
      await employeeApi.saveAuthedFile(employeeApi.adminReleaseDocUrl(orgSlug, d._id, true), d.fileName);
    } catch (err) {
      showToast?.(err.message || 'Download failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (d) => {
    if (!confirm(`Remove "${d.label || d.docTypeLabel}" from this employee? They will no longer see it.`)) return;
    try {
      await employeeApi.archiveReleaseDoc(orgSlug, d._id);
      setDocs((prev) => prev.filter((x) => x._id !== d._id));
      showToast?.('Document removed');
    } catch (err) {
      showToast?.(err.message || 'Remove failed', 'error');
    }
  };

  return (
    <div className="mt-5 card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderUp size={16} className="text-rivvra-400" />
          <h3 className="text-white font-semibold text-sm">Documents Shared with Employee ({docs.length})</h3>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500/15 text-rivvra-300 hover:bg-rivvra-500/25 transition-colors"
          >
            <Upload size={13} /> Share a document
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5 rounded-lg border border-dark-700 bg-dark-900/50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Document type</label>
              <select
                value={form.docType}
                onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 focus:outline-none"
              >
                {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Period <span className="text-dark-600">(optional)</span></label>
              <input
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                placeholder="e.g. FY 2024-25"
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-rivvra-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-dark-400 mb-1">
              Label {form.docType === 'other' ? <span className="text-red-400">*</span> : <span className="text-dark-600">(optional)</span>}
            </label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Form-16 Part A & B"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-rivvra-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-dark-400 mb-1">File <span className="text-dark-600">(PDF, DOCX, PNG, JPEG · max 10MB)</span></label>
            <input
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-dark-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-dark-700 file:text-dark-200 hover:file:bg-dark-600"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notify}
              onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))}
              className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
            />
            Email the employee that this document is available
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setShowForm(false)} disabled={uploading} className="px-3 py-1.5 rounded-lg text-sm text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-50">Cancel</button>
            <button onClick={submit} disabled={uploading} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-rivvra-500 hover:bg-rivvra-600 text-white transition-colors disabled:opacity-50">
              {uploading && <Loader2 size={14} className="animate-spin" />} Share document
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-dark-500 text-sm py-2">
          <Loader2 size={14} className="animate-spin" /> Loading...
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-dark-600 italic">No documents shared yet.</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => {
            const badge = DISTRIBUTION_BADGE[d.distribution] || DISTRIBUTION_BADGE.sent;
            const BadgeIcon = badge.icon;
            return (
              <div key={d._id} className="flex items-center gap-3 bg-dark-900/50 rounded-lg px-4 py-2.5 group/rd">
                <FileText size={14} className="text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white truncate">{d.label || d.docTypeLabel}</span>
                    <span className="text-[10px] text-dark-500 uppercase tracking-wide">{d.docTypeLabel}</span>
                    {d.period && <span className="text-[10px] text-dark-400">· {d.period}</span>}
                  </div>
                  <span className="text-[11px] text-dark-500">{d.fileName} {d.size ? `· ${formatBytes(d.size)}` : ''}</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${badge.cls}`} title={d.firstDownloadedAt ? `Downloaded ${new Date(d.firstDownloadedAt).toLocaleString()}` : d.firstViewedAt ? `Viewed ${new Date(d.firstViewedAt).toLocaleString()}` : (d.notifiedAt ? `Notified ${new Date(d.notifiedAt).toLocaleString()}` : 'Not notified')}>
                  <BadgeIcon size={11} /> {badge.label}
                </span>
                <button onClick={() => download(d)} disabled={busyId === d._id} className="text-dark-600 hover:text-blue-400 opacity-100 sm:opacity-0 group-hover/rd:opacity-100 transition-opacity flex-shrink-0" title="Download">
                  {busyId === d._id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                </button>
                <button onClick={() => archive(d)} className="text-dark-600 hover:text-red-400 opacity-100 sm:opacity-0 group-hover/rd:opacity-100 transition-opacity flex-shrink-0" title="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
