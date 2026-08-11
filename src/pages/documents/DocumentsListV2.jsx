import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import documentsApi from '../../utils/documentsApi';
import UploadDocumentModal from '../../components/documents/UploadDocumentModal';
import { Folder, Upload, FileText, Tag as TagIcon } from 'lucide-react';
import { formatDateUTC } from '../../utils/dateUtils';
import { fileIconFor } from '../../utils/fileIcon';
import { FilterBar, FilterChip, EmptyState, Button, Chip } from '../../components/ds';
import {
  useListParams, useSearchParamValue,
  SelectChipV2, GroupByChipV2, ArchivedToggleV2,
} from '../../components/platform/v2/listkit';

function formatSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const GROUP_OPTIONS = [
  { value: '', label: 'No grouping' },
  { value: 'folder', label: 'Folder' },
  { value: 'mimeType', label: 'File type' },
  { value: 'uploadedMonth', label: 'Uploaded month' },
];

function groupKeyFor(doc, groupBy, foldersById) {
  if (groupBy === 'folder') {
    const f = foldersById.get(String(doc.folderId));
    return f?.name || '(no folder)';
  }
  if (groupBy === 'mimeType') {
    const m = doc.currentVersion?.mimeType || 'unknown';
    if (m.startsWith('image/')) return 'Images';
    if (m === 'application/pdf') return 'PDF';
    if (m.includes('word') || m.includes('document')) return 'Word docs';
    if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'Spreadsheets';
    if (m.includes('zip')) return 'Archives';
    return m;
  }
  if (groupBy === 'uploadedMonth') {
    const iso = doc.currentVersion?.uploadedAt || doc.updatedAt;
    if (!iso) return '(unknown)';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return null;
}

/* v2 Documents list (Slice 3 Wave B) — same data flow and URL contract as
   DocumentsList.jsx (folder rail lives in the sidebar; ?folder= read
   directly). Control strip on ds FilterBar + listkit chips; the card grid
   stays a grid, token-styled. */
export default function DocumentsListV2() {
  const navigate = useNavigate();
  const { orgSlug, getAppRole } = useOrg();
  const { currentCompany, hydrated } = useCompany();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useListParams(['search', 'tag', 'archived', 'groupBy']);
  const [searchValue, setSearchValue] = useSearchParamValue('search');

  const isAdmin = getAppRole('documents') === 'admin';

  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const folderIdParam = searchParams.get('folder') || '';
  const folderId = folderIdParam && folders.some((f) => String(f._id) === folderIdParam)
    ? folderIdParam
    : '';
  const tagFilter = filters.tag || '';
  const q = filters.search || '';
  const includeArchived = filters.archived === '1';
  const groupBy = filters.groupBy || '';

  const updateFolder = useCallback((value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('folder', value); else next.delete('folder');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadCatalog = useCallback(async () => {
    if (!orgSlug || !currentCompany || !hydrated) return;
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
  }, [orgSlug, currentCompany, hydrated, toast]);

  const loadDocs = useCallback(async () => {
    if (!orgSlug || !currentCompany || !hydrated) return;
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
  }, [orgSlug, currentCompany, hydrated, folderId, tagFilter, q, includeArchived, toast]);

  useEffect(() => {
    if (!orgSlug || !currentCompany || !hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await documentsApi.list(orgSlug, {
          folderId: folderId || undefined,
          tagIds: tagFilter || undefined,
          q: q || undefined,
          includeArchived: 'true',
          limit: 1,
        });
        if (cancelled || !r.success) return;
        setArchivedCount(Math.max(0, (r.total || 0) - (includeArchived ? 0 : total)));
      } catch {/* non-fatal */}
    })();
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany, hydrated, folderId, tagFilter, q, total, includeArchived]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  useEffect(() => {
    if (!folders.length || !folderIdParam) return;
    const exists = folders.some((f) => String(f._id) === folderIdParam);
    if (!exists) updateFolder('');
  }, [folders, folderIdParam, updateFolder]);

  const tagsById = useMemo(() => new Map(tags.map((t) => [String(t._id), t])), [tags]);
  const foldersById = useMemo(() => new Map(folders.map((f) => [String(f._id), f])), [folders]);
  const tagOptions = useMemo(
    () => tags.filter((t) => !t.archived).map((t) => ({ value: String(t._id), label: t.name })),
    [tags],
  );

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map();
    for (const d of docs) {
      const k = groupKeyFor(d, groupBy, foldersById) || '(uncategorized)';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    const entries = Array.from(map.entries());
    if (groupBy === 'uploadedMonth') {
      entries.sort(([a], [b]) => {
        const da = a === '(unknown)' ? -Infinity : new Date(a).getTime();
        const db = b === '(unknown)' ? -Infinity : new Date(b).getTime();
        return db - da;
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }
    return entries;
  }, [docs, groupBy, foldersById]);

  if (!currentCompany) {
    return (
      <EmptyState icon={<FileText size={22} />} title="Pick a company" compact>
        Pick a company in the switcher to use Documents.
      </EmptyState>
    );
  }

  const selectedFolderName = folderId ? (folders.find((f) => String(f._id) === folderId)?.name || '') : '';
  const open = (d) => navigate(`/org/${orgSlug}/documents/${d._id}`);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <FilterBar
            search={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search by name, description, filename…"
            resultCount={total}
            noun="document"
            filters={[]}
            left={(
              <>
                {selectedFolderName && (
                  <FilterChip
                    label="Folder"
                    value={selectedFolderName}
                    active
                    onRemove={() => updateFolder('')}
                  >
                    <Folder size={12} />
                  </FilterChip>
                )}
                {tagOptions.length > 0 && (
                  <SelectChipV2 paramKey="tag" label="Tag" options={tagOptions} placeholder="No tags" />
                )}
                <GroupByChipV2 options={GROUP_OPTIONS} />
                <ArchivedToggleV2 activeCount={includeArchived ? null : total} archivedCount={archivedCount} />
              </>
            )}
          />
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Button variant="secondary" size="sm" iconLeft={<TagIcon size={14} />} onClick={() => navigate(`/org/${orgSlug}/documents/manage/tags`)}>
              Manage tags
            </Button>
            <Button size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowUpload(true)}>Upload</Button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ height: 84, borderRadius: 'var(--r-2)', background: 'var(--surface-2)', opacity: 0.6 - i * 0.07 }} />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title={`No documents${folderId ? ' in this folder' : ''} yet`}>
          {isAdmin ? 'Use Upload to add one.' : 'Documents shared with you will appear here.'}
        </EmptyState>
      ) : grouped ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {grouped.map(([groupName, groupDocs]) => (
            <section key={groupName}>
              <h3 style={{ font: "600 10.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', margin: '0 0 8px 2px' }}>
                {groupName} <span style={{ color: 'var(--fg-faint)' }}>· {groupDocs.length}</span>
              </h3>
              <DocsGridV2 docs={groupDocs} tagsById={tagsById} onOpen={open} />
            </section>
          ))}
        </div>
      ) : (
        <DocsGridV2 docs={docs} tagsById={tagsById} onOpen={open} />
      )}
      {!loading && total > docs.length && (
        <p style={{ marginTop: 14, textAlign: 'center', font: '450 12px/1.5 var(--font)', color: 'var(--fg-4)' }}>
          Showing first {docs.length} of {total}. Narrow the filter to see more.
        </p>
      )}

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

function DocsGridV2({ docs, tagsById, onOpen }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {docs.map((d) => <DocCardV2 key={d._id} doc={d} tagsById={tagsById} onOpen={onOpen} />)}
    </div>
  );
}

