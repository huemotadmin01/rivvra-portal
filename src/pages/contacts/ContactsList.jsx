import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import {
  Search, Plus, Loader2, Users, Building2, User,
  ChevronLeft, ChevronRight, ChevronDown, X,
  Mail, Phone, MapPin, Tag,
} from 'lucide-react';

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

/* ── New Contact Modal ────────────────────────────────────────────────── */
const EMPTY_FORM = {
  type: 'individual',
  title: '',
  name: '',
  email: '',
  phone: '',
  mobile: '',
  website: '',
  jobTitle: '',
  parentCompany: '',
  street: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  country: '',
  tags: [],
  notes: '',
  isCustomer: false,
  isSupplier: false,
  salespersonId: '',
  gstTreatment: '',
  gstin: '',
  pan: '',
  countryCode: '',
};

const GST_TREATMENT_OPTIONS = [
  { value: '', label: 'Select GST Treatment' },
  { value: 'Registered Business - Regular', label: 'Registered Business - Regular' },
  { value: 'Registered Business - Composition', label: 'Registered Business - Composition' },
  { value: 'Unregistered Business', label: 'Unregistered Business' },
  { value: 'Consumer', label: 'Consumer' },
  { value: 'Overseas', label: 'Overseas' },
  { value: 'Special Economic Zone', label: 'Special Economic Zone' },
  { value: 'Deemed Export', label: 'Deemed Export' },
];

const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.'];

