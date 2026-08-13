import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import { API_BASE_URL } from '../../utils/config';
import * as pdfjsLib from 'pdfjs-dist';
// Bundle the pdfjs worker locally. The previous jsDelivr `.mjs` URL required
// Safari ≥16.4 module-worker support; older Safari silently fell back to a
// deadlocking fake worker and the document spinner ran forever.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  Loader2, FileText, XCircle, Bell,
  Download, User, Calendar, Clock, Send,
  Mail, CheckCircle2, X, ExternalLink,
  Eye, Link as LinkIcon, ChevronLeft, ChevronRight,
  Shield, Plus, AlertCircle, MapPin, Archive, ArchiveRestore,
} from 'lucide-react';
import { formatDateUTC, formatDateTime } from '../../utils/dateUtils';
import { useAuth } from '../../context/AuthContext';
import RecordMeta from '../../components/shared/RecordMeta';
import {
  Button, Chip, DataTable, EmptyState, Meter, PageHeader, Panel, Spinner,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/* ── Status badge helper ──────────────────────────────────────────────── */
// Same status vocabulary as the legacy map, re-expressed as ds Chip tones.
// The legacy palette had five distinct hues; ds has four semantic tones, so
// `viewed` folds into `info` alongside `sent` — the two never co-occur on one
// row (a request is either in flight or a signer has opened it).
const STATUS_TONES = {
  sent:      'info',
  signed:    'brand',
  cancelled: 'danger',
  expired:   'warn',
  draft:     'neutral',
  refused:   'danger',
  pending:   'warn',
  waiting:   'warn',
  completed: 'brand',
  viewed:    'info',
};

function StatusBadge({ status, size = 'sm' }) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return (
    <Chip
      tone={STATUS_TONES[status] || 'neutral'}
      style={size === 'lg' ? { height: 24, padding: '0 10px', fontSize: 12 } : undefined}
    >
      {label}
    </Chip>
  );
}

/* ── Timeline action config ───────────────────────────────────────────── */
// Each entry keeps its legacy meaning; only the colour source changes, from a
// fixed dark-theme hue to a token that resolves per theme. `viewed` keeps a
// distinct accent (--a-ats) because on the timeline it sits next to `created`
// and the two must stay tellable apart.
const TIMELINE_ACTION = {
  created:   { icon: Plus,         color: 'var(--info)',   label: 'Request created' },
  viewed:    { icon: Eye,          color: 'var(--a-ats)',  label: 'Document viewed' },
  signed:    { icon: CheckCircle2, color: 'var(--brand)',  label: 'Signed' },
  refused:   { icon: XCircle,      color: 'var(--danger)', label: 'Refused to sign' },
  cancelled: { icon: X,            color: 'var(--danger)', label: 'Request cancelled' },
  reminded:  { icon: Bell,         color: 'var(--warn)',   label: 'Reminder sent' },
  expired:   { icon: Clock,        color: 'var(--warn)',   label: 'Request expired' },
};

