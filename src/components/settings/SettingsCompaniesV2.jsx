import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import { API_BASE_URL } from '../../utils/config';
import api from '../../utils/api';
import {
  Building2, Plus, Loader2, Trash2, Save, Star,
  ChevronLeft, ChevronRight, Camera, Image, PenTool, Upload, X,
} from 'lucide-react';
import { Panel, Chip, Button, Input, Select, EmptyState, PageSpinner } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Legal entities: the record every invoice, payslip and PDF is issued against.
// The whole block from `const { currentOrg }` to `handleSignatureRemove` is
// spliced in verbatim (380 lines). Three parts of it are why:
//
//   · `populateForm` maps every field with `|| ''`. It is exhaustive on
//     purpose — `handleSave` PUTs the whole form, so a field missing from this
//     mapping would be sent blank and silently erase itself on the next save.
//   · `handleSave` deletes `eInvoiceCredentials` from the payload unless
//     something was actually typed. These are write-only IRP secrets the API
//     never returns; blank means "keep what is stored".
//   · The country-aware label helpers mirror `invoicePdfHelper.js`, so the form
//     and the printed invoice agree on whether a field is a GSTIN, an EIN or a
//     BN — and whether the routing field is an IFSC, a SWIFT or a transit code.
//
// Not triggered during verification: Save/Create, Delete company, logo upload,
// signature upload, signature remove, and "Clear saved credentials" — which
// would break e-invoice generation for a live GSTIN.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Constants ───────────────────────────────────────────────────────────────

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

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
  { value: 'CAD', label: 'CAD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'AED', label: 'AED' },
  { value: 'SGD', label: 'SGD' },
  { value: 'AUD', label: 'AUD' },
];

