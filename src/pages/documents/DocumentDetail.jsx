import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import RecordMeta from '../../components/shared/RecordMeta';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import {
  Loader2, ArrowLeft, Download, Upload, Archive, ArchiveRestore,
  Trash2, RotateCcw, FileText, History, Tag as TagIcon, Folder, Eye,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

function formatSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgSlug, getAppRole } = useOrg();
  const { toast } = useToast();
  const isAdmin = getAppRole('documents') === 'admin';

  const [doc, setDoc] = useState(null);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, action, danger? }
  const [previewUrl, setPreviewUrl] = useState(null); // signed Cloudinary URL — only set for images, the shared modal renders them
  const replaceFileInput = useRef(null);

  const load = useCallback(async () => {
    if (!orgSlug || !id) return;
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
      toast({ title: 'Failed to load document', description: e.message, variant: 'error' });
      navigate(`/org/${orgSlug}/documents`);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, id, toast, navigate]);

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
      // Images render reliably inside the shared modal via <img src>.
      // PDFs and Office docs hit a Chrome quirk where iframe-loaded blob
      // URLs only load the PDF embedder CSS — the viewer plugin never
      // instantiates inside the iframe body. Falling back to a new tab
      // for those formats sidesteps it entirely; Chrome's built-in PDF
      // viewer works perfectly as a top-level navigation.
      if (cv?.mimeType?.startsWith('image/')) {
        setPreviewUrl(data.url);
      } else {
        window.open(data.url, '_blank', 'noopener');
      }
    } catch (e) {
      toast({ title: 'Preview failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReplace(file) {
    if (!file) return;
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
    return <div className="p-12 text-center text-dark-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</div>;
  }

  const cv = doc.currentVersion;
  const totalVersions = (doc.versions?.length || 0) + (cv ? 1 : 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <button onClick={() => navigate(-1)} className="text-sm text-dark-400 hover:text-dark-200 inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-dark-900 border border-dark-800 rounded-xl">
        <div className="px-6 py-5 border-b border-dark-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-dark-100 truncate">{doc.name}</h1>
            <div className="mt-1 text-xs text-dark-500 flex items-center gap-2 flex-wrap">
              <FileText className="w-3.5 h-3.5" />
              <span>{cv?.originalFilename}</span>
              <span>·</span>
              <span>{formatSize(cv?.size)}</span>
              <span>·</span>
              <span>{cv?.mimeType}</span>
              {doc.archived && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] uppercase tracking-wider">Archived</span>}
            </div>
            <RecordMeta
              className="mt-3"
              compact
              createdAt={doc.createdAt}
              updatedAt={doc.updatedAt}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handlePreview} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm bg-dark-800 hover:bg-dark-700 text-dark-100 inline-flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button onClick={() => handleDownload()} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm bg-rivvra-500 hover:bg-rivvra-600 text-white inline-flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-dark-800">
          <Field label="Folder" icon={Folder}>
            {isAdmin ? (
              <select
                value={String(doc.folderId || '')}
                onChange={(e) => handleMetadataUpdate({ folderId: e.target.value })}
                className="w-full px-2 py-1 rounded bg-dark-800 border border-dark-700 text-dark-100 text-sm"
              >
                {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            ) : (
              <span className="text-sm text-dark-200">{folders.find((f) => String(f._id) === String(doc.folderId))?.name || '—'}</span>
            )}
          </Field>
          <Field label="Uploaded" icon={History}>
            <span className="text-sm text-dark-200">{formatDateUTC(cv?.uploadedAt || doc.createdAt)}</span>
          </Field>
          <Field label="Tags" icon={TagIcon} className="md:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-xs text-dark-500">No tags configured</span>}
              {tags.map((t) => {
                const on = doc.tagIds?.some((x) => String(x) === String(t._id));
                if (!isAdmin && !on) return null;
                return (
                  <button key={t._id}
                    disabled={!isAdmin}
                    onClick={() => {
                      const cur = (doc.tagIds || []).map((x) => String(x));
                      const next = on ? cur.filter((x) => x !== String(t._id)) : [...cur, String(t._id)];
                      handleMetadataUpdate({ tagIds: next });
                    }}
                    className={`px-2 py-1 rounded-full text-[11px] border ${on ? 'bg-rivvra-500/10 border-rivvra-500/40 text-rivvra-300' : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-dark-100'} ${!isAdmin ? 'cursor-default' : ''}`}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>
          {doc.description && (
            <Field label="Description" className="md:col-span-2">
              <p className="text-sm text-dark-200 whitespace-pre-wrap">{doc.description}</p>
            </Field>
          )}
        </div>

        {/* Versions */}
        <div className="px-6 py-5 border-b border-dark-800">
          <h3 className="text-sm font-semibold text-dark-100 mb-3 inline-flex items-center gap-2">
            <History className="w-4 h-4" /> Version history <span className="text-dark-500 font-normal">({totalVersions})</span>
          </h3>
          <div className="space-y-2">
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
        </div>

        {/* Admin actions */}
        {isAdmin && (
          <div className="px-6 py-4 flex items-center gap-2 flex-wrap">
            <input ref={replaceFileInput} type="file" className="hidden" onChange={(e) => handleReplace(e.target.files?.[0])} />
            <button onClick={() => replaceFileInput.current?.click()} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm bg-dark-800 hover:bg-dark-700 text-dark-100 inline-flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Replace / new version
            </button>
            <button onClick={handleArchive} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm bg-dark-800 hover:bg-dark-700 text-dark-100 inline-flex items-center gap-1.5">
              {doc.archived ? <><ArchiveRestore className="w-4 h-4" /> Unarchive</> : <><Archive className="w-4 h-4" /> Archive</>}
            </button>
            <div className="flex-1" />
            <button onClick={askDelete} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 inline-flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Delete permanently
            </button>
          </div>
        )}
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
          onClose={() => setPreviewUrl(null)}
        />
      )}
    </div>
  );
}

function Field({ label, icon: Icon, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wider text-dark-500 mb-1.5 inline-flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </div>
      {children}
    </div>
  );
}

function VersionRow({ label, v, onDownload, onRestore }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-dark-800/50 border border-dark-800">
      <div className="min-w-0">
        <div className="text-sm text-dark-100">{label} <span className="text-dark-500">· {v.originalFilename}</span></div>
        <div className="text-xs text-dark-500">{formatSize(v.size)} · {formatDateUTC(v.uploadedAt)}</div>
      </div>
      <div className="flex items-center gap-2">
        {onRestore && (
          <button onClick={onRestore} className="text-xs text-dark-300 hover:text-dark-100 inline-flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Restore
          </button>
        )}
        <button onClick={onDownload} className="text-xs text-dark-300 hover:text-dark-100 inline-flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> Download
        </button>
      </div>
    </div>
  );
}