function SignTimeline({ orgSlug, requestId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await signApi.getRequestLogs(orgSlug, requestId);
        if (!cancelled && res.logs) setLogs(res.logs);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug, requestId]);

  if (loading) {
    return (
      <Panel title="Activity Timeline">
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Spinner /></div>
      </Panel>
    );
  }

  if (logs.length === 0) return null;

  const formatTimeAgo = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Panel title="Activity Timeline">
      <div style={{ position: 'relative' }}>
        {/* Vertical rail behind the markers */}
        <div style={{
          position: 'absolute', left: 13, top: 8, bottom: 8, width: 1,
          background: 'var(--line-2)',
        }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {logs.map((log, idx) => {
            const cfg = TIMELINE_ACTION[log.action] || { icon: AlertCircle, color: 'var(--fg-4)', label: log.action };
            const Icon = cfg.icon;
            return (
              <div key={log._id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
                <span style={{
                  width: 27, height: 27, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: '50%', zIndex: 1,
                  background: `color-mix(in srgb, ${cfg.color} 13%, var(--surface-1))`,
                }}>
                  <Icon size={13} style={{ color: cfg.color }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ font: `450 13px/1.35 ${FONT}`, color: 'var(--fg-2)' }}>
                    <span style={{ fontWeight: 550, color: 'var(--fg)' }}>{log.performedByName || 'System'}</span>
                    <span style={{ color: 'var(--fg-3)' }}> — {cfg.label}</span>
                  </p>
                  {log.details?.signerEmail && (
                    <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>{log.details.signerEmail}</p>
                  )}
                  {log.action === 'refused' && log.details?.reason && (
                    <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--danger)', fontStyle: 'italic', marginTop: 4 }}>
                      Reason: &ldquo;{log.details.reason}&rdquo;
                    </p>
                  )}
                  {log.details?.geo && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: 4, font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
                      <MapPin size={10} /> {log.details.geo.city}, {log.details.geo.country}
                    </p>
                  )}
                  <p style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>{formatTimeAgo(log.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
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

    // Race getDocument against a timeout so an unreachable worker (or any
    // pdfjs internal deadlock) surfaces as a visible error instead of an
    // infinite spinner — same pattern PublicSigningPage already uses.
    const PDF_LOAD_TIMEOUT_MS = 30000;

    async function load() {
      let loadingTask;
      let timeoutId;
      try {
        const resp = await fetch(fetchUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error('Failed to fetch PDF');
        const arrayBuffer = await resp.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('PDF load timed out')), PDF_LOAD_TIMEOUT_MS);
        });
        const doc = await Promise.race([loadingTask.promise, timeoutPromise]);
        clearTimeout(timeoutId);
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        clearTimeout(timeoutId);
        try { loadingTask?.destroy(); } catch { /* ignore */ }
        if (!cancelled) {
          const isTimeout = err?.message === 'PDF load timed out';
          setError(isTimeout
            ? 'The document is taking too long to load. Please refresh the page.'
            : (err.message || 'Failed to load PDF'));
        }
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
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading PDF…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState icon={<FileText size={22} />} tone="warn" title="Failed to load PDF">
          {error}
        </EmptyState>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Page navigation */}
      {numPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '6px 0', background: 'var(--surface-2)',
          boxShadow: 'inset 0 -1px 0 var(--line)',
        }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            style={{ padding: '0 7px' }}
          >
            <ChevronLeft size={16} />
          </Button>
          <span style={{ font: `550 12px/1 ${FONT}`, color: 'var(--fg-2)' }}>
            {currentPage} / {numPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            aria-label="Next page"
            style={{ padding: '0 7px' }}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
      {/* Canvas — the page itself is white paper in either theme, so it sits
          on the deepest surface rather than on a page background. */}
      <div style={{ overflow: 'auto', maxHeight: 500, padding: 8, background: 'var(--bg)', position: 'relative' }}>
        {rendering && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1,
            background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
          }}>
            <Spinner />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto', maxWidth: '100%', borderRadius: 'var(--r-1)' }} />
      </div>
    </div>
  );
}

/* ── Info Row helper ──────────────────────────────────────────────────── */
function InfoRow({ icon: Icon, label, value, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
      boxShadow: 'inset 0 -1px 0 var(--line)',
    }}>
      <Icon size={16} style={{ color: 'var(--fg-4)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{
          font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--fg-4)',
        }}>
          {label}
        </p>
        {children || (
          <p style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)', marginTop: 3 }}>
            {value || '\u2014'}
          </p>
        )}
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
  const { user } = useAuth();
  const handleScoped404 = useCompanyScoped404('signature request');

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
    } catch (err) {
      if (handleScoped404(err)) return;
      showToast('Failed to load request details', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, requestId, showToast, handleScoped404]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  // Legal / audit stamps (sent, signed, completed, refused, signingDate) carry
  // the viewer's tz abbreviation so signed PDFs and the UI agree on when an
  // event happened. Informational stamps (viewed) skip the zone to stay quiet.
  const formatLegal = (dateStr) => formatDateTime(dateStr, { user, showZone: true }) || '\u2014';
  const formatLight = (dateStr) => formatDateTime(dateStr, { user }) || '\u2014';
  // Validity is a date-only field (midnight-UTC); keep UTC to avoid \u00b11 day drift.
  const formatDateShort = (dateStr) => formatDateUTC(dateStr) || '\u2014';

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
        // Surface the backend's cooldown outcome: it reminds ALL pending
        // signers and skips any reminded in the last 10 min.
        if (res.reminded === 0 && res.skipped > 0) {
          showToast(res.message || 'Reminder already sent recently — try again in a few minutes.', 'error');
        } else {
          showToast(res.reminded === 1 ? 'Reminder sent to 1 pending signer' : `Reminder sent to ${res.reminded ?? 'all'} pending signers`);
        }
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
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <Spinner />
      </div>
    );
  }

  if (!request) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
        <EmptyState icon={<FileText size={22} />} title="Request not found">
          This signature request may have been deleted or you do not have access.
        </EmptyState>
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

  // `docTab` starts at 'signed' before the request has loaded. When the
  // request has a certificate but no signed PDF, that stale default asked the
  // API for /signed-pdf — a 404 — while the UI showed a lone Certificate tab.
  // Fall back to whichever document actually exists.
  const activeDocTab = (docTab === 'signed' && !request.signedPdfUrl && request.certificateUrl)
    ? 'certificate'
    : docTab;

  const signerColumns = [
    {
      key: 'order',
      header: '#',
      width: 56,
      align: 'center',
      render: (signer, idx) => (
        <span style={{
          width: 24, height: 24, display: 'inline-grid', placeItems: 'center', borderRadius: '50%',
          background: 'color-mix(in srgb, var(--a-sign) 18%, transparent)',
          font: `700 11px/1 ${FONT}`, color: 'var(--a-sign)',
        }}>
          {signer.order || idx + 1}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Signer',
      width: 230,
      render: (signer) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' }}>
          <span style={{
            width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%',
            background: 'color-mix(in srgb, var(--a-sign) 14%, transparent)',
            font: `600 11px/1 ${FONT}`, color: 'var(--a-sign)',
          }}>
            {(signer.name || '?')[0].toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              title={signer.name || 'Unknown'}
              style={{
                display: 'block', font: `550 13px/1.35 ${FONT}`, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {signer.name || 'Unknown'}
            </span>
            <span
              title={signer.email || undefined}
              style={{
                display: 'block', font: `450 11.5px/1.35 ${FONT}`, color: 'var(--fg-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {signer.email || '\u2014'}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 140,
      render: (signer) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
          <StatusBadge status={signer.state || 'pending'} />
          {signer.viewedAt && signer.state !== 'completed' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              font: `450 10px/1.2 ${FONT}`, color: 'var(--a-ats)',
            }}>
              <Eye size={10} /> Viewed {formatLight(signer.viewedAt)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 120,
      render: (signer) => (signer.roleName ? <Chip>{signer.roleName}</Chip> : <span style={{ color: 'var(--fg-4)' }}>{'\u2014'}</span>),
    },
    {
      key: 'signingDate',
      header: 'Signed Date',
      width: 160,
      muted: true,
      render: (signer) => (signer.signingDate ? formatLegal(signer.signingDate) : '\u2014'),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 80,
      align: 'right',
      render: (signer, idx) => (
        request.state === 'sent' && signer.state !== 'completed' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                setRemindingSigner(signer._id || idx);
                // NOTE: the API reminds ALL pending signers
                // (there's no per-signer remind endpoint), so
                // the toast must not claim only this signer.
                const res = await signApi.remindSigners(orgSlug, requestId);
                if (res.success !== false) {
                  if (res.reminded === 0 && res.skipped > 0) {
                    showToast(res.message || 'Reminder already sent recently — try again in a few minutes.', 'error');
                  } else {
                    showToast('Reminder sent to all pending signers');
                  }
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
            title="Send reminder to all pending signers"
            aria-label="Send reminder to all pending signers"
            style={{ padding: '0 7px', color: 'var(--fg-3)' }}
          >
            {remindingSigner === (signer._id || idx) ? <Spinner size={14} /> : <Bell size={14} />}
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {request.reference || request.name || 'Untitled Request'}
            <StatusBadge status={request.state} size="lg" />
            {request.archived && (
              <Chip uppercase><Archive size={11} /> Archived</Chip>
            )}
          </span>
        }
        sub={
          <span>
            {template?.name || request.templateName || 'Unknown template'}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
              <Shield size={12} style={{ color: 'var(--brand)' }} />
              <span style={{ font: `450 11px/1 ${FONT}`, color: 'var(--fg-4)' }}>
                eIDAS &middot; ESIGN Act &middot; UETA Compliant
              </span>
            </span>
          </span>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Archive / Unarchive — gated on terminal states only. While
                'sent' (in progress), Cancel must be used first. Backend
                rejects non-terminal archives with 400 as defense-in-depth. */}
            {(() => {
              const TERMINAL = ['draft', 'signed', 'refused', 'cancelled', 'expired', 'voided'];
              const isTerminal = TERMINAL.includes(request.state);
              if (request.archived) {
                return (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await signApi.unarchiveRequest(orgSlug, requestId);
                        setRequest((r) => ({ ...r, archived: false }));
                        showToast('Unarchived');
                      } catch (err) {
                        showToast(err?.message || 'Failed to unarchive', 'error');
                      }
                    }}
                    iconLeft={<ArchiveRestore size={14} />}
                  >
                    Unarchive
                  </Button>
                );
              }
              if (!isTerminal) return null;
              return (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await signApi.archiveRequest(orgSlug, requestId);
                      setRequest((r) => ({ ...r, archived: true }));
                      showToast('Archived');
                    } catch (err) {
                      showToast(err?.message || 'Failed to archive', 'error');
                    }
                  }}
                  iconLeft={<Archive size={14} />}
                >
                  Archive
                </Button>
              );
            })()}
            {request.state === 'sent' && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleRemind}
                  disabled={reminding}
                  iconLeft={reminding ? <Spinner size={14} /> : <Bell size={14} />}
                >
                  Remind All
                </Button>
                {/* Tinted, not a solid danger fill. Cancelling an envelope is
                    irreversible and this page has no primary action, so a solid
                    red would make the destructive control the loudest thing on
                    screen — louder than legacy, which used a tinted outline.
                    ds reserves `variant="danger"` for a dialog's confirm. */}
                <Button
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={cancelling}
                  iconLeft={cancelling ? <Spinner size={14} /> : <XCircle size={14} />}
                  style={{
                    color: 'var(--danger)',
                    background: 'var(--danger-soft)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 30%, transparent)',
                  }}
                >
                  Cancel Request
                </Button>
              </>
            )}
            {/* Signed PDF + Certificate downloads (when completed) */}
            {request.state === 'signed' && request.signedPdfUrl && (
              <Button variant="secondary" onClick={() => openProxyPdf('signed')} iconLeft={<Download size={14} />}>
                Signed PDF
              </Button>
            )}
            {request.state === 'signed' && request.certificateUrl && (
              <Button variant="secondary" onClick={() => openProxyPdf('certificate')} iconLeft={<Download size={14} />}>
                Certificate
              </Button>
            )}
            {pdfUrl && (
              <Button
                variant="secondary"
                onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                iconLeft={<Download size={14} />}
              >
                Original PDF
              </Button>
            )}
          </div>
        }
        style={{ marginBottom: 0 }}
      />

      {/* Refusal banner — surfaces the reason when a signer declined to
          sign. The backend captures req.body.reason on /api/sign/refuse
          and persists it to request.refuseReason + the refused signer's
          row, so creators can act (re-send, edit, archive) with context. */}
      {request.state === 'refused' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
          borderRadius: 'var(--r-3)', background: 'var(--danger-soft)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 26%, transparent)',
        }}>
          <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--danger)' }}>
              {(() => {
                const refusedSigner = (request.signers || []).find((s) => s.state === 'refused');
                return refusedSigner
                  ? `${refusedSigner.name || refusedSigner.email} declined to sign`
                  : 'A signer declined this request';
              })()}
            </p>
            {request.refuseReason ? (
              <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)', fontStyle: 'italic', marginTop: 6 }}>
                &ldquo;{request.refuseReason}&rdquo;
              </p>
            ) : (
              <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)', fontStyle: 'italic', marginTop: 6 }}>No reason provided</p>
            )}
            {request.refusedAt && (
              <p style={{ font: `450 11px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 6 }}>
                {formatLegal(request.refusedAt)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        {/* Left: Info + Signers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '2 1 460px', minWidth: 0 }}>
          <Panel title="Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 24 }}>
              <div>
                <InfoRow icon={FileText} label="Template" value={template?.name || request.templateName} />
              </div>
              <div>
                <InfoRow icon={Send} label="Sent Date" value={formatLegal(request.sentAt || request.createdAt)} />
                <InfoRow
                  icon={CheckCircle2}
                  label="Completed"
                  value={request.state === 'signed' ? formatLegal(request.completedAt || request.updatedAt) : '—'}
                />
                <InfoRow icon={Clock} label="Valid Until" value={request.validity ? formatDateShort(request.validity) : 'No expiry'} />
              </div>
            </div>
            <RecordMeta
              style={{ marginTop: 16, paddingTop: 12, boxShadow: 'inset 0 1px 0 var(--line)' }}
              createdAt={request.createdAt}
              createdByName={request.createdByName || request.createdBy?.name}
              updatedAt={request.updatedAt}
              updatedByName={request.updatedByName}
            />
          </Panel>

          {/* Linked ATS Application */}
          {request.linkedApplicationId && (
            <Panel title="Linked Application">
              <Link
                to={orgPath(`/ats/applications/${request.linkedApplicationId}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                  borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                  boxShadow: 'inset 0 0 0 1px var(--line)', color: 'inherit',
                }}
              >
                <span style={{
                  width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: 'var(--r-1)', background: 'color-mix(in srgb, var(--a-sign) 14%, transparent)',
                }}>
                  <LinkIcon size={14} style={{ color: 'var(--a-sign)' }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>
                    View Linked ATS Application
                  </span>
                  <span style={{
                    display: 'block', font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    ID: {request.linkedApplicationId}
                  </span>
                </span>
                <ExternalLink size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              </Link>
            </Panel>
          )}

          {/* Signers */}
          <Panel
            flush
            title={
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                Signers
                <span style={{ font: `450 12.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>
                  {signedCount}/{totalSigners} completed
                </span>
              </span>
            }
            actions={
              <Meter
                value={signedCount}
                max={totalSigners || 1}
                label="Signing progress"
                readout={`${signedCount}/${totalSigners}`}
                style={{ width: 260 }}
              />
            }
          >
            <DataTable
              columns={signerColumns}
              rows={signers}
              rowKey={(s, i) => s._id || i}
              empty={
                <EmptyState icon={<User size={22} />} compact title="No signers assigned" />
              }
            />
          </Panel>

          {/* Envelope Documents */}
          {request.isEnvelope && request.documents?.length > 0 && (
            <Panel title={`Envelope Documents (${request.documents.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {request.documents.map((doc, idx) => (
                  <div key={doc.id || idx} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: 12, borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                    boxShadow: 'inset 0 0 0 1px var(--line)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={{
                        width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: '50%', background: 'color-mix(in srgb, var(--a-sign) 18%, transparent)',
                        font: `700 11px/1 ${FONT}`, color: 'var(--a-sign)',
                      }}>
                        {doc.order || idx + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>{doc.templateName}</p>
                        <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>{doc.numPages || 1} page(s)</p>
                      </div>
                    </div>
                    {doc.signedPdfUrl ? (
                      <Chip tone="brand"><CheckCircle2 size={11} /> Signed</Chip>
                    ) : (
                      <Chip>Pending</Chip>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Signed Values */}
          {request.state === 'signed' && values.length > 0 && (
            <Panel title="Signed Values">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {values.map((val, idx) => (
                  <div key={val._id || idx} style={{
                    padding: 16, borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                    boxShadow: 'inset 0 0 0 1px var(--line)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{
                        font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase',
                        letterSpacing: '.08em', color: 'var(--fg-4)',
                      }}>
                        {val.signerName || `Signer ${idx + 1}`}
                        {val.role ? ` (${val.role})` : ''}
                      </span>
                      <span style={{ font: `450 11.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>
                        {val.signedAt ? formatLegal(val.signedAt) : ''}
                      </span>
                    </div>
                    {val.fields && Object.keys(val.fields).length > 0 ? (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 12, marginTop: 12,
                      }}>
                        {Object.entries(val.fields).map(([key, fieldVal]) => (
                          <div key={key}>
                            <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginBottom: 2 }}>{key}</p>
                            <div style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>
                              {typeof fieldVal === 'string' && fieldVal.startsWith('data:image') ? (
                                <img
                                  src={fieldVal}
                                  alt={key}
                                  style={{
                                    height: 48, borderRadius: 'var(--r-1)',
                                    /* A signature is dark ink on transparency, so it
                                       needs light paper under it in BOTH themes. */
                                    background: '#fff', padding: 2,
                                    boxShadow: 'inset 0 0 0 1px var(--line)',
                                  }}
                                />
                              ) : (
                                String(fieldVal || '—')
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 8 }}>No field values recorded</p>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Right: PDF Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '1 1 320px', minWidth: 0 }}>
          {request.state === 'signed' && (request.signedPdfUrl || request.certificateUrl) ? (
            <Panel flush>
              <div style={{ display: 'flex', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
                {request.signedPdfUrl && (
                  <button
                    type="button"
                    onClick={() => setDocTab('signed')}
                    aria-pressed={activeDocTab === 'signed'}
                    style={{
                      flex: 1, padding: '12px 16px', font: `550 13px/1 ${FONT}`,
                      color: activeDocTab === 'signed' ? 'var(--fg)' : 'var(--fg-3)',
                      background: activeDocTab === 'signed' ? 'var(--surface-2)' : 'transparent',
                      boxShadow: activeDocTab === 'signed' ? 'inset 0 -2px 0 var(--brand)' : 'none',
                    }}
                  >
                    Signed PDF
                  </button>
                )}
                {request.certificateUrl && (
                  <button
                    type="button"
                    onClick={() => setDocTab('certificate')}
                    aria-pressed={activeDocTab === 'certificate'}
                    style={{
                      flex: 1, padding: '12px 16px', font: `550 13px/1 ${FONT}`,
                      color: activeDocTab === 'certificate' ? 'var(--fg)' : 'var(--fg-3)',
                      background: activeDocTab === 'certificate' ? 'var(--surface-2)' : 'transparent',
                      boxShadow: activeDocTab === 'certificate' ? 'inset 0 -2px 0 var(--brand)' : 'none',
                    }}
                  >
                    Certificate
                  </button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => openProxyPdf(activeDocTab === 'certificate' ? 'certificate' : 'signed')}
                  title="Open in new tab"
                  aria-label="Open in new tab"
                  style={{ padding: '0 12px', borderRadius: 0 }}
                >
                  <ExternalLink size={14} />
                </Button>
              </div>
              <InlinePdfViewer
                key={activeDocTab}
                fetchUrl={`${API_BASE_URL}/api/org/${orgSlug}/sign/requests/${requestId}/${activeDocTab === 'certificate' ? 'certificate' : 'signed-pdf'}`}
                token={localStorage.getItem('rivvra_token')}
              />
            </Panel>
          ) : pdfUrl ? (
            <Panel
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={16} style={{ color: 'var(--fg-4)' }} /> Document Preview
                </span>
              }
            >
              <EmptyState
                compact
                icon={<FileText size={22} />}
                tone="brand"
                title="Document available"
                actions={
                  <Button
                    onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                    iconLeft={<ExternalLink size={14} />}
                  >
                    Open Document
                  </Button>
                }
              >
                Open the PDF in a new tab to view the full document
              </EmptyState>
            </Panel>
          ) : (
            <Panel
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={16} style={{ color: 'var(--fg-4)' }} /> Document Preview
                </span>
              }
            >
              <EmptyState compact icon={<FileText size={22} />} title="PDF preview not available">
                The document will be available after the template is processed.
              </EmptyState>
            </Panel>
          )}

          {/* Quick info card */}
          <Panel title="Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ font: `450 13px/1 ${FONT}`, color: 'var(--fg-3)' }}>Status</span>
                <StatusBadge status={request.state} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ font: `450 13px/1 ${FONT}`, color: 'var(--fg-3)' }}>Signers</span>
                <span style={{ font: `550 13px/1 ${FONT}`, color: 'var(--fg)' }}>{signedCount}/{totalSigners}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ font: `450 13px/1 ${FONT}`, color: 'var(--fg-3)' }}>Template</span>
                <span
                  title={template?.name || undefined}
                  style={{
                    font: `450 13px/1 ${FONT}`, color: 'var(--fg-2)', maxWidth: 140,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {template?.name || '—'}
                </span>
              </div>
              {request.subject && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ font: `450 13px/1 ${FONT}`, color: 'var(--fg-3)' }}>Subject</span>
                  <span
                    title={request.subject}
                    style={{
                      font: `450 13px/1 ${FONT}`, color: 'var(--fg-2)', maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {request.subject}
                  </span>
                </div>
              )}
            </div>
          </Panel>

          {/* Activity Timeline */}
          <SignTimeline orgSlug={orgSlug} requestId={requestId} />
        </div>
      </div>
    </div>
  );
}