const EMPTY_FORM = {
  name: '',
  currency: 'INR',
  registrationNumber: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  gstTreatment: '',
  gstin: '',
  pan: '',
  address: { street: '', street2: '', city: '', state: '', zip: '', country: 'India', countryCode: 'IN' },
  socialMedia: { x: '', facebook: '', github: '', linkedin: '', youtube: '', instagram: '' },
  bankDetails: { accountName: '', bankName: '', accountNo: '', ifsc: '' },
  // Write-only: the API never returns stored IRP secrets, so these always
  // start blank. Blank = keep saved values; non-blank = replace.
  eInvoiceCredentials: { clientId: '', clientSecret: '', username: '', password: '' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLogoUrl(company) {
  if (!company?._id) return null;
  return `${API_BASE_URL}/api/org-company/${company._id}/logo?t=${company.updatedAt || ''}`;
}

function getSignatureUrl(company) {
  if (!company?._id) return null;
  return `${API_BASE_URL}/api/org-company/${company._id}/signature?t=${company.updatedAt || ''}`;
}

// Country-aware labels (mirror invoicePdfHelper.js so the form matches the PDF output)
function taxIdLabel(cc) {
  if (cc === 'US') return 'EIN';
  if (cc === 'CA') return 'BN';
  return 'GSTIN';
}

function taxIdPlaceholder(cc) {
  if (cc === 'US') return '12-3456789';
  if (cc === 'CA') return '123456789RC0001';
  return '29AALCR0152L1Z2';
}

function bankRoutingLabel(cc) {
  if (cc === 'US') return 'SWIFT / BIC';
  if (cc === 'CA') return 'Transit / Institution';
  return 'IFSC Code';
}

function bankRoutingPlaceholder(cc) {
  if (cc === 'US') return 'e.g. CHASUS33XXX';
  if (cc === 'CA') return 'e.g. 12345-001';
  return 'e.g. HDFC0004668';
}

// ─── Reusable Field Row (Odoo label:value style) ────────────────────────────

function FieldRow({ label, htmlFor, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', minHeight: 38, borderTop: '1px solid var(--line-2)' }}>
      <label htmlFor={htmlFor} style={{ width: 140, flexShrink: 0, paddingTop: 9, font: "400 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
        {label}
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Uppercase micro-heading that opens each full-width section. */
function SectionTitle({ icon, children }) {
  return (
    <h3 style={{
      display: 'flex', alignItems: 'center', gap: 6,
      font: "600 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px',
    }}>
      {icon}{children}
    </h3>
  );
}

/** Full-width block below the two-column grid. */
function FormSection({ title, icon, hint, children }) {
  return (
    <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--line-2)' }}>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {hint && <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>{hint}</p>}
      {children}
    </div>
  );
}

const TWO_COL = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', columnGap: 40 };

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SettingsCompaniesV2() {
  const { currentOrg } = useOrg();
  const { refreshCompanies } = useCompany();
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  // URL-driven selection: /settings/companies (list) | /settings/companies/new
  // (create) | /settings/companies/:companyId (edit a specific record). The
  // state below is still the source of truth for rendering; these two hooks
  // keep URL + state in lockstep.
  const { companyId: routeCompanyId } = useParams();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [logoError, setLogoError] = useState({});
  const [signatureError, setSignatureError] = useState({});
  const [activeTab, setActiveTab] = useState('general');
  const fileInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchCompanies = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await api.request(`/api/org/${orgSlug}/companies`);
      if (res.success) {
        const list = res.companies || [];
        setCompanies(list);
        if (selectedCompany) {
          const idx = list.findIndex((c) => c._id === selectedCompany._id);
          if (idx >= 0) {
            setSelectedCompany(list[idx]);
            setSelectedIndex(idx);
            populateForm(list[idx]);
          }
        }
      }
    } catch (err) { /* ignore */ }
    setLoading(false);
  }, [orgSlug, selectedCompany?._id]);

  useEffect(() => { fetchCompanies(); }, [orgSlug]);

  // ─── Form Helpers ──────────────────────────────────────────────────────────

  const populateForm = (company) => {
    setForm({
      name: company.name || '',
      currency: company.currency || 'INR',
      registrationNumber: company.registrationNumber || '',
      phone: company.phone || '',
      mobile: company.mobile || '',
      email: company.email || '',
      website: company.website || '',
      gstTreatment: company.gstTreatment || '',
      gstin: company.gstin || '',
      pan: company.pan || '',
      address: {
        street: company.address?.street || '',
        street2: company.address?.street2 || '',
        city: company.address?.city || '',
        state: company.address?.state || '',
        zip: company.address?.zip || '',
        country: company.address?.country || 'India',
        countryCode: company.address?.countryCode || 'IN',
      },
      socialMedia: {
        x: company.socialMedia?.x || '',
        facebook: company.socialMedia?.facebook || '',
        github: company.socialMedia?.github || '',
        linkedin: company.socialMedia?.linkedin || '',
        youtube: company.socialMedia?.youtube || '',
        instagram: company.socialMedia?.instagram || '',
      },
      bankDetails: {
        accountName: company.bankDetails?.accountName || '',
        bankName: company.bankDetails?.bankName || '',
        accountNo: company.bankDetails?.accountNo || '',
        ifsc: company.bankDetails?.ifsc || '',
      },
      eInvoiceCredentials: { clientId: '', clientSecret: '', username: '', password: '' },
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field, value) => {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));
  };

  const handleSocialChange = (field, value) => {
    setForm((prev) => ({ ...prev, socialMedia: { ...prev.socialMedia, [field]: value } }));
  };

  const handleBankChange = (field, value) => {
    setForm((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, [field]: value } }));
  };

  const handleEInvoiceCredChange = (field, value) => {
    setForm((prev) => ({ ...prev, eInvoiceCredentials: { ...prev.eInvoiceCredentials, [field]: value } }));
  };

  const handleClearEInvoiceCreds = async () => {
    if (!selectedCompany?._id) return;
    if (!window.confirm('Remove the saved IRP credentials for this company? E-invoice generation will stop working until new credentials are added.')) return;
    try {
      const res = await api.request(`/api/org/${orgSlug}/companies/${selectedCompany._id}`, {
        method: 'PUT',
        body: JSON.stringify({ eInvoiceCredentials: null }),
      });
      if (res.success) {
        showToast('E-invoice credentials cleared');
        fetchCompanies();
      } else {
        showToast(res.error || 'Failed to clear credentials', 'error');
      }
    } catch {
      showToast('Failed to clear credentials', 'error');
    }
  };

  // ─── Navigation ────────────────────────────────────────────────────────────

  // applyDetail() mutates local state only — used both by direct user clicks
  // (via openDetail) and by the URL-sync effect below to avoid circular nav.
  const applyDetail = useCallback((company, index) => {
    setIsCreating(false);
    setSelectedCompany(company);
    setSelectedIndex(index);
    populateForm(company);
    setActiveTab('general');
  }, []);

  const openCreate = () => {
    navigate(`/org/${orgSlug}/settings/companies/new`);
  };

  const openDetail = (company /* , index (re-derived from list) */) => {
    if (!company?._id) return;
    navigate(`/org/${orgSlug}/settings/companies/${company._id}`);
  };

  const goBack = () => {
    navigate(`/org/${orgSlug}/settings/companies`);
  };

  const navigatePrev = () => {
    if (selectedIndex > 0) {
      const prev = companies[selectedIndex - 1];
      openDetail(prev);
    }
  };

  const navigateNext = () => {
    if (selectedIndex < companies.length - 1) {
      const next = companies[selectedIndex + 1];
      openDetail(next);
    }
  };

  // ─── URL → state sync ──────────────────────────────────────────────────────
  // Whenever the URL param changes (deep link, back/forward, or after our
  // own navigate()), realign local state. Runs once companies have loaded so
  // we can resolve a companyId to its list entry.
  useEffect(() => {
    if (loading) return;
    if (routeCompanyId === 'new') {
      setSelectedCompany(null);
      setSelectedIndex(-1);
      setIsCreating(true);
      setForm(EMPTY_FORM);
      setActiveTab('general');
      return;
    }
    if (routeCompanyId) {
      const idx = companies.findIndex((c) => c._id === routeCompanyId);
      if (idx >= 0) {
        applyDetail(companies[idx], idx);
      } else if (companies.length > 0) {
        // URL points to a companyId we don't have — bounce to the list.
        navigate(`/org/${orgSlug}/settings/companies`, { replace: true });
      }
      return;
    }
    // No route param: list view.
    setSelectedCompany(null);
    setSelectedIndex(-1);
    setIsCreating(false);
    setForm(EMPTY_FORM);
  }, [routeCompanyId, companies, loading, orgSlug, navigate, applyDetail]);

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Company name is required', 'error'); return; }

    try {
      setSaving(true);
      const payload = { ...form, name: form.name.trim() };
      // Only send IRP credentials when something was typed — sending blanks
      // would still be a no-op server-side, but omitting keeps intent clear.
      if (!Object.values(form.eInvoiceCredentials || {}).some((v) => v && v.trim())) {
        delete payload.eInvoiceCredentials;
      }

      let res;
      if (selectedCompany) {
        res = await api.request(`/api/org/${orgSlug}/companies/${selectedCompany._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await api.request(`/api/org/${orgSlug}/companies`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (res.success) {
        showToast(selectedCompany ? 'Company updated' : 'Company created');
        if (!selectedCompany && res.company?._id) {
          // Created: jump to the canonical detail URL for the new record
          // so the URL and state agree (and refresh works).
          navigate(`/org/${orgSlug}/settings/companies/${res.company._id}`, { replace: true });
        }
        fetchCompanies();
        refreshCompanies();
      } else {
        showToast(res.error || 'Failed to save company', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save company', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company) => {
    if (company.isDefault) { showToast('Cannot delete the default company', 'error'); return; }
    if (!window.confirm(`Delete "${company.name}"? This cannot be undone.`)) return;

    try {
      const res = await api.request(`/api/org/${orgSlug}/companies/${company._id}`, { method: 'DELETE' });
      if (res.success) {
        showToast('Company deleted');
        goBack();
        fetchCompanies();
        refreshCompanies();
      } else {
        showToast(res.error || 'Failed to delete company', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  // ─── Logo Upload ───────────────────────────────────────────────────────────

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2 MB', 'error');
      return;
    }

    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('logo', file);

      const token = localStorage.getItem('rivvra_token');
      const companyId = localStorage.getItem('rivvra_current_company');
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (companyId) headers['X-Company-Id'] = companyId;

      const response = await fetch(
        `${API_BASE_URL}/api/org/${orgSlug}/companies/${selectedCompany._id}/logo`,
        { method: 'POST', body: formData, headers }
      );
      const data = await response.json();

      if (data.success) {
        showToast('Logo uploaded');
        setLogoError((prev) => ({ ...prev, [selectedCompany._id]: false }));
        fetchCompanies();
        refreshCompanies();
      } else {
        showToast(data.error || 'Failed to upload logo', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Signatory Upload (per-company; replaces the old org-wide one) ─────────

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Signature must be under 2 MB', 'error');
      return;
    }

    try {
      setUploadingSignature(true);
      const formData = new FormData();
      formData.append('signature', file);

      const token = localStorage.getItem('rivvra_token');
      const companyId = localStorage.getItem('rivvra_current_company');
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (companyId) headers['X-Company-Id'] = companyId;

      const response = await fetch(
        `${API_BASE_URL}/api/org/${orgSlug}/companies/${selectedCompany._id}/signature`,
        { method: 'POST', body: formData, headers }
      );
      const data = await response.json();

      if (data.success) {
        showToast('Signature uploaded');
        setSignatureError((prev) => ({ ...prev, [selectedCompany._id]: false }));
        fetchCompanies();
        refreshCompanies();
      } else {
        showToast(data.error || 'Failed to upload signature', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleSignatureRemove = async () => {
    if (!selectedCompany) return;
    if (!window.confirm('Remove the authorized signatory image?')) return;
    try {
      const res = await api.request(
        `/api/org/${orgSlug}/companies/${selectedCompany._id}/signature`,
        { method: 'DELETE' }
      );
      if (res.success) {
        showToast('Signature removed');
        fetchCompanies();
        refreshCompanies();
      } else {
        showToast(res.error || 'Failed to remove signature', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to remove signature', 'error');
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner label="Loading companies…" />;

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAIL / CREATE VIEW (Odoo-style)
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedCompany || isCreating) {
    const company = selectedCompany;
    const isEdit = !!company;
    const hasLogo = isEdit && company.hasLogo && !logoError[company._id];
    const logoUrl = isEdit ? getLogoUrl(company) : null;
    const cc = form.address.countryCode;

    return (
      <div>
        {/* ─── Breadcrumb Bar (Odoo style) ─── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, font: "400 12.5px/1.3 'Inter', system-ui, sans-serif" }}>
            <button onClick={goBack} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)' }}>
              Companies
            </button>
            <span style={{ color: 'var(--fg-4)' }}>/</span>
            <span style={{ color: 'var(--fg-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
              {isEdit ? company.name : 'New'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Save / Delete */}
            {isEdit && !company.isDefault && (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(company)} iconLeft={<Trash2 size={13} />}>
                Delete
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}>
              {isEdit ? 'Save' : 'Create'}
            </Button>

            {/* Pagination (like Odoo) */}
            {isEdit && companies.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, paddingLeft: 12, borderLeft: '1px solid var(--line-2)' }}>
                <span style={{ font: "400 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>
                  {selectedIndex + 1} / {companies.length}
                </span>
                <Button variant="ghost" size="sm" onClick={navigatePrev} disabled={selectedIndex <= 0}
                  aria-label="Previous company" iconLeft={<ChevronLeft size={15} />} />
                <Button variant="ghost" size="sm" onClick={navigateNext} disabled={selectedIndex >= companies.length - 1}
                  aria-label="Next company" iconLeft={<ChevronRight size={15} />} />
              </div>
            )}
          </div>
        </div>

        <Panel style={{ padding: 20 }}>
          {/* ─── Header: Company Name + Logo ─── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Company</p>
              {isCreating ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Company Name"
                  aria-label="Company Name"
                  autoFocus
                  style={{
                    font: "700 22px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)',
                    background: 'transparent', border: 0, borderBottom: '1px solid var(--line-2)',
                    outline: 'none', padding: '0 0 4px', width: '100%', maxWidth: 440,
                  }}
                />
              ) : (
                <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>{company.name}</h1>
              )}
              {isEdit && company.isDefault && (
                <span style={{ display: 'inline-flex', marginTop: 8 }}>
                  <Chip tone="warn"><Star size={10} /> Default Company</Chip>
                </span>
              )}
            </div>

            {/* Logo (top-right, Odoo style) */}
            <button
              type="button"
              onClick={() => isEdit && fileInputRef.current?.click()}
              disabled={!isEdit}
              aria-label={isEdit ? 'Upload company logo' : 'Company logo'}
              style={{
                position: 'relative', width: 90, height: 90, flexShrink: 0, padding: 0,
                borderRadius: 'var(--r-2)', border: '1px solid var(--line-2)', background: 'var(--surface-2)',
                display: 'grid', placeItems: 'center', overflow: 'hidden',
                cursor: isEdit ? 'pointer' : 'default',
              }}
            >
              {uploadingLogo ? (
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
              ) : hasLogo && logoUrl ? (
                <img
                  src={logoUrl}
                  alt={company.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
                  onError={() => setLogoError((prev) => ({ ...prev, [company._id]: true }))}
                />
              ) : (
                <span style={{ textAlign: 'center' }}>
                  <Image size={22} style={{ color: 'var(--fg-4)', display: 'block', margin: '0 auto' }} />
                  {isEdit && <span style={{ display: 'block', font: "400 9px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>Upload</span>}
                </span>
              )}
              {isEdit && hasLogo && logoUrl && !uploadingLogo && (
                <span style={{ position: 'absolute', right: 4, bottom: 4, display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 99, background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)' }}>
                  <Camera size={11} style={{ color: 'var(--fg-3)' }} />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
          </div>

          {/* ─── Tab Bar ─── */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line-2)', margin: '18px -20px 0', padding: '0 20px' }}>
            <button
              onClick={() => setActiveTab('general')}
              aria-current={activeTab === 'general' ? 'page' : undefined}
              style={{
                padding: '8px 14px', marginBottom: -1, cursor: 'pointer', background: 'none', border: 0,
                borderBottom: `2px solid ${activeTab === 'general' ? 'var(--brand)' : 'transparent'}`,
                font: "500 12.5px/1.3 'Inter', system-ui, sans-serif",
                color: activeTab === 'general' ? 'var(--fg)' : 'var(--fg-4)',
              }}
            >
              General Information
            </button>
          </div>

          {/* ─── Form Body (Odoo 2-column label:value layout) ─── */}
          {activeTab === 'general' && (
            <div style={{ paddingTop: 16 }}>

              {/* 2-column grid */}
              <div style={TWO_COL}>

                {/* ─── LEFT COLUMN ─── */}
                <div>
                  {/* Company Name (only in edit mode — create uses header input) */}
                  {isEdit && (
                    <FieldRow label="Company Name" htmlFor="co-name">
                      <Input id="co-name" type="text" value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)} placeholder="Company Name" />
                    </FieldRow>
                  )}

                  <FieldRow label="Address" htmlFor="co-street">
                    <div style={{ display: 'grid', gap: 6 }}>
                      <Input id="co-street" type="text" value={form.address.street}
                        onChange={(e) => handleAddressChange('street', e.target.value)} placeholder="Street" />
                      <Input type="text" value={form.address.street2} aria-label="Street 2"
                        onChange={(e) => handleAddressChange('street2', e.target.value)} placeholder="Street 2" />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        <Input type="text" value={form.address.city} aria-label="City"
                          onChange={(e) => handleAddressChange('city', e.target.value)} placeholder="City" />
                        <Input type="text" value={form.address.state} aria-label="State"
                          onChange={(e) => handleAddressChange('state', e.target.value)} placeholder="State" />
                        <Input type="text" value={form.address.zip} aria-label="ZIP"
                          onChange={(e) => handleAddressChange('zip', e.target.value)} placeholder="ZIP" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        <Input type="text" value={form.address.country} aria-label="Country"
                          onChange={(e) => handleAddressChange('country', e.target.value)} placeholder="Country" />
                        <Input type="text" value={form.address.countryCode} aria-label="Country code" maxLength={2}
                          onChange={(e) => handleAddressChange('countryCode', e.target.value.toUpperCase())} placeholder="Code (IN)" />
                      </div>
                    </div>
                  </FieldRow>

                  <FieldRow label={`Tax ID (${taxIdLabel(cc)})`} htmlFor="co-taxid">
                    <Input
                      id="co-taxid" type="text" value={form.gstin}
                      onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                      placeholder={taxIdPlaceholder(cc)}
                      maxLength={cc === 'IN' ? 15 : 32}
                    />
                  </FieldRow>

                  {cc === 'IN' && (
                    <FieldRow label="PAN" htmlFor="co-pan">
                      <Input id="co-pan" type="text" value={form.pan}
                        onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                        placeholder="AALCR0152L" maxLength={10} />
                    </FieldRow>
                  )}

                  <FieldRow label="Company ID" htmlFor="co-regno">
                    <Input id="co-regno" type="text" value={form.registrationNumber}
                      onChange={(e) => handleChange('registrationNumber', e.target.value)} placeholder="e.g. BC1546216" />
                  </FieldRow>

                  <FieldRow label="Currency" htmlFor="co-currency">
                    <Select id="co-currency" value={form.currency} onChange={(e) => handleChange('currency', e.target.value)}>
                      {CURRENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </FieldRow>

                  <FieldRow label="GST Treatment" htmlFor="co-gsttreatment">
                    <Select id="co-gsttreatment" value={form.gstTreatment} onChange={(e) => handleChange('gstTreatment', e.target.value)}>
                      {GST_TREATMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </FieldRow>
                </div>

                {/* ─── RIGHT COLUMN ─── */}
                <div>
                  <FieldRow label="Phone" htmlFor="co-phone">
                    <Input id="co-phone" type="text" value={form.phone}
                      onChange={(e) => handleChange('phone', e.target.value)} placeholder="+91 7553138975" />
                  </FieldRow>
                  <FieldRow label="Mobile" htmlFor="co-mobile">
                    <Input id="co-mobile" type="text" value={form.mobile}
                      onChange={(e) => handleChange('mobile', e.target.value)} placeholder="+91 98765 43210" />
                  </FieldRow>
                  <FieldRow label="Email" htmlFor="co-email">
                    <Input id="co-email" type="email" value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)} placeholder="info@company.com" />
                  </FieldRow>
                  <FieldRow label="Website" htmlFor="co-website">
                    <Input id="co-website" type="text" value={form.website}
                      onChange={(e) => handleChange('website', e.target.value)} placeholder="https://company.com" />
                  </FieldRow>
                </div>
              </div>

              {/* ─── SOCIAL MEDIA Section (full width, Odoo style) ─── */}
              <FormSection title="Social Media">
                <div style={TWO_COL}>
                  <div>
                    {[
                      ['x', 'X (Twitter)', 'https://x.com/company'],
                      ['facebook', 'Facebook', 'https://facebook.com/company'],
                      ['github', 'GitHub', 'https://github.com/company'],
                    ].map(([key, label, ph]) => (
                      <FieldRow key={key} label={label} htmlFor={`co-social-${key}`}>
                        <Input id={`co-social-${key}`} type="text" value={form.socialMedia[key]}
                          onChange={(e) => handleSocialChange(key, e.target.value)} placeholder={ph} />
                      </FieldRow>
                    ))}
                  </div>
                  <div>
                    {[
                      ['linkedin', 'LinkedIn', 'https://linkedin.com/company/...'],
                      ['youtube', 'YouTube', 'https://youtube.com/@company'],
                      ['instagram', 'Instagram', 'https://instagram.com/company'],
                    ].map(([key, label, ph]) => (
                      <FieldRow key={key} label={label} htmlFor={`co-social-${key}`}>
                        <Input id={`co-social-${key}`} type="text" value={form.socialMedia[key]}
                          onChange={(e) => handleSocialChange(key, e.target.value)} placeholder={ph} />
                      </FieldRow>
                    ))}
                  </div>
                </div>
              </FormSection>

              {/* ─── SIGNATORY Section ─── */}
              {isEdit && (
                <FormSection
                  title="Authorized Signatory"
                  icon={<PenTool size={12} />}
                  hint={'Image printed on customer-invoice PDFs above the "Authorized signatory" line. Each company has its own signatory.'}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{
                      position: 'relative', width: 220, height: 100, flexShrink: 0,
                      borderRadius: 'var(--r-2)', border: '1px solid var(--line-2)', background: 'var(--surface-2)',
                      display: 'grid', placeItems: 'center', overflow: 'hidden',
                    }}>
                      {uploadingSignature ? (
                        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
                      ) : company.hasSignature && !signatureError[company._id] ? (
                        <img
                          src={getSignatureUrl(company)}
                          alt="Signature"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: 8 }}
                          onError={() => setSignatureError((prev) => ({ ...prev, [company._id]: true }))}
                        />
                      ) : (
                        <span style={{ textAlign: 'center' }}>
                          <PenTool size={22} style={{ color: 'var(--fg-4)', display: 'block', margin: '0 auto' }} />
                          <span style={{ display: 'block', font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>No signature</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                      <Button
                        variant="secondary" size="sm" type="button"
                        onClick={() => signatureInputRef.current?.click()}
                        disabled={uploadingSignature}
                        iconLeft={<Upload size={12} />}
                      >
                        {company.hasSignature ? 'Replace' : 'Upload'} signature
                      </Button>
                      {company.hasSignature && (
                        <Button
                          variant="secondary" size="sm" type="button"
                          onClick={handleSignatureRemove}
                          disabled={uploadingSignature}
                          iconLeft={<X size={12} />}
                        >
                          Remove
                        </Button>
                      )}
                      <p style={{ font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>PNG/JPG, transparent bg, &lt; 2 MB.</p>
                    </div>
                  </div>
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleSignatureUpload}
                  />
                </FormSection>
              )}

              {/* ─── BANK DETAILS Section ─── */}
              <FormSection title="Bank Details">
                <div style={TWO_COL}>
                  <div>
                    <FieldRow label="Account Name" htmlFor="co-bank-name">
                      <Input id="co-bank-name" type="text" value={form.bankDetails.accountName}
                        onChange={(e) => handleBankChange('accountName', e.target.value)} placeholder="Company Legal Name" />
                    </FieldRow>
                    <FieldRow label="Bank Name" htmlFor="co-bank-bank">
                      <Input id="co-bank-bank" type="text" value={form.bankDetails.bankName}
                        onChange={(e) => handleBankChange('bankName', e.target.value)} placeholder="e.g. HDFC BANK" />
                    </FieldRow>
                  </div>
                  <div>
                    <FieldRow label="Account Number" htmlFor="co-bank-acct">
                      <Input id="co-bank-acct" type="text" value={form.bankDetails.accountNo}
                        onChange={(e) => handleBankChange('accountNo', e.target.value)} placeholder="e.g. 50200072741421" />
                    </FieldRow>
                    <FieldRow label={bankRoutingLabel(cc)} htmlFor="co-bank-ifsc">
                      <Input id="co-bank-ifsc" type="text" value={form.bankDetails.ifsc}
                        onChange={(e) => handleBankChange('ifsc', e.target.value)} placeholder={bankRoutingPlaceholder(cc)} />
                    </FieldRow>
                  </div>
                </div>
              </FormSection>

              {/* ─── E-INVOICING (India) Section ─── */}
              {cc === 'IN' && (
                <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--line-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <SectionTitle>E-Invoicing — IRP API Credentials</SectionTitle>
                    <span style={{ marginBottom: 12 }}>
                      {selectedCompany?.eInvoiceConfigured
                        ? <Chip tone="brand">Configured</Chip>
                        : <Chip tone="neutral">Not configured</Chip>}
                    </span>
                  </div>
                  <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
                    API credentials issued for this company's GSTIN by the IRP (NIC / IRIS).
                    Saved values are never shown — leave a field blank to keep it, type to replace.
                  </p>
                  <div style={TWO_COL}>
                    <div>
                      <FieldRow label="Client ID" htmlFor="co-irp-clientid">
                        <Input id="co-irp-clientid" type="text" value={form.eInvoiceCredentials.clientId}
                          onChange={(e) => handleEInvoiceCredChange('clientId', e.target.value)}
                          placeholder={selectedCompany?.eInvoiceConfigured ? '•••••• (saved)' : 'IRP client id'}
                          autoComplete="off" />
                      </FieldRow>
                      <FieldRow label="Client Secret" htmlFor="co-irp-secret">
                        <Input id="co-irp-secret" type="password" value={form.eInvoiceCredentials.clientSecret}
                          onChange={(e) => handleEInvoiceCredChange('clientSecret', e.target.value)}
                          placeholder={selectedCompany?.eInvoiceConfigured ? '•••••• (saved)' : 'IRP client secret'}
                          autoComplete="new-password" />
                      </FieldRow>
                    </div>
                    <div>
                      <FieldRow label="API Username" htmlFor="co-irp-user">
                        <Input id="co-irp-user" type="text" value={form.eInvoiceCredentials.username}
                          onChange={(e) => handleEInvoiceCredChange('username', e.target.value)}
                          placeholder={selectedCompany?.eInvoiceConfigured ? '•••••• (saved)' : 'API user for this GSTIN'}
                          autoComplete="off" />
                      </FieldRow>
                      <FieldRow label="API Password" htmlFor="co-irp-pass">
                        <Input id="co-irp-pass" type="password" value={form.eInvoiceCredentials.password}
                          onChange={(e) => handleEInvoiceCredChange('password', e.target.value)}
                          placeholder={selectedCompany?.eInvoiceConfigured ? '•••••• (saved)' : 'API password'}
                          autoComplete="new-password" />
                      </FieldRow>
                    </div>
                  </div>
                  {selectedCompany?.eInvoiceConfigured && (
                    <div style={{ marginTop: 8 }}>
                      <Button variant="ghost" size="sm" type="button" onClick={handleClearEInvoiceCreds} style={{ color: 'var(--danger)' }}>
                        Clear saved credentials
                      </Button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </Panel>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEW (Odoo-style table)
  // ═══════════════════════════════════════════════════════════════════════════

  const th = { padding: '9px 14px', textAlign: 'left', font: "600 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' };
  const td = { padding: '11px 14px', font: "400 12.5px/1.4 'Inter', system-ui, sans-serif" };

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ font: "650 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>Companies</h2>
          <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
            {companies.length} {companies.length === 1 ? 'company' : 'companies'}
          </span>
        </div>
        <Button size="sm" onClick={openCreate} iconLeft={<Plus size={15} />}>New</Button>
      </div>

      {/* Table */}
      {companies.length > 0 ? (
        <Panel flush>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={th}>Company Name</th>
                  <th style={th}>Currency</th>
                  <th style={th}>Location</th>
                  <th style={th}>Tax ID</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c, i) => (
                  <tr
                    key={c._id}
                    onClick={() => openDetail(c, i)}
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)', cursor: 'pointer' }}
                  >
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{c.name}</span>
                        {c.isDefault && <Chip tone="warn"><Star size={9} /> Default</Chip>}
                      </div>
                    </td>
                    <td style={{ ...td, color: 'var(--fg-3)' }}>{c.currency || '—'}</td>
                    <td style={{ ...td, color: 'var(--fg-4)' }}>
                      {[c.address?.city, c.address?.state, c.address?.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ ...td, color: 'var(--fg-4)', font: "400 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {c.gstin || c.pan || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState icon={<Building2 size={22} />} title="No companies yet">
            Click “New” to create your first legal entity.
          </EmptyState>
        </Panel>
      )}
    </div>
  );
}
