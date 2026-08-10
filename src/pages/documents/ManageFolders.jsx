import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import { ArrowLeft, Plus, Loader2, Archive, ArchiveRestore, Save } from 'lucide-react';

export default function ManageFolders() {
  const navigate = useNavigate();
  const { orgSlug } = useOrg();
  const { currentCompany } = useCompany();
  const { toast } = useToast();

  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState({}); // { [id]: name }

  const load = useCallback(async () => {
    if (!orgSlug || !currentCompany) return;
    setLoading(true);
    try {
      const r = await documentsApi.listFolders(orgSlug, { includeArchived: true });
      if (r.success) setFolders(r.data || []);
    } finally { setLoading(false); }
  }, [orgSlug, currentCompany]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await documentsApi.createFolder(orgSlug, { name: newName.trim() });
      if (!r.success) throw new Error(r.error || 'Failed');
      setNewName('');
      await load();
    } catch (e) {
      toast({ title: 'Create failed', description: e.message, variant: 'error' });
    } finally { setBusy(false); }
  }

  async function save(f) {
    const name = editing[f._id]?.trim();
    if (!name || name === f.name) { setEditing({ ...editing, [f._id]: undefined }); return; }
    setBusy(true);
    try {
      const r = await documentsApi.updateFolder(orgSlug, f._id, { name });
      if (!r.success) throw new Error(r.error || 'Failed');
      setEditing({ ...editing, [f._id]: undefined });
      await load();
    } catch (e) {
      toast({ title: 'Rename failed', description: e.message, variant: 'error' });
    } finally { setBusy(false); }
  }

  async function toggleArchive(f) {
    setBusy(true);
    try {
      const r = f.archived ? await documentsApi.unarchiveFolder(orgSlug, f._id) : await documentsApi.archiveFolder(orgSlug, f._id);
      if (!r.success) throw new Error(r.error || 'Failed');
      await load();
    } catch (e) {
      toast({ title: 'Action failed', description: e.message, variant: 'error' });
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <button onClick={() => navigate(`/org/${orgSlug}/documents`)} className="text-sm text-dark-400 hover:text-dark-200 inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Documents
      </button>
      <h1 className="text-xl font-semibold text-dark-100 mb-4">Manage folders</h1>

      <div className="bg-dark-900 border border-dark-800 rounded-xl">
        <div className="px-4 py-3 border-b border-dark-800 flex items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            placeholder="New folder name…" className="flex-1 px-3 py-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-100 text-sm" />
          <button onClick={create} disabled={busy || !newName.trim()} className="px-3 py-2 rounded-lg text-sm bg-rivvra-500 hover:bg-rivvra-600 text-white inline-flex items-center gap-1.5 disabled:bg-dark-700 disabled:text-dark-500">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-dark-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</div>
        ) : folders.length === 0 ? (
          <div className="p-8 text-center text-dark-500 text-sm">No folders yet. Create the first one above.</div>
        ) : (
          <ul className="divide-y divide-dark-800">
            {folders.map((f) => (
              <li key={f._id} className="px-4 py-2.5 flex items-center gap-2">
                {editing[f._id] !== undefined ? (
                  <input autoFocus value={editing[f._id]} onChange={(e) => setEditing({ ...editing, [f._id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(f); if (e.key === 'Escape') setEditing({ ...editing, [f._id]: undefined }); }}
                    className="flex-1 px-2 py-1 rounded bg-dark-800 border border-dark-700 text-dark-100 text-sm" />
                ) : (
                  <button onClick={() => setEditing({ ...editing, [f._id]: f.name })}
                    className="flex-1 min-w-0 truncate text-left text-sm text-dark-100 hover:text-rivvra-300">
                    {f.name}
                    {f.archived && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">archived</span>}
                  </button>
                )}
                {editing[f._id] !== undefined && (
                  <button onClick={() => save(f)} className="px-2 py-1 text-xs rounded bg-rivvra-500 text-white inline-flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                )}
                <button onClick={() => toggleArchive(f)} disabled={busy} className="text-dark-400 hover:text-dark-200" title={f.archived ? 'Unarchive' : 'Archive'}>
                  {f.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-dark-500">Note: a folder must be empty (no active documents) before it can be archived.</p>
    </div>
  );
}
