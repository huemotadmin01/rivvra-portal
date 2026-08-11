import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { downloadFile } from '../../utils/download';
import BulkImportModal from '../../components/BulkImportModal';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Chip, Avatar } from '../../components/ds';
import {
  useListParams, usePageParam, useSearchParamValue,
  SelectChipV2, ArchivedToggleV2, PageHeaderV2,
} from '../../components/platform/v2/listkit';
import { Plus, Users, Building2, Download, Loader2, Upload } from 'lucide-react';

const PAGE_SIZE = 25;

// Same import-field config as the legacy page — the modal is reused as-is.
const CONTACT_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'contact', 'contact name', 'company name', 'full name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'telephone', 'tel'] },
  { key: 'mobile', label: 'Mobile', required: false, aliases: ['mobile', 'mobile number', 'cell'] },
  { key: 'jobTitle', label: 'Job Title', required: false, aliases: ['job title', 'jobtitle', 'designation', 'role', 'position'] },
  { key: 'website', label: 'Website', required: false, aliases: ['website', 'url', 'web', 'site'] },
  { key: 'type', label: 'Type (company/individual)', required: false, aliases: ['type', 'contact type'] },
];

const SORTABLE_KEYS = ['name', 'email', 'type', 'createdAt'];

/* v2 Contacts list (Slice 2) — same data flow and URL semantics as
   ContactsList.jsx, rendered on ds DataTable + FilterBar. */
