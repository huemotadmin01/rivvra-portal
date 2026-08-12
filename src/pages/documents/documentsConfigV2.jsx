import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import { Button, ConfigList } from '../../components/ds';
import { Archive, ArchiveRestore, ArrowLeft, Folder, Tag } from 'lucide-react';

/* v2 Documents master-data pages (phase 6a).
 *
 * Tags and Folders were two near-identical hand-rolled lists — an inline
 * "add" row, click-to-rename, and an archive toggle. Both collapse onto ds
 * ConfigList; the only differences are the noun, the icon and which four API
 * calls to make, so they share one component rather than being forked.
 *
 * These archive rather than delete, which ConfigList supports via rowActions
 * plus `onDelete` omitted — omitting it hides every delete affordance, so
 * there is no way to reach a destructive path that the API doesn't offer. */
function DocumentsMasterList({ kind }) {
  const navigate = useNavigate();
  const { orgSlug } = useOrg();
  const { currentCompany } = useCompany();
  const { toast } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const cfg = kind === 'folder'
    ? {
      noun: 'folder', title: 'Manage folders', icon: <Folder size={20} />,
      sub: 'Folders group documents for browsing and filtering',
      list: (o) => documentsApi.listFolders(o, { includeArchived: true }),
      create: documentsApi.createFolder, update: documentsApi.updateFolder,
      archive: documentsApi.archiveFolder, unarchive: documentsApi.unarchiveFolder,
      placeholder: 'e.g. Contracts',
    }
    : {
      noun: 'tag', title: 'Manage tags', icon: <Tag size={20} />,
      sub: 'Labels for organizing and filtering documents',
      list: (o) => documentsApi.listTags(o, { includeArchived: true }),
      create: documentsApi.createTag, update: documentsApi.updateTag,
      archive: documentsApi.archiveTag, unarchive: documentsApi.unarchiveTag,
      placeholder: 'e.g. Signed',
    };

  const load = useCallback(async () => {
    if (!orgSlug || !currentCompany) return;
    setLoading(true);
    try {
      const r = await cfg.list(orgSlug);
      if (r.success) setItems(r.data || []);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, currentCompany, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const toggleArchive = async (item) => {
    setBusy(true);
    try {
      const call = item.archived ? cfg.unarchive : cfg.archive;
      const r = await call(orgSlug, item._id);
      if (!r.success) throw new Error(r.error || 'Failed');
      await load();
      toast({ title: item.archived ? 'Restored' : 'Archived', variant: 'success' });
    } catch (e) {
      toast({ title: 'Action failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 760 }}>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<ArrowLeft size={14} />}
        onClick={() => navigate(`/org/${orgSlug}/documents`)}
        style={{ marginBottom: 12, paddingLeft: 0 }}
      >
        Back to Documents
      </Button>

      <ConfigList
        icon={cfg.icon}
        title={cfg.title}
        sub={cfg.sub}
        noun={cfg.noun}
        items={items}
        loading={loading}
        searchable
        searchKeys={['name']}
        // No onDelete: the API archives, it does not delete. Passing one would
        // offer a destructive action the server can't honour.
        fields={[{ key: 'name', label: 'Name', required: true, placeholder: cfg.placeholder, autoFocus: true }]}
        onCreate={async (values) => {
          const r = await cfg.create(orgSlug, { name: values.name.trim() });
          if (!r.success) throw new Error(r.error || 'Failed to create');
          await load();
          toast({ title: `${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} created`, variant: 'success' });
        }}
        onUpdate={async (item, values) => {
          const r = await cfg.update(orgSlug, item._id, { name: values.name.trim() });
          if (!r.success) throw new Error(r.error || 'Failed to rename');
          await load();
          toast({ title: 'Renamed', variant: 'success' });
        }}
        rowActions={(item) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            title={item.archived ? 'Restore' : 'Archive'}
            aria-label={`${item.archived ? 'Restore' : 'Archive'} ${item.name}`}
            onClick={() => toggleArchive(item)}
            iconLeft={item.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          >
            {item.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        emptyText={`No ${cfg.noun}s yet. Create the first one with New.`}
      />
    </div>
  );
}

export function ManageTagsV2() { return <DocumentsMasterList kind="tag" />; }
export function ManageFoldersV2() { return <DocumentsMasterList kind="folder" />; }
