// ============================================================================
// DocumentDetailV2.jsx — document record on ds (phase 6a)
// ============================================================================
// Copied from DocumentDetail.jsx. Every gate is unchanged: fetches still wait
// on company hydration, Archive stays open to every member while Replace and
// Delete stay admin-only (matching the backend), the 50 MB client-side cap on
// a replacement file still fires before the round-trip, and moving a document
// between folders still asks first.
//
// Presentation moves to ds: `Panel` sections, ds `Field` for the metadata
// rows, ds `Select` for the folder picker, ds `Chip` for tags and the archived
// badge, ds `ConfirmDialog` (Enter no longer confirms a danger dialog) and ds
// `RecordMeta`. The local `Field` helper is cut — ds `Field` covers it. The
// local `VersionRow` stays: it is page composition, not a missing primitive.
//
// `DocumentPreviewModal` is still the legacy shared component — it owns the
// PDF/Office rendering pipeline and belongs with the Documents preview work,
// not a layout pass. Every `/documents/{id}/preview` request 500s on staging
// (scrubbed data), so preview could not be exercised end to end here.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import {
  ArrowLeft, Download, Upload, Archive, ArchiveRestore,
  Trash2, RotateCcw, FileText, History, Tag as TagIcon, Folder, Eye,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  Button, Chip, ConfirmDialog, Field, Panel, RecordMeta, Select, Spinner,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

function formatSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const fieldLabel = (Icon, text) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    font: `600 10px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
    color: 'var(--fg-4)',
  }}>
    {Icon && <Icon size={12} />} {text}
  </span>
);

export default function DocumentDetailV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgSlug, getAppRole } = useOrg();
  // Gate fetches on company hydration so the doc resolves under the active
  // company (not the pre-hydration fallback) — same fix as DocumentsList.
  const { hydrated } = useCompany();
  const { toast } = useToast();
  const isAdmin = getAppRole('documents') === 'admin';
  const handleScoped404 = useCompanyScoped404('document');

  const [doc, setDoc] = useState(null);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, action, danger? }
  const [previewUrl, setPreviewUrl] = useState(null); // signed Cloudinary URL — fine for images via <img>
  const [previewFetchUrl, setPreviewFetchUrl] = useState(null); // API stream URL (proxy) — used by the modal for PDFs to bypass Cloudinary X-Frame-Options
  const replaceFileInput = useRef(null);

  const load = useCallback(async () => {
    if (!orgSlug || !id || !hydrated) return;
    setLoading(true);
    try {
      const [d, f, t] = await Promise.all([
        documentsApi.get(orgSlug, id),
        documentsApi.listFolders(orgSlug),
        documentsApi.listTags(orgSlug),
      ]);
      if (!d.success) throw new Error(d.error || 'Not found');
      setDoc(d.data);
      if (f.success) setFolders(f.data || []);
      if (t.success) setTags(t.data || []);
    } catch (e) {
      if (handleScoped404(e)) return;
      toast({ title: 'Failed to load document', description: e.message, variant: 'error' });
      navigate(`/org/${orgSlug}/documents`);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, id, hydrated, toast, navigate, handleScoped404]);

  useEffect(() => { load(); }, [load]);

  async function fetchSignedUrl(kind, versionIndex) {
    const r = kind === 'preview'
      ? await documentsApi.previewUrl(orgSlug, id, versionIndex)
      : await documentsApi.downloadUrl(orgSlug, id, versionIndex);
    if (!r.success) throw new Error(r.error || 'Failed to sign URL');
    return r.data;
  }

  async function handleDownload(versionIndex) {
    setBusy(true);
    try {
      const data = await fetchSignedUrl('download', versionIndex);
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      toast({ title: 'Download failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    try {
      const data = await fetchSignedUrl('preview');
      // Images: signed Cloudinary URL goes straight to <img>.
      // PDFs / Office: hand the modal the /stream proxy URL so it can
      // fetch via Bearer auth (Cloudinary blocks direct iframe/object
      // embedding) and render the resulting blob through the shared
      // modal's <object>+<iframe> pipeline.
      setPreviewUrl(data.url);
      setPreviewFetchUrl(documentsApi.streamUrl(orgSlug, id));
    } catch (e) {
      toast({ title: 'Preview failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReplace(file) {
    if (!file) return;
    // Client-side 50 MB cap matches the server. Without this, large files burn
    // an entire round-trip + bandwidth only to be rejected. The Huemot
    // migration already saw 2 files (34 MB zip, 15 MB PDF) refused — surface
    // this synchronously.
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast({ title: 'File too large', description: `Max 50 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`, variant: 'error' });
      // Clear the input so re-picking the same file re-fires onChange.
      if (replaceFileInput.current) replaceFileInput.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await documentsApi.uploadVersion(orgSlug, id, fd);
      if (!r.success) throw new Error(r.error || 'Failed');
      setDoc(r.data);
      toast({ title: 'New version uploaded', variant: 'success' });
    } catch (e) {
      toast({ title: 'Upload failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
      // Reset so picking the same file again re-fires.
      if (replaceFileInput.current) replaceFileInput.current.value = '';
    }
  }

  function askRestoreVersion(idx) {
    setConfirm({
      title: 'Restore this version?',
      message: `v${doc.versions.length - idx} will become the current version, and the current version will move into history. You can swap them again later.`,
      confirmLabel: 'Restore',
      action: async () => {
        const r = await documentsApi.restoreVersion(orgSlug, id, idx);
        if (!r.success) throw new Error(r.error || 'Failed');
        setDoc(r.data);
        toast({ title: 'Version restored', variant: 'success' });
      },
    });
  }

  async function handleArchive() {
    setBusy(true);
    try {
      const r = doc.archived ? await documentsApi.unarchive(orgSlug, id) : await documentsApi.archive(orgSlug, id);
      if (!r.success) throw new Error(r.error || 'Failed');
      setDoc(r.data);
    } catch (e) {
      toast({ title: 'Action failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function askDelete() {
    setConfirm({
      title: 'Delete this document permanently?',
      message: `"${doc.name}" and every version of it will be removed from Cloudinary and Mongo. This cannot be undone — consider archiving instead.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      action: async () => {
        const r = await documentsApi.destroy(orgSlug, id);
        if (!r.success) throw new Error(r.error || 'Failed');
        toast({ title: 'Deleted', variant: 'success' });
        navigate(`/org/${orgSlug}/documents`);
      },
    });
  }

  async function handleMetadataUpdate(updates) {
    setBusy(true);
    try {
      const r = await documentsApi.updateMetadata(orgSlug, id, updates);
      if (!r.success) throw new Error(r.error || 'Failed');
      setDoc(r.data);
      toast({ title: 'Updated', variant: 'success' });
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !doc) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
        <Spinner label="Loading document…" />
      </div>
    );
  }

  const cv = doc.currentVersion;
  const totalVersions = (doc.versions?.length || 0) + (cv ? 1 : 0);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 880 }}>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<ArrowLeft size={15} />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: 12, padding: '0 8px 0 4px' }}
      >
        Back
      </Button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 300px' }}>
              <h1 style={{
                font: `650 19px/1.3 ${FONT}`, letterSpacing: '-0.016em', color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {doc.name}
              </h1>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 5,
                font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-4)',
              }}>
                <FileText size={13} />
                <span>{cv?.originalFilename}</span>
                <span>·</span>
                <span>{formatSize(cv?.size)}</span>
                <span>·</span>
                <span>{cv?.mimeType}</span>
                {doc.archived && <Chip tone="warn" uppercase>Archived</Chip>}
              </div>
              <RecordMeta compact createdAt={doc.createdAt} updatedAt={doc.updatedAt} style={{ marginTop: 10 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Button variant="secondary" size="sm" iconLeft={<Eye size={14} />} onClick={handlePreview} disabled={busy}>
                Preview
              </Button>
              <Button size="sm" iconLeft={<Download size={14} />} onClick={() => handleDownload()} disabled={busy}>
                Download
              </Button>
            </div>
          </div>
        </Panel>

        {/* Metadata */}
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <Field label={fieldLabel(Folder, 'Folder')} htmlFor="doc-folder">
              {isAdmin ? (
                <Select
                  id="doc-folder"
                  aria-label="Folder"
                  value={String(doc.folderId || '')}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === String(doc.folderId || '')) return;
                    // 2026-05-25: confirm before moving — without the gate, an
                    // accidental click on the native <select> silently
                    // relocated the document. Native confirm is enough here.
                    const target = folders.find((f) => String(f._id) === next);
                    const label = target?.name || '(none)';
                    if (!window.confirm(`Move "${doc.name}" to "${label}"?`)) {
                      return;
                    }
                    handleMetadataUpdate({ folderId: next });
                  }}
                >
                  <option value="">— No folder —</option>
                  {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                  {/* If current folder is archived (so absent from `folders`), inject it
                      as a fallback option so the select correctly reflects state. */}
                  {doc.folderId && !folders.some((f) => String(f._id) === String(doc.folderId)) && (
                    <option value={String(doc.folderId)}>(archived folder)</option>
                  )}
                </Select>
              ) : (
                <span style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>
                  {folders.find((f) => String(f._id) === String(doc.folderId))?.name || '—'}
                </span>
              )}
            </Field>

            <Field label={fieldLabel(History, 'Uploaded')}>
              <span style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>
                {formatDateUTC(cv?.uploadedAt || doc.createdAt)}
              </span>
            </Field>

            <Field label={fieldLabel(TagIcon, 'Tags')} style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.length === 0 && (
                  <span style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-4)' }}>No tags configured</span>
                )}
                {tags.map((t) => {
                  const on = doc.tagIds?.some((x) => String(x) === String(t._id));
                  if (!isAdmin && !on) return null;
                  return (
                    <button
                      key={t._id}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => {
                        const cur = (doc.tagIds || []).map((x) => String(x));
                        const next = on ? cur.filter((x) => x !== String(t._id)) : [...cur, String(t._id)];
                        handleMetadataUpdate({ tagIds: next });
                      }}
                      style={{
                        padding: '3px 9px', borderRadius: 999, border: 'none',
                        font: `500 11.5px/1.4 ${FONT}`,
                        cursor: isAdmin ? 'pointer' : 'default',
                        background: on ? 'var(--brand-soft)' : 'var(--surface-2)',
                        color: on ? 'var(--brand)' : 'var(--fg-3)',
                        boxShadow: on
                          ? 'inset 0 0 0 1px color-mix(in srgb, var(--brand) 34%, transparent)'
                          : 'inset 0 0 0 1px var(--line)',
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            {doc.description && (
              <Field label={fieldLabel(null, 'Description')} style={{ gridColumn: '1 / -1' }}>
                <p style={{ font: `450 13px/1.6 ${FONT}`, color: 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>
                  {doc.description}
                </p>
              </Field>
            )}
          </div>
        </Panel>

        {/* Versions */}
        <Panel
          icon={<History size={14} />}
          title={<>Version history <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}>({totalVersions})</span></>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cv && (
              <VersionRow label={`v${totalVersions} · current`} v={cv} onDownload={() => handleDownload()} />
            )}
            {(doc.versions || []).map((v, idx) => (
              <VersionRow
                key={idx}
                label={`v${totalVersions - 1 - idx}`}
                v={v}
                onDownload={() => handleDownload(idx)}
                onRestore={isAdmin ? () => askRestoreVersion(idx) : null}
              />
            ))}
          </div>
        </Panel>

        {/* Actions row — split so non-admins still see Archive/Unarchive
            (reversible) but Replace + Delete stay admin-only. */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Archive — every member can soft-delete (and undo). */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleArchive}
              disabled={busy}
              iconLeft={doc.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            >
              {doc.archived ? 'Unarchive' : 'Archive'}
            </Button>
            {/* Replace + Delete — admin-only (matches backend gates). */}
            {isAdmin && (
              <>
                <input
                  ref={replaceFileInput}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => handleReplace(e.target.files?.[0])}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Upload size={14} />}
                  onClick={() => replaceFileInput.current?.click()}
                  disabled={busy}
                >
                  Replace / new version
                </Button>
                <div style={{ flex: 1 }} />
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Trash2 size={14} />}
                  onClick={askDelete}
                  disabled={busy}
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)', boxShadow: 'none' }}
                >
                  Delete permanently
                </Button>
              </>
            )}
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setBusy(true);
          try {
            await confirm.action();
            setConfirm(null);
          } catch (e) {
            toast({ title: 'Action failed', description: e.message, variant: 'error' });
          } finally {
            setBusy(false);
          }
        }}
      />

      {previewUrl && cv && (
        <DocumentPreviewModal
          filename={cv.originalFilename || doc.name}
          mimeType={cv.mimeType}
          directUrl={previewUrl}
          fetchUrl={previewFetchUrl}
          pdfRenderer="canvas"
          onClose={() => { setPreviewUrl(null); setPreviewFetchUrl(null); }}
        />
      )}
    </div>
  );
}

function VersionRow({ label, v, onDownload, onRestore }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '9px 12px', borderRadius: 'var(--r-2)',
      background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: `500 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>
          {label} <span style={{ color: 'var(--fg-4)' }}>· {v.originalFilename}</span>
        </div>
        <div style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-4)', marginTop: 1 }}>
          {formatSize(v.size)} · {formatDateUTC(v.uploadedAt)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {onRestore && (
          <Button variant="ghost" size="sm" iconLeft={<RotateCcw size={13} />} onClick={onRestore}>
            Restore
          </Button>
        )}
        <Button variant="ghost" size="sm" iconLeft={<Download size={13} />} onClick={onDownload}>
          Download
        </Button>
      </div>
    </div>
  );
}