export default function ContactsListV2({ filterType }) {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useListParams(['search', 'type', 'tag', 'salesperson', 'archived']);
  const [page, setPage] = usePageParam();
  const [searchValue, setSearchValue] = useSearchParamValue('search');

  // Sort lives in the URL as `sort=key` / `sort=-key` — same as legacy.
  const sortParam = searchParams.get('sort') || 'name';
  const sortDir = sortParam.startsWith('-') ? 'desc' : 'asc';
  const rawKey = sortParam.replace(/^-/, '');
  const activeSortKey = SORTABLE_KEYS.includes(rawKey) ? rawKey : 'name';
  const dsSort = { key: activeSortKey, dir: sortDir };
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) np.delete('sort');
    else np.set('sort', next.dir === 'desc' ? `-${next.key}` : next.key);
    np.delete('page');
    setSearchParams(np);
  };

  const effectiveType = filterType !== undefined ? filterType : (filterParams.type || '');

  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tags, setTags] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [showImport, setShowImport] = useState(false);

  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    setTags([]);
    setSalespersons([]);
    Promise.all([
      contactsApi.listTags(orgSlug).catch(() => ({ success: false })),
      contactsApi.listSalespersons(orgSlug).catch(() => ({ success: false })),
    ]).then(([tagRes, spRes]) => {
      if (cancelled) return;
      if (tagRes.success) setTags(tagRes.tags || []);
      if (spRes.success) setSalespersons(spRes.salespersons || []);
    });
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  const fetchContacts = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    let aborted = false;
    try {
      const res = await contactsApi.list(orgSlug, {
        page,
        limit: PAGE_SIZE,
        ...filterParams,
        type: effectiveType,
        sort: sortDir === 'desc' ? `-${activeSortKey}` : activeSortKey,
        _requestKey: 'contacts:list',
      });
      if (res.success) {
        setContacts(res.contacts || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      console.error('Failed to load contacts:', err);
      showToast('Failed to load contacts', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, JSON.stringify(filterParams), effectiveType, activeSortKey, sortDir, showToast]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Page-clamp guard — same rationale as legacy (URL can outlive the data).
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    contactsApi.list(orgSlug, { ...filterParams, type: effectiveType, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined }), effectiveType]);

  const handleExport = async () => {
    if (!orgSlug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filterParams).forEach(([k, v]) => { if (v) params.set(k, v); });
      if (effectiveType) params.set('type', effectiveType);
      const qs = params.toString();
      const today = new Date().toISOString().slice(0, 10);
      await downloadFile(
        `/api/org/${orgSlug}/contacts/export.csv${qs ? '?' + qs : ''}`,
        `contacts_${today}.csv`,
      );
    } catch (err) {
      showToast(err?.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const typeOptions = [
    { value: 'company', label: 'Companies' },
    { value: 'individual', label: 'Individuals' },
  ];
  const tagOptions = tags.map((t) => ({ value: t._id, label: t.name }));
  const salespersonOptions = salespersons.map((sp) => ({ value: sp._id, label: sp.name }));
  const hasFilters = Object.values(filterParams).some(Boolean);

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, width: 260,
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {c.type === 'company'
            ? (
              <span style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--info-soft, rgba(59,130,246,.14))', color: 'var(--info, #3b82f6)' }}>
                <Building2 size={13} />
              </span>
            )
            : <Avatar name={c.name} size="sm" />}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.jobTitle && <span style={{ display: 'block', font: '450 11.5px/1.3 var(--font)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.jobTitle}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'email', header: 'Email', sortable: true, width: 220,
      render: (c) => c.email
        ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>{c.email}</a>
        : null,
    },
    {
      key: 'phone', header: 'Phone', width: 140,
      render: (c) => c.phone
        ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--fg-2)' }}>{c.phone}</a>
        : null,
    },
    {
      key: 'type', header: 'Type', sortable: true, width: 170,
      render: (c) => (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          <Chip tone={c.type === 'company' ? 'info' : 'brand'}>{c.type === 'company' ? 'Company' : 'Individual'}</Chip>
          {c.isCustomer && <Chip tone="neutral">Customer</Chip>}
          {c.isSupplier && <Chip tone="warn">Supplier</Chip>}
        </span>
      ),
    },
    { key: 'parentCompanyName', header: 'Company', muted: true, width: 160 },
    { key: 'salespersonName', header: 'Salesperson', muted: true, width: 140 },
    { key: 'city', header: 'City', muted: true, width: 110, render: (c) => c.address?.city || null },
    {
      key: 'tags', header: 'Tags', width: 150,
      render: (c) => {
        const names = c.tagNames || [];
        if (!names.length) return null;
        return (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {names.slice(0, 2).map((t, i) => <Chip key={i}>{t}</Chip>)}
            {names.length > 2 && <span style={{ color: 'var(--fg-4)', font: '450 11.5px/1.4 var(--font)' }}>+{names.length - 2}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeaderV2
        title="Contacts"
        sub={`${total} ${total === 1 ? 'contact' : 'contacts'} total`}
        actions={isAdmin && (
          <>
            <Button variant="secondary" size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowImport(true)}>Import</Button>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate(orgPath(`/contacts/new-record${filterType ? `?type=${filterType}` : ''}`))}>New Contact</Button>
          </>
        )}
      />

      {isAdmin && (
        <BulkImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          title="Import Contacts"
          itemNoun="contact"
          templateName="contacts-import-template.csv"
          fields={CONTACT_IMPORT_FIELDS}
          onImport={(rows) => contactsApi.bulkImport(orgSlug, rows)}
          onDone={() => fetchContacts()}
        />
      )}

      <FilterBar
        search={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search by name, email, or phone…"
        resultCount={total}
        noun="contact"
        onClearAll={hasFilters ? () => setSearchParams(new URLSearchParams()) : undefined}
        filters={[]}
        left={(
          <>
            {filterType === undefined && <SelectChipV2 paramKey="type" label="Type" options={typeOptions} />}
            <SelectChipV2 paramKey="tag" label="Tag" options={tagOptions} placeholder="No tags" />
            <SelectChipV2 paramKey="salesperson" label="Salesperson" options={salespersonOptions} placeholder="No salespersons" />
            <ArchivedToggleV2 activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
          </>
        )}
        style={{ marginBottom: 14 }}
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={exporting || total === 0}
          iconLeft={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          onClick={handleExport}
          title="Download the current filtered list as a CSV file"
        >
          Export CSV
        </Button>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={contacts}
        rowKey="_id"
        loading={loading}
        sort={dsSort}
        onSortChange={onSortChange}
        onRowClick={(c) => navigate(orgPath(`/contacts/${c._id}`))}
        empty={(
          <EmptyState
            icon={<Users size={22} />}
            title="No contacts found"
            actions={hasFilters && (
              <Button variant="secondary" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>Clear all filters</Button>
            )}
          >
            {hasFilters ? 'Try adjusting your search or filters.' : 'Add your first contact to get started.'}
          </EmptyState>
        )}
      />

      {total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          noun="contact"
        />
      )}
    </div>
  );
}