function NewContactModal({ show, onClose, onSaved, orgSlug, companies, tags, salespersons }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setForm(EMPTY_FORM);
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
    }
  }, [show]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tagId) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((t) => t !== tagId)
        : [...prev.tags, tagId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    // Tax field validation
    if (form.gstin.trim() && (form.gstin.trim().length !== 15 || !/^[0-9A-Z]{15}$/.test(form.gstin.trim()))) {
      showToast('GSTIN must be exactly 15 alphanumeric characters', 'error'); return;
    }
    if (form.pan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.trim())) {
      showToast('PAN must be in format ABCDE1234F', 'error'); return;
    }
    if (form.countryCode.trim() && !/^[A-Z]{2}$/.test(form.countryCode.trim())) {
      showToast('Country code must be a 2-letter ISO code (e.g., IN)', 'error'); return;
    }

    try {
      setSaving(true);
      const payload = {
        type: form.type,
        title: form.title,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        mobile: form.mobile.trim(),
        website: form.website.trim(),
        jobTitle: form.type === 'individual' ? form.jobTitle.trim() : '',
        parentCompanyId: form.type === 'individual' ? form.parentCompany : '',
        address: {
          street: form.street.trim(),
          street2: form.street2.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          country: form.country.trim(),
        },
        tags: form.tags,
        internalNotes: form.notes.trim(),
        isCustomer: form.isCustomer,
        isSupplier: form.isSupplier,
        salespersonId: form.salespersonId || '',
        gstTreatment: form.gstTreatment,
        gstin: form.gstin.trim(),
        pan: form.pan.trim(),
        countryCode: form.countryCode.trim(),
      };
      const res = await contactsApi.create(orgSlug, payload);
      if (res.success) {
        showToast('Contact created');
        onSaved();
        onClose();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg my-8"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <h3 id="contact-modal-title" className="text-lg font-semibold text-white">
            New Contact
          </h3>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Type</label>
            <div className="flex gap-2">
              {['individual', 'company'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleChange('type', t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    form.type === t
                      ? 'bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-400'
                      : 'bg-dark-700 border border-dark-600 text-dark-300 hover:text-white'
                  }`}
                >
                  {t === 'company' ? <Building2 size={14} /> : <User size={14} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Title & Name */}
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Title</label>
              <select
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="input-field"
              >
                <option value="">--</option>
                {TITLE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={form.type === 'company' ? 'Company name' : 'Full name'}
                className="input-field"
              />
            </div>
          </div>

          {/* Email & Phone row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@example.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+1 234 567 8900"
                className="input-field"
              />
            </div>
          </div>

          {/* Mobile & Website row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Mobile</label>
              <input
                type="text"
                value={form.mobile}
                onChange={(e) => handleChange('mobile', e.target.value)}
                placeholder="Mobile number"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Website</label>
              <input
                type="text"
                value={form.website}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="https://..."
                className="input-field"
              />
            </div>
          </div>

          {/* Individual-only fields */}
          {form.type === 'individual' && (
            <>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Job Title</label>
                <input
                  type="text"
                  value={form.jobTitle}
                  onChange={(e) => handleChange('jobTitle', e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Company</label>
                <select
                  value={form.parentCompany}
                  onChange={(e) => handleChange('parentCompany', e.target.value)}
                  className="input-field"
                >
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Address</label>
            <input
              type="text"
              value={form.street}
              onChange={(e) => handleChange('street', e.target.value)}
              placeholder="Street"
              className="input-field mb-2"
            />
            <input
              type="text"
              value={form.street2}
              onChange={(e) => handleChange('street2', e.target.value)}
              placeholder="Street 2 (Apt, Suite, Floor)"
              className="input-field mb-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="City"
                className="input-field"
              />
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange('state', e.target.value)}
                placeholder="State"
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                type="text"
                value={form.zip}
                onChange={(e) => handleChange('zip', e.target.value)}
                placeholder="ZIP"
                className="input-field"
              />
              <input
                type="text"
                value={form.country}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="Country"
                className="input-field"
              />
            </div>
          </div>

          {/* Tags multi-select */}
          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag._id}
                    type="button"
                    onClick={() => toggleTag(tag._id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.tags.includes(tag._id)
                        ? 'bg-rivvra-500/20 text-rivvra-400 border border-rivvra-500/30'
                        : 'bg-dark-700 text-dark-400 border border-dark-600 hover:text-dark-200'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Classification */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Classification</label>
            <div className="space-y-3">
              {/* Salesperson */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">Salesperson</label>
                <select
                  value={form.salespersonId}
                  onChange={(e) => handleChange('salespersonId', e.target.value)}
                  className="input-field"
                >
                  <option value="">No salesperson</option>
                  {salespersons.map((sp) => (
                    <option key={sp._id} value={sp._id}>{sp.name}</option>
                  ))}
                </select>
              </div>
              {/* Customer / Supplier toggles */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isCustomer}
                    onChange={(e) => handleChange('isCustomer', e.target.checked)}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-dark-300">Customer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isSupplier}
                    onChange={(e) => handleChange('isSupplier', e.target.checked)}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-dark-300">Supplier</span>
                </label>
              </div>
            </div>
          </div>

          {/* Tax Information */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Tax Information</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-dark-400 mb-1">GST Treatment</label>
                <select
                  value={form.gstTreatment}
                  onChange={(e) => handleChange('gstTreatment', e.target.value)}
                  className="input-field"
                >
                  {GST_TREATMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-dark-400 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                    placeholder="29AALCR0152L1Z2"
                    maxLength={15}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-400 mb-1">PAN</label>
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                    placeholder="AALCR0152L"
                    maxLength={10}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-dark-400 mb-1">Country Code</label>
                <input
                  type="text"
                  value={form.countryCode}
                  onChange={(e) => handleChange('countryCode', e.target.value.toUpperCase())}
                  placeholder="IN"
                  maxLength={2}
                  className="input-field w-20"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Create Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function ContactsList({ filterType }) {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
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
  const [openFilter, setOpenFilter] = useState(null);

  // Dropdown data
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [salespersons, setSalespersons] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  // Active filter count
  const activeFilterCount = [typeFilter, tagFilter, salespersonFilter].filter(Boolean).length;

  // ── Fetch companies + tags once ─────────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;

    Promise.all([
      contactsApi.listCompanies(orgSlug).catch(() => ({ success: false })),
      contactsApi.listTags(orgSlug).catch(() => ({ success: false })),
      contactsApi.listSalespersons(orgSlug).catch(() => ({ success: false })),
    ]).then(([compRes, tagRes, spRes]) => {
      if (cancelled) return;
      if (compRes.success) setCompanies(compRes.companies || []);
      if (tagRes.success) setTags(tagRes.tags || []);
      if (spRes.success) setSalespersons(spRes.salespersons || []);
    });

    return () => { cancelled = true; };
  }, [orgSlug]);

  // ── Fetch contacts ──────────────────────────────────────────────────
  const fetchContacts = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await contactsApi.list(orgSlug, {
        page: params.page || page,
        search: params.search !== undefined ? params.search : search,
        type: params.type !== undefined ? params.type : typeFilter,
        tag: params.tag !== undefined ? params.tag : tagFilter,
        salesperson: params.salesperson !== undefined ? params.salesperson : salespersonFilter,
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
  }, [orgSlug, page, search, typeFilter, tagFilter, salespersonFilter, showToast]);

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
  const pageStart = total === 0 ? 0 : (page - 1) * 20 + 1;
  const pageEnd = Math.min(page * 20, total);

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
            onClick={() => setShowModal(true)}
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

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-dark-400 hover:text-white transition-colors rounded-lg hover:bg-dark-800"
          >
            <X className="w-3.5 h-3.5" />
            Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
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

                      {/* Email */}
                      <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                        <span className="truncate block max-w-[200px]">{contact.email || '\u2014'}</span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                        {contact.phone || '\u2014'}
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
                Showing {pageStart}\u2013{pageEnd} of {total}
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

      {/* New Contact Modal */}
      <NewContactModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => fetchContacts({ page: 1 })}
        orgSlug={orgSlug}
        companies={companies}
        tags={tags}
        salespersons={salespersons}
      />
    </div>
  );
}
