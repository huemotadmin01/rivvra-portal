import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { downloadFile } from '../../utils/download';
import {
  Search, Plus, Users, Building2, User,
  ChevronLeft, ChevronRight, ChevronDown, X, Download, Loader2,
} from 'lucide-react';
import { TableSkeleton } from '../../components/Skeletons';

const PAGE_SIZE = 25;

/* ── Inline FilterChip component ─────────────────────────────────────── */
function FilterChip({ label, value, options, isOpen, onToggle, onSelect }) {
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption && value ? selectedOption.label : label;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
            : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200'
        }`}
      >
        {displayLabel}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={onToggle} />

          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1.5 min-w-[180px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function ContactsList({ filterType }) {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(filterType || '');
  const [tagFilter, setTagFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [archivedFilter, setArchivedFilter] = useState('');
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  const [tags, setTags] = useState([]);
  const [salespersons, setSalespersons] = useState([]);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  // Active filter count
  const activeFilterCount = [typeFilter, tagFilter, salespersonFilter, archivedFilter].filter(Boolean).length;

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
  const fetchContacts = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    // Reset on company switch so the previous company's rows don't linger
    // if the new fetch returns nothing.
    setContacts([]);
    setTotal(0);
    setTotalPages(1);
    try {
      const res = await contactsApi.list(orgSlug, {
        page: params.page || page,
        limit: PAGE_SIZE,
        search: params.search !== undefined ? params.search : search,
        type: params.type !== undefined ? params.type : typeFilter,
        tag: params.tag !== undefined ? params.tag : tagFilter,
        salesperson: params.salesperson !== undefined ? params.salesperson : salespersonFilter,
        archived: params.archived !== undefined ? params.archived : archivedFilter,
      });
      if (res.success) {
        setContacts(res.contacts || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
      showToast('Failed to load contacts', 'error');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, currentCompany?._id, page, search, typeFilter, tagFilter, salespersonFilter, archivedFilter, showToast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Sync filterType prop when it changes
  useEffect(() => {
    if (filterType !== undefined) {
      setTypeFilter(filterType);
      setPage(1);
    }
  }, [filterType]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchContacts({ search: value, page: 1 });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFilterSelect = (setter) => (val) => {
    setter(val);
    setPage(1);
    setOpenFilter(null);
  };

  const clearAllFilters = () => {
    setTypeFilter('');
    setTagFilter('');
    setSalespersonFilter('');
    setArchivedFilter('');
    setPage(1);
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

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
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!orgSlug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      if (tagFilter) params.set('tag', tagFilter);
      if (salespersonFilter) params.set('salesperson', salespersonFilter);
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

  // Filter options
  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'company', label: 'Companies' },
    { value: 'individual', label: 'Individuals' },
  ];

  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...tags.map((t) => ({ value: t._id, label: t.name })),
  ];

  const salespersonOptions = [
    { value: '', label: 'All Salespersons' },
    ...salespersons.map((sp) => ({ value: sp._id, label: sp.name })),
  ];

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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search contacts"
        />
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Type"
          value={typeFilter}
          options={typeOptions}
          isOpen={openFilter === 'type'}
          onToggle={() => toggleFilter('type')}
          onSelect={handleFilterSelect(setTypeFilter)}
        />
        <FilterChip
          label="Tag"
          value={tagFilter}
          options={tagOptions}
          isOpen={openFilter === 'tag'}
          onToggle={() => toggleFilter('tag')}
          onSelect={handleFilterSelect(setTagFilter)}
        />
        <FilterChip
          label="Salesperson"
          value={salespersonFilter}
          options={salespersonOptions}
          isOpen={openFilter === 'salesperson'}
          onToggle={() => toggleFilter('salesperson')}
          onSelect={handleFilterSelect(setSalespersonFilter)}
        />
        <FilterChip
          label="Active"
          value={archivedFilter}
          options={[
            { value: '', label: 'Active' },
            { value: '1', label: 'Archived' },
          ]}
          isOpen={openFilter === 'archived'}
          onToggle={() => toggleFilter('archived')}
          onSelect={handleFilterSelect(setArchivedFilter)}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-dark-400 hover:text-white transition-colors rounded-lg hover:bg-dark-800"
          >
            <X className="w-3.5 h-3.5" />
            Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}
          </button>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || total === 0}
          title="Download the current filtered list as a CSV file"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-dark-300 hover:text-white transition-colors rounded-lg hover:bg-dark-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="animate-pulse"><TableSkeleton rows={8} cols={5} /></div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No contacts found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search || typeFilter || tagFilter
              ? 'Try adjusting your search or filters.'
              : 'Add your first contact to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Type</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Company</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Salesperson</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">City</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr
                      key={contact._id}
                      onClick={() => navigate(orgPath(`/contacts/${contact._id}`))}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