function DocCardV2({ doc: d, tagsById, onOpen }) {
  const mime = d.currentVersion?.mimeType;
  const isImage = typeof mime === 'string' && mime.startsWith('image/');
  const Icon = fileIconFor(mime);
  return (
    <button
      type="button"
      onClick={() => onOpen(d)}
      style={{
        textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12,
        borderRadius: 'var(--r-3)', background: 'var(--surface-1)',
        boxShadow: d.archived ? 'inset 0 0 0 1px var(--warn-soft, rgba(245,158,11,.3))' : 'inset 0 0 0 1px var(--line)',
        opacity: d.archived ? 0.75 : 1,
        transition: 'background var(--d-1) var(--e-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; }}
    >
      {isImage ? (
        <DocImageThumbV2 docId={d._id} alt={d.name} fallbackIcon={Icon} />
      ) : (
        <span style={{ width: 48, height: 48, borderRadius: 'var(--r-2)', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--fg-3)' }}>
          <Icon style={{ width: 22, height: 22 }} />
        </span>
      )}
      <span style={{ minWidth: 0, flex: 1, display: 'block' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: '550 13px/1.3 var(--font)', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
          {d.archived && <Chip tone="warn" uppercase>Archived</Chip>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3, font: '450 11.5px/1.4 var(--font)', color: 'var(--fg-4)' }}>
          <span>{formatSize(d.currentVersion?.size)}</span>
          <span>·</span>
          <span>{formatDateUTC(d.currentVersion?.uploadedAt || d.updatedAt)}</span>
          {(d.versions?.length || 0) > 0 && (
            <>
              <span>·</span>
              <span>{(d.versions.length || 0) + 1} versions</span>
            </>
          )}
        </span>
        {d.tagIds?.length > 0 && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {d.tagIds.slice(0, 4).map((tid) => {
              const t = tagsById.get(String(tid));
              if (!t) return null;
              return <Chip key={tid}>{t.name}</Chip>;
            })}
            {d.tagIds.length > 4 && <span style={{ font: '450 10.5px/1.4 var(--font)', color: 'var(--fg-4)' }}>+{d.tagIds.length - 4}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

function DocImageThumbV2({ docId, alt, fallbackIcon: FallbackIcon }) {
  const { orgSlug } = useOrg();
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!orgSlug || !docId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await documentsApi.previewUrl(orgSlug, docId);
        if (cancelled) return;
        const url = r?.data?.url || r?.url;
        if (r?.success && typeof url === 'string') setSrc(url); else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, docId]);
  if (failed || !src) {
    return (
      <span style={{ width: 48, height: 48, borderRadius: 'var(--r-2)', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--fg-3)' }}>
        {FallbackIcon ? <FallbackIcon style={{ width: 22, height: 22 }} /> : null}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      style={{ width: 48, height: 48, borderRadius: 'var(--r-2)', objectFit: 'cover', background: 'var(--surface-3)', flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}
