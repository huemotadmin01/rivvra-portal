// ============================================================================
// MyDocuments.jsx — ESS: official documents HR has shared with the employee
// ============================================================================
// Reachable from the TopBar user menu by ANY authenticated member (no app /
// country gate), mirroring MyPolicies. Lists the caller's release documents
// (Form-16, offer/experience/appraisal letters, …) in the active company,
// grouped by type, with download (downloads are tracked server-side).
// Fully-archived ex-employees use the separate /document-vault page instead.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { FolderDown, FileText, Loader2, Download, Eye, Archive } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Display order for the document-type groups.
const TYPE_ORDER = [
  'offer_letter', 'appointment_letter', 'confirmation_letter',
  'appraisal_letter', 'increment_letter',
  'form16', 'experience_letter', 'relieving_letter', 'fnf_statement', 'other',
];

export default function MyDocuments() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await employeeApi.listMyReleaseDocs(orgSlug);
      setDocuments(res.documents || []);
      setLinked(res.linked !== false);
    } catch {
      showToast('Failed to load your documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { load(); }, [load]);

  const download = useCallback(async (doc) => {
    setBusyId(doc._id);
    try {
      await employeeApi.saveAuthedFile(
        employeeApi.myReleaseDocUrl(orgSlug, doc._id, true),
        doc.fileName || `${doc.docTypeLabel}.pdf`,
      );
      load(); // refresh so the "Downloaded" tick appears
    } catch (err) {
      showToast(err.message || 'Download failed', 'error');
    } finally {
      setBusyId(null);
    }
  }, [orgSlug, showToast, load]);

  const preview = useCallback(async (doc) => {
    setBusyId(doc._id);
    try {
      const blob = await employeeApi.fetchAuthedFile(employeeApi.myReleaseDocUrl(orgSlug, doc._id, false));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      load();
    } catch (err) {
      showToast(err.message || 'Could not open the document', 'error');
    } finally {
      setBusyId(null);
    }
  }, [orgSlug, showToast, load]);

  // Group by docType in a stable display order.
  const grouped = TYPE_ORDER
    .map((t) => ({ type: t, items: documents.filter((d) => d.docType === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rivvra-500/15 flex items-center justify-center">
          <FolderDown className="w-5 h-5 text-rivvra-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">My Documents</h1>
          <p className="text-dark-400 text-sm mt-0.5">Documents your employer has shared with you</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-dark-500" />
        </div>
      ) : !linked ? (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 font-medium">No employee profile found</p>
          <p className="text-dark-500 text-sm mt-1">
            Documents are shown to linked employees. Contact your administrator if you believe this is an error.
          </p>
        </div>
      ) : documents.length === 0 ? (
        <div className="card p-8 text-center">
          <Archive className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-300 font-medium">No documents yet</p>
          <p className="text-dark-500 text-sm mt-1">When HR shares a document with you, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2.5">
                {items[0].docTypeLabel}
              </h2>
              <div className="space-y-2.5">
                {items.map((d) => (
                  <div
                    key={d._id}
                    className="card p-4 flex items-center gap-4"
                  >
                    <div className="w-9 h-9 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-medium truncate">
                          {d.label || d.docTypeLabel}
                        </p>
                        {d.period && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-dark-700 text-dark-300">{d.period}</span>
                        )}
                      </div>
                      <p className="text-dark-500 text-xs mt-1.5">
                        {d.fileName} {d.size ? `· ${formatBytes(d.size)}` : ''}
                        {d.uploadedAt ? ` · Shared ${new Date(d.uploadedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => preview(d)}
                        disabled={busyId === d._id}
                        title="Preview"
                        className="p-2 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-50"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => download(d)}
                        disabled={busyId === d._id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rivvra-500/15 text-rivvra-300 hover:bg-rivvra-500/25 transition-colors disabled:opacity-50"
                      >
                        {busyId === d._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
