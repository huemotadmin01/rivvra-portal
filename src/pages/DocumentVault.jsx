// ============================================================================
// DocumentVault.jsx — permanent, identity-scoped document access
// ============================================================================
// A top-level page (NOT org-scoped) that lists every release document shared
// with the signed-in person across all workspaces — including ones where they
// are a fully-archived ex-employee and normal app access has ended. Backed by
// GET /api/me/document-vault (auth only; per-doc identity match). This is how
// ex-employees pull their Form-16 / experience / relieving letters forever.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Vault, FileText, Loader2, Download, Building2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import employeeApi from '../utils/employeeApi';

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentVault() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeeApi.listDocumentVault();
      setWorkspaces(res.workspaces || []);
    } catch {
      showToast('Failed to load your documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const download = useCallback(async (d) => {
    setBusyId(d._id);
    try {
      await employeeApi.saveAuthedFile(
        employeeApi.vaultDocUrl(d._id, true),
        d.fileName || `${d.docTypeLabel}.pdf`,
      );
      load();
    } catch (err) {
      showToast(err.message || 'Download failed', 'error');
    } finally {
      setBusyId(null);
    }
  }, [showToast, load]);

  const totalDocs = workspaces.reduce((n, w) => n + (w.documents?.length || 0), 0);

  return (
    <div className="min-h-screen bg-dark-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-7 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rivvra-500/15 flex items-center justify-center">
            <Vault className="w-5.5 h-5.5 text-rivvra-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Document Vault</h1>
            <p className="text-dark-400 text-sm mt-0.5">Your official documents from every employer on Rivvra</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-dark-500" />
          </div>
        ) : totalDocs === 0 ? (
          <div className="card p-8 text-center">
            <Vault className="w-10 h-10 text-dark-600 mx-auto mb-3" />
            <p className="text-dark-300 font-medium">No documents found</p>
            <p className="text-dark-500 text-sm mt-1">
              There are no documents shared with this account. They appear here once an employer publishes them.
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {workspaces.map((w) => (
              <div key={w.orgId}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Building2 className="w-4 h-4 text-dark-500" />
                  <h2 className="text-sm font-semibold text-dark-200">{w.orgName}</h2>
                </div>
                <div className="space-y-2.5">
                  {w.documents.map((d) => (
                    <div key={d._id} className="card p-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-medium truncate">{d.label || d.docTypeLabel}</p>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-dark-700 text-dark-300">{d.docTypeLabel}</span>
                          {d.period && <span className="px-2 py-0.5 rounded text-xs font-medium bg-dark-700 text-dark-300">{d.period}</span>}
                        </div>
                        <p className="text-dark-500 text-xs mt-1.5">
                          {d.companyName ? `${d.companyName} · ` : ''}{d.fileName} {d.size ? `· ${formatBytes(d.size)}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => download(d)}
                        disabled={busyId === d._id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rivvra-500/15 text-rivvra-300 hover:bg-rivvra-500/25 transition-colors disabled:opacity-50"
                      >
                        {busyId === d._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
