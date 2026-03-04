import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import { API_BASE_URL } from '../../utils/config';
import * as pdfjsLib from 'pdfjs-dist';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, FileText, XCircle, Bell,
  Download, User, Calendar, Clock, Send,
  Mail, CheckCircle2, X, ExternalLink,
  Eye, Link as LinkIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/* ── Status badge helper ──────────────────────────────────────────────── */
const STATUS_STYLES = {
  sent:      'bg-blue-500/10 text-blue-400',
  signed:    'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-400',
  expired:   'bg-orange-500/10 text-orange-400',
  draft:     'bg-dark-700 text-dark-400',
  refused:   'bg-red-500/10 text-red-400',
  pending:   'bg-amber-500/10 text-amber-400',
  waiting:   'bg-amber-500/10 text-amber-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
};

function StatusBadge({ status, size = 'sm' }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  const sizeClass = size === 'lg'
    ? 'px-3 py-1 text-sm'
    : 'px-2 py-0.5 text-xs';
  return (
    <span className={`rounded-full font-medium ${cls} ${sizeClass}`}>
      {label}
    </span>
  );
}

/* ── Inline PDF Viewer ────────────────────────────────────────────────── */
function InlinePdfViewer({ fetchUrl, token }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const containerRef = useRef(null);

  // Load PDF from authenticated proxy endpoint
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPdfDoc(null);
    setCurrentPage(1);

    async function load() {
      try {
        const resp = await fetch(fetchUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error('Failed to fetch PDF');
        const arrayBuffer = await resp.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fetchUrl, token]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    setRendering(true);

    async function renderPage() {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        // Fit to container width
        const containerWidth = containerRef.current?.clientWidth || 400;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = (containerWidth - 16) / unscaledViewport.width; // 16px for padding
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error('Failed to render PDF page:', err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
        <span className="ml-2 text-dark-400 text-sm">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <FileText className="w-10 h-10 text-dark-500 mb-3" />
        <p className="text-dark-400 text-sm text-center">Failed to load PDF</p>
        <p className="text-dark-500 text-xs text-center mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col">
      {/* Page navigation */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 border-b border-dark-700 bg-dark-900/50">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded text-dark-400 hover:text-white hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-dark-300 text-xs font-medium">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded text-dark-400 hover:text-white hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {/* Canvas */}
      <div className="overflow-auto max-h-[500px] p-2 bg-dark-950 relative">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-950/60 z-10">
            <Loader2 className="w-5 h-5 animate-spin text-dark-400" />
          </div>
        )}
        <canvas ref={canvasRef} className="mx-auto rounded" style={{ maxWidth: '100%' }} />
      </div>
    </div>
  );
}

/* ── Info Row helper ──────────────────────────────────────────────────── */
function InfoRow({ icon: Icon, label, value, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon size={16} className="text-dark-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-dark-500 uppercase tracking-wide">{label}</p>
        {children || <p className="text-dark-200 text-sm mt-0.5">{value || '\u2014'}</p>}
      </div>
    </div>
  );
}

/* ── Main SignRequestDetail Component ─────────────────────────────────── */
export default function SignRequestDetail() {
  const { requestId } = useParams();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  usePageTitle(request?.reference || request?.name);
  const [template, setTemplate] = useState(null);
  const [values, setValues] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindingSigner, setRemindingSigner] = useState(null);
  const [docTab, setDocTab] = useState('signed'); // 'signed' | 'certificate'

  const fetchRequest = useCallback(async () => {
    if (!orgSlug || !requestId) return;
    setLoading(true);
    try {
      const res = await signApi.getRequest(orgSlug, requestId);
      if (res.success !== false) {
        setRequest(res.request || res);
        setTemplate(res.template || null);
        setValues(res.values || []);
      } else {
        showToast('Failed to load request details', 'error');
      }
    } catch {
      showToast('Failed to load request details', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, requestId, showToast]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this signature request? This action cannot be undone.')) return;
    try {
      setCancelling(true);
      const res = await signApi.cancelRequest(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Request cancelled');
        fetchRequest();
      } else {
        showToast(res.message || 'Failed to cancel', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to cancel request', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleRemind = async () => {
    try {
      setReminding(true);
      const res = await signApi.remindSigners(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Reminder sent to pending signers');
      } else {
        showToast(res.message || 'Failed to send reminder', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send reminder', 'error');
    } finally {
      setReminding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="w-12 h-12 text-dark-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Request not found</h3>
          <p className="text-dark-400 text-sm">
            This signature request may have been deleted or you do not have access.
          </p>
        </div>
      </div>
    );
  }

  const signers = request.signers || [];
  const totalSigners = signers.length;
  const signedCount = signers.filter((s) => s.state === 'completed').length;
  const pdfUrl = request.pdfUrl || template?.pdfUrl || null;

  // Helper: fetch PDF via proxy and open in new tab (Cloudinary strict ACL blocks direct access)
  // Opens window immediately to avoid popup blocker, then navigates to blob URL after fetch
  const openProxyPdf = async (type) => {
    const newTab = window.open('about:blank', '_blank');
    try {
      const endpoint = type === 'certificate' ? 'certificate' : 'signed-pdf';
      const token = localStorage.getItem('rivvra_token');
      const resp = await fetch(`${API_BASE_URL}/api/org/${orgSlug}/sign/requests/${requestId}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Failed to fetch');
      const blob = await resp.blob();
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      if (newTab) newTab.close();
      showToast(`Failed to open ${type === 'certificate' ? 'certificate' : 'signed PDF'}`, 'error');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <FileText size={24} className="text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">
                {request.reference || request.name || 'Untitled Request'}
              </h1>
              <StatusBadge status={request.state} size="lg" />
            </div>
            <p className="text-dark-400 text-sm mt-1">
              {template?.name || request.templateName || 'Unknown template'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {request.state === 'sent' && (
            <>
              <button
                onClick={handleRemind}
                disabled={reminding}
                className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 text-dark-200 border border-dark-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
              >
                {reminding ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Bell size={14} />
                )}
                Remind All
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
              >
                {cancelling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                Cancel Request
              </button>
            </>
          )}
          {/* Signed PDF + Certificate downloads (when completed) */}
          {request.state === 'signed' && request.signedPdfUrl && (
            <button
              onClick={() => openProxyPdf('signed')}
              className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <Download size={14} />
              Signed PDF
            </button>
          )}
          {request.state === 'signed' && request.certificateUrl && (
            <button
              onClick={() => openProxyPdf('certificate')}
              className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <Download size={14} />
              Certificate
            </button>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 text-dark-200 border border-dark-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <Download size={14} />
              Original PDF
            </a>
          )}
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info + Signers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info Section */}
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-dark-800 sm:divide-y-0">
              <div className="space-y-0 divide-y divide-dark-800">
                <InfoRow icon={FileText} label="Template" value={template?.name || request.templateName} />
                <InfoRow icon={User} label="Created By" value={request.createdByName || request.createdBy?.name} />
                <InfoRow icon={Calendar} label="Created" value={formatDate(request.createdAt)} />
              </div>
              <div className="space-y-0 divide-y divide-dark-800">
                <InfoRow icon={Send} label="Sent Date" value={formatDate(request.sentAt || request.createdAt)} />
                <InfoRow
                  icon={CheckCircle2}
                  label="Completed"
                  value={request.state === 'signed' ? formatDate(request.completedAt || request.updatedAt) : '\u2014'}
                />
                <InfoRow icon={Clock} label="Valid Until" value={request.validityDate ? formatDateShort(request.validityDate) : 'No expiry'} />
              </div>
            </div>
          </div>

          {/* Linked ATS Application */}
          {request.linkedApplicationId && (
            <div className="card p-5">
              <h2 className="text-lg font-semibold text-white mb-3">Linked Application</h2>
              <Link
                to={orgPath(`/ats/applications/${request.linkedApplicationId}`)}
                className="flex items-center gap-3 p-3 bg-dark-900 rounded-lg border border-dark-700 hover:border-indigo-500/30 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                  <LinkIcon size={14} className="text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium group-hover:text-indigo-400 transition-colors">
                    View Linked ATS Application
                  </p>
                  <p className="text-dark-500 text-xs truncate">
                    ID: {request.linkedApplicationId}
                  </p>
                </div>
                <ExternalLink size={14} className="text-dark-500 group-hover:text-indigo-400 transition-colors" />
              </Link>
            </div>
          )}

          {/* Signers Table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Signers
                <span className="text-dark-500 text-sm font-normal ml-2">
                  {signedCount}/{totalSigners} completed
                </span>
              </h2>
              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="w-24 bg-dark-700 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: totalSigners > 0 ? `${(signedCount / totalSigners) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </div>

            {signers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <User className="w-10 h-10 text-dark-500 mb-3" />
                <p className="text-dark-400 text-sm">No signers assigned</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-center px-2 py-3 text-dark-400 font-medium w-10">#</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium">Signer</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Email</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Role</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Signed Date</th>
                      <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signers.map((signer, idx) => (
                      <tr key={signer._id || idx} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                        <td className="px-2 py-3 text-center">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold inline-flex items-center justify-center">
                            {signer.order || idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-indigo-400 text-xs font-semibold">
                                {(signer.name || '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <span className="text-white font-medium truncate max-w-[140px]">
                              {signer.name || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-300 hidden sm:table-cell">
                          <span className="truncate block max-w-[180px]">
                            {signer.email || '\u2014'}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {signer.roleName ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-dark-700 text-dark-400">
                              {signer.roleName}
                            </span>
                          ) : (
                            <span className="text-dark-500">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={signer.state || 'pending'} />
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-xs hidden lg:table-cell">
                          {signer.signingDate ? formatDate(signer.signingDate) : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {request.state === 'sent' && signer.state !== 'completed' && (
                            <button
                              onClick={async () => {
                                try {
                                  setRemindingSigner(signer._id || idx);
                                  const res = await signApi.remindSigners(orgSlug, requestId);
                                  if (res.success !== false) {
                                    showToast(`Reminder sent to ${signer.name}`);
                                  } else {
                                    showToast(res.message || 'Failed to send reminder', 'error');
                                  }
                                } catch (err) {
                                  showToast(err.message || 'Failed', 'error');
                                } finally {
                                  setRemindingSigner(null);
                                }
                              }}
                              disabled={remindingSigner === (signer._id || idx)}
                              className="text-dark-400 hover:text-blue-400 transition-colors p-1.5 rounded hover:bg-dark-700 disabled:opacity-30"
                              title={`Remind ${signer.name}`}
                            >
                              {remindingSigner === (signer._id || idx) ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Bell size={14} />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Signed Values */}
          {request.state === 'signed' && values.length > 0 && (
            <div className="card p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Signed Values</h2>
              <div className="space-y-3">
                {values.map((val, idx) => (
                  <div
                    key={val._id || idx}
                    className="bg-dark-900 rounded-lg p-4 border border-dark-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-dark-500 uppercase tracking-wide">
                        {val.signerName || `Signer ${idx + 1}`}
                        {val.role ? ` (${val.role})` : ''}
                      </span>
                      <span className="text-xs text-dark-500">
                        {val.signedAt ? formatDate(val.signedAt) : ''}
                      </span>
                    </div>
                    {val.fields && Object.keys(val.fields).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        {Object.entries(val.fields).map(([key, fieldVal]) => (
                          <div key={key}>
                            <p className="text-xs text-dark-500 mb-0.5">{key}</p>
                            <p className="text-dark-200 text-sm">
                              {typeof fieldVal === 'string' && fieldVal.startsWith('data:image') ? (
                                <img src={fieldVal} alt={key} className="h-12 rounded border border-dark-700" />
                              ) : (
                                String(fieldVal || '\u2014')
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-dark-500 text-sm">No field values recorded</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: PDF Preview */}
        <div className="space-y-6">
          <div className="card overflow-hidden">
            {/* Tabs for signed requests */}
            {request.state === 'signed' && (request.signedPdfUrl || request.certificateUrl) ? (
              <>
                <div className="flex border-b border-dark-700">
                  {request.signedPdfUrl && (
                    <button
                      onClick={() => setDocTab('signed')}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                        docTab === 'signed'
                          ? 'text-indigo-400 border-b-2 border-indigo-500 bg-dark-800/50'
                          : 'text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      Signed PDF
                    </button>
                  )}
                  {request.certificateUrl && (
                    <button
                      onClick={() => setDocTab('certificate')}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                        docTab === 'certificate'
                          ? 'text-indigo-400 border-b-2 border-indigo-500 bg-dark-800/50'
                          : 'text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      Certificate
                    </button>
                  )}
                  <button
                    onClick={() => openProxyPdf(docTab === 'certificate' ? 'certificate' : 'signed')}
                    className="px-3 py-3 text-dark-400 hover:text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
                <InlinePdfViewer
                  key={docTab}
                  fetchUrl={`${API_BASE_URL}/api/org/${orgSlug}/sign/requests/${requestId}/${docTab === 'certificate' ? 'certificate' : 'signed-pdf'}`}
                  token={localStorage.getItem('rivvra_token')}
                />
              </>
            ) : pdfUrl ? (
              <>
                <div className="px-5 py-4 border-b border-dark-700">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Eye size={16} className="text-dark-400" />
                    Document Preview
                  </h2>
                </div>
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                    <FileText size={32} className="text-emerald-400" />
                  </div>
                  <p className="text-white font-medium text-sm mb-1">Document available</p>
                  <p className="text-dark-500 text-xs text-center mb-5">
                    Open the PDF in a new tab to view the full document
                  </p>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                  >
                    <ExternalLink size={14} />
                    Open Document
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-dark-700">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Eye size={16} className="text-dark-400" />
                    Document Preview
                  </h2>
                </div>
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="w-10 h-10 text-dark-500 mb-3" />
                  <p className="text-dark-400 text-sm text-center">
                    PDF preview not available
                  </p>
                  <p className="text-dark-500 text-xs text-center mt-1">
                    The document will be available after the template is processed.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Quick info card */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-dark-400 uppercase tracking-wide">Summary</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-dark-400 text-sm">Status</span>
                <StatusBadge status={request.state} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400 text-sm">Signers</span>
                <span className="text-white text-sm font-medium">{signedCount}/{totalSigners}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400 text-sm">Template</span>
                <span className="text-dark-300 text-sm truncate max-w-[120px]">
                  {template?.name || '\u2014'}
                </span>
              </div>
              {request.subject && (
                <div className="flex items-center justify-between">
                  <span className="text-dark-400 text-sm">Subject</span>
                  <span className="text-dark-300 text-sm truncate max-w-[120px]">{request.subject}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
