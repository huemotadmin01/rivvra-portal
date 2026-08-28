// ============================================================================
// DocumentVaultV2.jsx — permanent, identity-scoped document access, on ds
// ============================================================================
//
// Route: /document-vault. A TOP-LEVEL page, not org-scoped — deliberately.
//
// This lists every release document shared with the signed-in person across
// all workspaces, including ones where they are a fully-archived ex-employee
// and normal app access has ended. It is how someone pulls their Form-16,
// experience and relieving letters years after leaving. Backed by
// `GET /api/me/document-vault` (auth only, per-doc identity match).
//
// That framing is why nothing here is gated on org membership and why the
// grouping is by WORKSPACE rather than by company: a person may hold documents
// from several employers, and each group header is the employer they need to
// recognise.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • `download` — `saveAuthedFile(vaultDocUrl(id, true), …)`. The `true` is
//     the authed-proxy flag; the filename falls back to
//     `${docTypeLabel}.pdf` when the record has none, so a download never
//     lands as "download" with no extension.
//   • The `load()` call AFTER a successful download. The vault records access,
//     so the list is refetched to reflect it — dropping that would leave the
//     page showing stale access state.
//   • `formatBytes`' 1024 KB threshold and its `if (!bytes) return ''` — a
//     missing size renders nothing rather than "0 KB".
//   • `totalDocs` summing across workspaces, which is what decides the empty
//     state. A person with three employers and zero documents must see the
//     empty state, not three empty group headers.
//
// Not triggered: document download.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vault, FileText, Loader2, Download, Building2, ArrowLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import employeeApi from '../utils/employeeApi';
import { Panel, Button, Chip, EmptyState, Spinner } from '../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

function formatBytes(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ── Main Page ──────────────────────────────────────────────────────────────
function DocumentVaultV2() {
  const navigate = useNavigate();
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 'clamp(16px, 3vw, 40px) clamp(12px, 2vw, 16px)' }}>
      <div style={{ maxWidth: 768, margin: '0 auto' }}>
        {/* This page routes OUTSIDE the platform layout — no sidebar, no
            app bar, no avatar menu — so without this link the browser back
            button is the only way out. */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
          }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{
            width: 44, height: 44, borderRadius: 'var(--r-3, 14px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--brand-soft)', color: 'var(--brand-ink)',
          }}>
            <Vault size={22} />
          </span>
          <div>
            <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
              Document Vault
            </h1>
            <p style={{ ...microStyle, marginTop: 3, fontSize: 12.5 }}>
              Your official documents from every employer on Rivvra
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <Spinner size={28} />
          </div>
        ) : totalDocs === 0 ? (
          <Panel>
            <EmptyState icon={<Vault size={26} />} title="No documents found">
              There are no documents shared with this account. They appear here once an employer publishes them.
            </EmptyState>
          </Panel>
        ) : (
          <div style={{ display: 'grid', gap: 28 }}>
            {workspaces.map((w) => (
              <div key={w.orgId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Building2 size={15} style={{ color: 'var(--fg-4)' }} />
                  <h2 style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>
                    {w.orgName}
                  </h2>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {w.documents.map((d) => (
                    <Panel key={d._id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{
                          width: 36, height: 36, borderRadius: 'var(--r-2, 10px)', flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--danger-soft)', color: 'var(--danger)',
                        }}>
                          <FileText size={16} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ font: "550 13.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.label || d.docTypeLabel}
                            </span>
                            <Chip>{d.docTypeLabel}</Chip>
                            {d.period && <Chip>{d.period}</Chip>}
                          </div>
                          <p style={{ ...microStyle, marginTop: 5 }}>
                            {d.companyName ? `${d.companyName} · ` : ''}{d.fileName} {d.size ? `· ${formatBytes(d.size)}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => download(d)}
                          disabled={busyId === d._id}
                          aria-label={`Download ${d.label || d.docTypeLabel}`}
                          iconLeft={busyId === d._id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        >
                          Download
                        </Button>
                      </div>
                    </Panel>
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

export default DocumentVaultV2;
