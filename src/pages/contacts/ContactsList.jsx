import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { downloadFile } from '../../utils/download';
import FilterBar, { FilterChip, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import {
  Plus, Users, Building2,
  ChevronLeft, ChevronRight, Download, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { TableSkeleton } from '../../components/Skeletons';

const PAGE_SIZE = 25;

// 2026-05-17 CONTACTS-D: clickable header that flips asc/desc on the active
// column or switches to the new column (defaults to asc).
function SortableTh({ label, sortKey, activeSortKey, sortDir, onSort, className = '' }) {
  const isActive = activeSortKey === sortKey;
  const Icon = !isActive ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`text-left px-4 py-3 text-dark-400 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1.5 hover:text-white transition-colors"
      >
        {label}
        <Icon size={12} className={isActive ? 'text-rivvra-400' : 'text-dark-500'} />
      </button>
    </th>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function ContactsList({ filterType }) {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams(['search', 'type', 'tag', 'salesperson', 'archived']);
  // 2026-05-17 CONTACTS-B: NaN-safe page parse. parseInt('abc') / negative
  // values returned NaN, which broke prev-button disabled state.
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // 2026-05-17 CONTACTS-D: sortable headers. Sort lives in the URL so it's
  // bookmarkable + survives refresh. Whitelist mirrors API.
  const SORTABLE_KEYS = ['name', 'email', 'type', 'createdAt'];
  const sortParam = searchParams.get('sort') || 'name';
  const sortDir = sortParam.startsWith('-') ? 'desc' : 'asc';
  const sortKey = sortParam.replace(/^-/, '');
  const activeSortKey = SORTABLE_KEYS.includes(sortKey) ? sortKey : 'name';
  const setSort = (key) => {
    const np = new URLSearchParams(searchParams);
    if (activeSortKey === key) {
      np.set('sort', sortDir === 'asc' ? `-${key}` : key);
    } else {
      np.set('sort', key);
    }
    np.delete('page');
    setSearchParams(np);
  };

  // When the route is locked to a specific contact type (Companies / Individuals),
  // the prop wins over any URL `type` param.
  const effectiveType = filterType !== undefined ? filterType : (filterParams.type || '');

  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Dropdown data
  const [tags, setTags] = useState([]);
  const [salespersons, setSalespersons] = useState([]);

  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // ── Fetch tags + salespersons once ──────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    // Reset on company switch so the previous company's tag/salesperson
    // dropdowns don't linger if the new fetch returns nothing.
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

  // ── Fetch contacts ──────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    if (!orgSlug) return;
    // 2026-05-17 CONTACTS-B: keep prior list visible while refetching — no
    // more blank-flash on filter keystrokes. _requestKey dedup auto-aborts
    // stale in-flight requests so race-late responses can't overwrite a
    // newer fetch.
    setLoading(true);
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
      if (err?.name === 'AbortError') return;
      console.error('Failed to load contacts:', err);
      showToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, JSON.stringify(filterParams), effectiveType, activeSortKey, sortDir, showToast]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // 2026-05-17 CONTACTS-B: page-clamp guard. When data shrinks (filter
  // wipes most rows, company switch, last-page row archived) the URL
  // still carries old page=N and the list shows empty. Auto-rewind.
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

  // Archived count for the segmented Active/Archived chip — refreshes when
  // any non-archive filter changes.
  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    contactsApi.list(orgSlug, { ...filterParams, type: effectiveType, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined }), effectiveType]);

  // Initials helper
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  };

  // CSV export — mirrors fetchContacts' filter chain so the export rows
  // match what the user sees on screen.
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

  // Filter options for the chip dropdowns
  const typeOptions = [
    { value: 'company', label: 'Companies' },
    { value: 'individual', label: 'Individuals' },
  ];
  const tagOptions = tags.map((t) => ({ value: t._id, label: t.name }));
  const salespersonOptions = salespersons.map((sp) => ({ value: sp._id, label: sp.name }));

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'contact' : 'contacts'} total
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => navigate(orgPath(`/contacts/new-record${filterType ? `?type=${filterType}` : ''}`))}
            className="btn-primary flex items-center gap-2 self-start"
          >
            <Plus size={16} />
            New Contact
          </button>
        )}
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <FilterBar searchPlaceholder="Search by name, email, or phone…">
            {/* Hide the Type chip when the route prop locks the contact type. */}
            {filterType === undefined && (
              <FilterChip type="select" paramKey="type" label="Type" options={typeOptions} />
            )}
            <FilterChip type="select" paramKey="tag" label="Tag" options={tagOptions} />
            <FilterChip type="select" paramKey="salesperson" label="Salesperson" options={salespersonOptions} />
            <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
          </FilterBar>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || total === 0}
          title="Download the current filtered list as a CSV file"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-dark-300 hover:text-white transition-colors rounded-lg hover:bg-dark-800 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="animate-pulse"><TableSkeleton rows={8} cols={5} /></div>
      ) : contacts.length === 0 ? (
        // 2026-05-17 CONTACTS-B: Clear-filters affordance on filter-induced
        // empty state. Mirrors ATS / CRM pattern.
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No contacts found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm mb-4">
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
              : 'Add your first contact to get started.'}
          </p>
          {Object.values(filterParams).some(Boolean) && (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams())}
              className="text-xs text-rivvra-400 hover:text-rivvra-300 underline underline-offset-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <SortableTh label="Name" sortKey="name" activeSortKey={activeSortKey} sortDir={sortDir} onSort={setSort} />
                    <SortableTh label="Email" sortKey="email" activeSortKey={activeSortKey} sortDir={sortDir} onSort={setSort} className="hidden md:table-cell" />
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Phone</th>
                    <SortableTh label="Type" sortKey="type" activeSortKey={activeSortKey} sortDir={sortDir} onSort={setSort} className="hidden sm:table-cell" />
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Company</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Salesperson</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">City</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    // 2026-05-17 CONTACTS-B: per-row a11y. <tr> behaves
                    // like a link; expose role+aria+keyboard so screen
                    // readers and keyboard users can use it. Same pattern
                    // shipped for ATS / CRM in earlier phases.
                    <tr
                      key={contact._id}
                      onClick={() => navigate(orgPath(`/contacts/${contact._id}`))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(orgPath(`/contacts/${contact._id}`));
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open contact: ${contact.name || 'Unnamed'}${contact.type === 'company' ? ' (company)' : ''}`}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors focus:outline-none focus:bg-dark-800/70 focus:ring-1 focus:ring-rivvra-500/40"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            contact.type === 'company'
                              ? 'bg-blue-500/10'
                              : 'bg-orange-500/10'
                          }`}>
                            {contact.type === 'company' ? (
                              <Building2 size={14} className="text-blue-400" />
                            ) : (
                              <span className="text-xs font-bold text-orange-400">
                                {getInitials(contact.name)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{contact.name}</p>
                            {contact.jobTitle && (
                              <p className="text-dark-500 text-xs truncate">{contact.jobTitle}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email — mailto link so the row click doesn't hijack it */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate block max-w-[200px] hover:text-rivvra-400 transition-colors"
                          >
                            {contact.email}
                          </a>
                        ) : (
                          <span className="text-dark-600">{'\u2014'}</span>
                        )}
                      </td>

                      {/* Phone — tel link */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {contact.phone ? (
                          <a
                            href={`tel:${contact.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-rivvra-400 transition-colors"
                          >
                            {contact.phone}
                          </a>
                        ) : (
                          <span className="text-dark-600">{'\u2014'}</span>
                        )}
                      </td>

                      {/* Type badge + Customer/Supplier */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            contact.type === 'company'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {contact.type === 'company' ? 'Company' : 'Individual'}
                          </span>
                          {contact.isCustomer && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400">
                              Customer
                            </span>
                          )}
                          {contact.isSupplier && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
                              Supplier
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Company (parent) */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {contact.parentCompanyName || '\u2014'}
                      </td>

                      {/* Salesperson */}
                      <td className="px-4 py-3 text-dark-300 hidden xl:table-cell">
                        {contact.salespersonName || '\u2014'}
                      </td>

                      {/* City */}
                      <td className="px-4 py-3 text-dark-300 hidden xl:table-cell">
                        {contact.address?.city || '\u2014'}
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(contact.tagNames || []).slice(0, 2).map((tag, i) => (
                            <span
                              key={i}
                              className="bg-dark-700 text-dark-300 text-xs px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {(contact.tagNames || []).length > 2 && (
                            <span className="text-dark-500 text-xs">
                              +{contact.tagNames.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                Showing {pageStart}{'\u2013'}{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? 'bg-rivvra-500 text-dark-950'
                            : 'text-dark-400 hover:text-white hover:bg-dark-800'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
