import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Loader2 } from 'lucide-react';
import documentsApi from '../../utils/documentsApi';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
]);
const MAX_BYTES = 50 * 1024 * 1024;

export default function UploadDocumentModal({ folders, tags, defaultFolderId, onClose, onUploaded }) {
  const { orgSlug } = useOrg();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId || (folders[0]?._id ?? ''));
  const [tagIds, setTagIds] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFolderId(defaultFolderId || (folders[0]?._id ?? '')); }, [defaultFolderId, folders]);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_MIME.has(f.type)) {
      toast({ title: 'Unsupported file type', description: f.type || 'unknown', variant: 'error' });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast({ title: 'File too large', description: `Max ${MAX_BYTES / 1024 / 1024} MB`, variant: 'error' });
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  function toggleTag(id) {
    setTagIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast({ title: 'Choose a file first', variant: 'error' });
    if (!folderId) return toast({ title: 'Pick a folder', variant: 'error' });
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (name) fd.append('name', name);
      if (description) fd.append('description', description);
      fd.append('folderId', folderId);
      if (tagIds.length) fd.append('tagIds', tagIds.join(','));
      const r = await documentsApi.upload(orgSlug, fd);
      if (!r.success) throw new Error(r.error || 'Upload failed');
      toast({ title: 'Uploaded', variant: 'success' });
      onUploaded?.(r.data);
      onClose();
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-dark-900 border border-dark-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-dark-100">Upload document</h2>
          <button type="button" onClick={onClose} className="text-dark-400 hover:text-dark-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">File <span className="text-dark-500">(max 50 MB)</span></label>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-dark-700 hover:border-rivvra-500/50 cursor-pointer text-sm text-dark-300">
              <Upload className="w-4 h-4" />
              {file ? <span className="text-dark-100">{file.name} <span className="text-dark-500">({Math.round(file.size / 1024)} KB)</span></span> : <span>Choose a file…</span>}
              <input type="file" className="hidden" onChange={onFile} />
            </label>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-100" placeholder="Display name" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Folder</label>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-100">
              {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-sm text-dark-500">No tags yet — admin can add them in Manage Tags</span>}
              {tags.map((t) => (
                <button key={t._id} type="button" onClick={() => toggleTag(t._id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${tagIds.includes(t._id) ? 'bg-rivvra-500/10 border-rivvra-500/40 text-rivvra-300' : 'bg-dark-800 border-dark-700 text-dark-300 hover:text-dark-100'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Description <span className="text-dark-500">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-100" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-dark-700">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg text-dark-300 hover:text-dark-100">Cancel</button>
          <button type="submit" disabled={busy || !file} className="px-4 py-1.5 text-sm rounded-lg bg-rivvra-500 hover:bg-rivvra-600 disabled:bg-dark-700 disabled:text-dark-500 text-white font-medium inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
