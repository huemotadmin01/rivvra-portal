import { useState, useEffect, useCallback } from 'react';
import { FolderDown, FileText, Download, Eye, Archive } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import { Button, Chip, EmptyState, PageHeader, Panel, Spinner } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

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

/* v2 ESS My Documents (phase 6a). Same data flow as MyDocuments.jsx —
   fetch, group by docType in a fixed order, preview/download through the
   authed-file helpers, refresh after each so the server-side "downloaded"
   marker stays current. Only the presentation moved to ds. */
export default function MyDocumentsV2() {
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

  const grouped = TYPE_ORDER
    .map((t) => ({ type: t, items: documents.filter((d) => d.docType === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 880 }}>
      <PageHeader
        title="My Documents"
        sub="Documents your employer has shared with you"
        style={{ marginBottom: 18 }}
      />

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner /></div>
      ) : !linked ? (
        <EmptyState icon={<FileText size={22} />} tone="warn" title="No employee profile found">
          Documents are shown to linked employees. Contact your administrator if you believe this is an error.
        </EmptyState>
      ) : documents.length === 0 ? (
        <EmptyState icon={<Archive size={22} />} title="No documents yet">
          When HR shares a document with you, it will appear here.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(({ type, items }) => (
            <section key={type}>
              <h2 style={{
                font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
                color: 'var(--fg-4)', marginBottom: 8,
              }}>
                {items[0].docTypeLabel}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((d) => (
                  <Panel key={d._id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 4 }}>
                      <span style={{
                        width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: 'var(--r-1)', background: 'var(--surface-3)',
                      }}>
                        <FileText size={15} style={{ color: 'var(--danger)' }} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {d.label || d.docTypeLabel}
                          </span>
                          {d.period && <Chip>{d.period}</Chip>}
                        </div>
                        <p style={{ font: `450 11px/1.5 ${FONT}`, color: 'var(--fg-4)', marginTop: 3 }}>
                          {d.fileName}{d.size ? ` · ${formatBytes(d.size)}` : ''}
                          {d.uploadedAt ? ` · Shared ${new Date(d.uploadedAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Button
                          variant="ghost" size="sm" title="Preview" aria-label={`Preview ${d.fileName || d.docTypeLabel}`}
                          disabled={busyId === d._id} onClick={() => preview(d)}
                        >
                          <Eye size={15} />
                        </Button>
                        <Button
                          variant="secondary" size="sm" disabled={busyId === d._id}
                          onClick={() => download(d)}
                          iconLeft={busyId === d._id ? <Spinner size={14} /> : <Download size={14} />}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
