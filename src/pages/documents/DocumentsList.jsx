import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import UploadDocumentModal from '../../components/documents/UploadDocumentModal';
import {
  Loader2, FolderOpen, Folder, Upload, Search, Plus, Settings,
  FileText, Image as ImageIcon, FileArchive, Archive, ArchiveRestore,
  Tag as TagIcon, X,
} from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';

function fileIcon(mime) {
  if (!mime) return FileText;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.includes('zip')) return FileArchive;
  return FileText;
}

function formatSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsList() {
  const navigate = useNavigate();
  const { orgSlug, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = getAppRole('documents') === 'admin';

  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const folderId = searchParams.get('folder') || '';
  const tagFilter = searchParams.get('tag') || '';
  const q = searchParams.get('q') || '';
  const includeArchived = searchParams.get('archived') === '1';

  const updateParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadCatalog = useCallback(async () => {
    if (!orgSlug || !currentCompany) return;
    try {
      const [fr, tr] = await Promise.all([
        documentsApi.listFolders(orgSlug),
        documentsApi.listTags(orgSlug),
      ]);
      if (fr.success) setFolders(fr.data || []);
      if (tr.success) setTags(tr.data || []);
    } catch (e) {
      toast({ title: 'Failed to load folders/tags', description: e.message, variant: 'error' });
    }
  }, [orgSlug, currentCompany, toast]);

  const loadDocs = useCallback(async () => {
    if (!orgSlug || !currentCompany) return;
    setLoading(true);
    try {
      const r = await documentsApi.list(orgSlug, {
        folderId: folderId || undefined,
        tagIds: tagFilter || undefined,
        q: q || undefined,
        includeArchived: includeArchived ? 'true' : undefined,
        limit: 200,
      });
      if (!r.success) throw new Error(r.error || 'Failed to list');
      setDocs(r.data || []);
      setTotal(r.total || 0);
    } catch (e) {
      toast({ title: 'Failed to load documents', description: e.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [orgSlug, currentCompany, folderId, tagFilter, q, includeArchived, toast]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  const tagsById = useMemo(() => new Map(tags.map((t) => [String(t._id), t])), [tags]);

  if (!currentCompany) {
    return (
      <div className="p-8 text-center text-dark-300">
        Pick a company in the switcher to use Documents.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-dark-950">
      {/* Sidebar — folders */}
      <aside className="w-64 border-r border-dark-800 bg-dark-900 flex flex-col">
        <div className="px-4 py-3 border-b border-dark-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dark-100">Folders</h2>
          {isAdmin && (
            <button onClick={() => navigate(`/org/${orgSlug}/documents/manage/folders`)} className="text-dark-400 hover:text-dark-200" title="Manage folders">
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <button onClick={() => updateParam('folder', '')}
            className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm transition ${!folderId ? 'bg-rivvra-500/10 text-rivvra-300' : 'text-dark-300 hover:bg-dark-800'}`}>
            <FolderOpen className="w-4 h-4" /> All documents
          </button>
          {folders.length === 0 && (
            <div className="px-4 py-3 text-xs text-dark-500">
              No folders yet.{isAdmin && ' Create one in Manage Folders.'}
            </div>
          )}
          {folders.map((f) => (
            <button key={f._id} onClick={() => updateParam('folder', f._id)}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm transition ${folderId === String(f._id) ? 'bg-rivvra-500/10 text-rivvra-300' : 'text-dark-300 hover:bg-dark-800'}`}>
              <Folder className="w-4 h-4" /> <span className="truncate">{f.name}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-dark-800 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              defaultValue={q}
              onKeyDown={(e) => { if (e.key === 'Enter') updateParam('q', e.target.value); }}
              placeholder="Search by name, description, filename…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-100 text-sm"
            />
          </div>
          <label className="text-sm text-dark-300 inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={includeArchived} onChange={(e) => updateParam('archived', e.target.checked ? '1' : '')} />
            Show archived
          </label>
          {isAdmin && (
            <>
              <button onClick={() => navigate(`/org/${orgSlug}/documents/manage/tags`)} className="px-3 py-2 rounded-lg text-sm text-dark-300 hover:text-dark-100 hover:bg-dark-800 inline-flex items-center gap-1.5">
                <TagIcon className="w-4 h-4" /> Manage tags
              </button>
              <button onClick={() => setShowUpload(true)} className="px-3 py-2 rounded-lg text-sm bg-rivvra-500 hover:bg-rivvra-600 text-white font-medium inline-flex items-center gap-1.5">
                <Upload className="w-4 h-4" /> Upload
              </button>
            </>
          )}
        </header>

        {/* Tag filter chips */}
        {tags.length > 0 && (
          <div className="px-6 py-2 border-b border-dark-800 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-dark-500 mr-1">Tag:</span>
            <button onClick={() => updateParam('tag', '')}
              className={`px-2.5 py-1 rounded-full text-xs border ${!tagFilter ? 'bg-rivvra-500/10 border-rivvra-500/40 text-rivvra-300' : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-dark-100'}`}>
              All
            </button>
            {tags.map((t) => (
              <button key={t._id} onClick={() => updateParam('tag', String(t._id))}
                className={`px-2.5 py-1 rounded-full text-xs border ${tagFilter === String(t._id) ? 'bg-rivvra-500/10 border-rivvra-500/40 text-rivvra-300' : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-dark-100'}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <section className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-dark-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : docs.length === 0 ? (
            <div className="text-center text-dark-400 py-12">
              <FileText className="w-10 h-10 mx-auto mb-3 text-dark-700" />
              <p className="text-sm">No documents{folderId ? ' in this folder' : ''} yet.</p>
              {isAdmin && <p className="text-xs mt-1 text-dark-500">Use Upload to add one.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {docs.map((d) => {
                const Icon = fileIcon(d.currentVersion?.mimeType);
                return (
                  <button key={d._id}
                    onClick={() => navigate(`/org/${orgSlug}/documents/${d._id}`)}
                    className={`text-left flex items-start gap-3 p-3 rounded-lg border bg-dark-900 hover:bg-dark-800 transition ${d.archived ? 'border-amber-500/30 opacity-70' : 'border-dark-800'}`}>
                    <Icon className="w-5 h-5 mt-0.5 text-dark-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-dark-100 truncate">{d.name}</h3>
                        {d.archived && <span className="text-[10px] uppercase tracking-wider text-amber-400">Archived</span>}
                      </div>
                      <div className="text-xs text-dark-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{formatSize(d.currentVersion?.size)}</span>
                        <span>·</span>
                        <span>{formatDateUTC(d.currentVersion?.uploadedAt || d.updatedAt)}</span>
                        {(d.versions?.length || 0) > 0 && (
                          <>
                            <span>·</span>
                            <span>{(d.versions.length || 0) + 1} versions</span>
                          </>
                        )}
                      </div>
                      {d.tagIds?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.tagIds.slice(0, 4).map((tid) => {
                            const t = tagsById.get(String(tid));
                            if (!t) return null;
                            return <span key={tid} className="px-1.5 py-0.5 rounded text-[10px] bg-dark-800 text-dark-300 border border-dark-700">{t.name}</span>;
                          })}
                          {d.tagIds.length > 4 && <span className="text-[10px] text-dark-500">+{d.tagIds.length - 4}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!loading && total > docs.length && (
            <p className="mt-4 text-center text-xs text-dark-500">Showing first {docs.length} of {total}. Narrow the filter to see more.</p>
          )}
        </section>
      </main>

      {showUpload && (
        <UploadDocumentModal
          folders={folders.filter((f) => !f.archived)}
          tags={tags.filter((t) => !t.archived)}
          defaultFolderId={folderId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => loadDocs()}
        />
      )}
    </div>
  );
}
