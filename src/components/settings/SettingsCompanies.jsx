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

// ─── Reusable Field Row (Odoo label:value style) ────────────────────────────

function FieldRow({ label, children, className = '' }) {
  return (
    <div className={`flex items-start py-2 min-h-[38px] ${className}`}>
      <label className="w-[140px] flex-shrink-0 text-sm text-dark-400 pt-1.5">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SettingsCompanies() {
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAIL / CREATE VIEW (Odoo-style)
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedCompany || isCreating) {
    const company = selectedCompany;
    const isEdit = !!company;
    const hasLogo = isEdit && company.hasLogo && !logoError[company._id];
    const logoUrl = isEdit ? getLogoUrl(company) : null;

    return (
      <div>
        {/* ─── Breadcrumb Bar (Odoo style) ─── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={goBack} className="text-rivvra-400 hover:text-rivvra-300 font-medium transition-colors">
              Companies
            </button>
            <span className="text-dark-500">/</span>
            <span className="text-dark-300 font-medium truncate max-w-[300px]">
              {isEdit ? company.name : 'New'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Save / Delete */}
            {isEdit && !company.isDefault && (
              <button
                onClick={() => handleDelete(company)}
                className="text-dark-500 hover:text-red-400 text-sm transition-colors flex items-center gap-1"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 px-4 py-1.5 text-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Save' : 'Create'}
            </button>

            {/* Pagination (like Odoo) */}
            {isEdit && companies.length > 1 && (
              <div className="flex items-center gap-1 text-sm text-dark-400 ml-2 border-l border-dark-700 pl-3">
                <span>{selectedIndex + 1} / {companies.length}</span>
                <button
                  onClick={navigatePrev}
                  disabled={selectedIndex <= 0}
                  className="p-1 rounded hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={navigateNext}
                  disabled={selectedIndex >= companies.length - 1}
                  className="p-1 rounded hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Header: Company Name + Logo ─── */}
        <div className="card p-6 mb-0 rounded-b-none border-b-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-dark-500 uppercase tracking-wide mb-1">Company</p>
              {isCreating ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Company Name"
                  className="text-2xl font-bold text-white bg-transparent border-b border-dark-600 focus:border-rivvra-500 outline-none pb-1 w-full max-w-lg transition-colors"
                  autoFocus
                />
              ) : (
                <h1 className="text-2xl font-bold text-white leading-tight">{company.name}</h1>
              )}
              {isEdit && company.isDefault && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-medium mt-2">
                  <Star size={10} /> Default Company
                </span>
              )}
            </div>

            {/* Logo (top-right, Odoo style) */}
            <div
              onClick={() => isEdit && fileInputRef.current?.click()}
              className={`relative w-[90px] h-[90px] rounded-lg border border-dark-700 flex items-center justify-center overflow-hidden flex-shrink-0 ml-6 group transition-all ${
                isEdit ? 'cursor-pointer hover:border-rivvra-500/50' : 'cursor-default opacity-50'
              }`}
            >
              {uploadingLogo ? (
                <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
              ) : hasLogo && logoUrl ? (
                <>
                  <img
                    src={logoUrl}
                    alt={company.name}
                    className="w-full h-full object-contain p-1.5"
                    onError={() => setLogoError((prev) => ({ ...prev, [company._id]: true }))}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <Image className="w-6 h-6 text-dark-600 mx-auto" />
                  {isEdit && <p className="text-[9px] text-dark-500 mt-1">Upload</p>}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>
        </div>

        {/* ─── Tab Bar ─── */}
        <div className="card rounded-t-none rounded-b-none border-b-0 px-6 pt-0 pb-0">
          <div className="flex gap-0 border-b border-dark-700">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === 'general'
                  ? 'border-rivvra-500 text-white'
                  : 'border-transparent text-dark-400 hover:text-dark-300'
              }`}
            >
              General Information
            </button>
          </div>
        </div>

        {/* ─── Form Body (Odoo 2-column label:value layout) ─── */}
        {activeTab === 'general' && (
          <div className="card rounded-t-none p-6 pt-5">

            {/* 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12">

              {/* ─── LEFT COLUMN ─── */}
              <div className="divide-y divide-dark-800">

                {/* Company Name (only in edit mode — create uses header input) */}
                {isEdit && (
                  <FieldRow label="Company Name">
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="input-field text-sm"
                      placeholder="Company Name"
                    />
                  </FieldRow>
                )}

                <FieldRow label="Address">
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={form.address.street}
                      onChange={(e) => handleAddressChange('street', e.target.value)}
                      placeholder="Street"
                      className="input-field text-sm"
                    />
                    <input
                      type="text"
                      value={form.address.street2}
                      onChange={(e) => handleAddressChange('street2', e.target.value)}
                      placeholder="Street 2"
                      className="input-field text-sm"
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      <input
                        type="text"
                        value={form.address.city}
                        onChange={(e) => handleAddressChange('city', e.target.value)}
                        placeholder="City"
                        className="input-field text-sm"
                      />
                      <input
                        type="text"
                        value={form.address.state}
                        onChange={(e) => handleAddressChange('state', e.target.value)}
                        placeholder="State"
                        className="input-field text-sm"
                      />
                      <input
                        type="text"
                        value={form.address.zip}
                        onChange={(e) => handleAddressChange('zip', e.target.value)}
                        placeholder="ZIP"
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={form.address.country}
                        onChange={(e) => handleAddressChange('country', e.target.value)}
                        placeholder="Country"
                        className="input-field text-sm"
                      />
                      <input
                        type="text"
                        value={form.address.countryCode}
                        onChange={(e) => handleAddressChange('countryCode', e.target.value.toUpperCase())}
                        placeholder="Code (IN)"
                        maxLength={2}
                        className="input-field text-sm"
                      />
                    </div>
                  </div>
                </FieldRow>

                <FieldRow label="Tax ID (GSTIN)">
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                    className="input-field text-sm"
                    placeholder="29AALCR0152L1Z2"
                    maxLength={15}
                  />
                </FieldRow>

                <FieldRow label="PAN">
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                    className="input-field text-sm"
                    placeholder="AALCR0152L"
                    maxLength={10}
                  />
                </FieldRow>

                <FieldRow label="Company ID">
                  <input
                    type="text"
                    value={form.registrationNumber}
                    onChange={(e) => handleChange('registrationNumber', e.target.value)}
                    className="input-field text-sm"
                    placeholder="e.g. BC1546216"
                  />
                </FieldRow>

                <FieldRow label="Currency">
                  <select
                    value={form.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="input-field text-sm"
                  >
                    {CURRENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </FieldRow>

                <FieldRow label="GST Treatment">
                  <select
                    value={form.gstTreatment}
                    onChange={(e) => handleChange('gstTreatment', e.target.value)}
                    className="input-field text-sm"
                  >
                    {GST_TREATMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </FieldRow>
              </div>

              {/* ─── RIGHT COLUMN ─── */}
              <div className="divide-y divide-dark-800">

                <FieldRow label="Phone">
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="input-field text-sm"
                    placeholder="+91 7553138975"
                  />
                </FieldRow>

                <FieldRow label="Mobile">
                  <input
                    type="text"
                    value={form.mobile}
                    onChange={(e) => handleChange('mobile', e.target.value)}
                    className="input-field text-sm"
                    placeholder="+91 98765 43210"
                  />
                </FieldRow>

                <FieldRow label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="input-field text-sm"
                    placeholder="info@company.com"
                  />
                </FieldRow>

                <FieldRow label="Website">
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    className="input-field text-sm"
                    placeholder="https://company.com"
                  />
                </FieldRow>
              </div>
            </div>

            {/* ─── SOCIAL MEDIA Section (full width, Odoo style) ─── */}
            <div className="mt-8 pt-5 border-t border-dark-700">
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Social Media</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12">
                <div className="divide-y divide-dark-800">
                  <FieldRow label="X (Twitter)">
                    <input
                      type="text"
                      value={form.socialMedia.x}
                      onChange={(e) => handleSocialChange('x', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://x.com/company"
                    />
                  </FieldRow>
                  <FieldRow label="Facebook">
                    <input
                      type="text"
                      value={form.socialMedia.facebook}
                      onChange={(e) => handleSocialChange('facebook', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://facebook.com/company"
                    />
                  </FieldRow>
                  <FieldRow label="GitHub">
                    <input
                      type="text"
                      value={form.socialMedia.github}
                      onChange={(e) => handleSocialChange('github', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://github.com/company"
                    />
                  </FieldRow>
                </div>
                <div className="divide-y divide-dark-800">
                  <FieldRow label="LinkedIn">
                    <input
                      type="text"
                      value={form.socialMedia.linkedin}
                      onChange={(e) => handleSocialChange('linkedin', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://linkedin.com/company/..."
                    />
                  </FieldRow>
                  <FieldRow label="YouTube">
                    <input
                      type="text"
                      value={form.socialMedia.youtube}
                      onChange={(e) => handleSocialChange('youtube', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://youtube.com/@company"
                    />
                  </FieldRow>
                  <FieldRow label="Instagram">
                    <input
                      type="text"
                      value={form.socialMedia.instagram}
                      onChange={(e) => handleSocialChange('instagram', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://instagram.com/company"
                    />
                  </FieldRow>
                </div>
              </div>
            </div>

            {/* ─── SIGNATORY Section ─── */}
            {isEdit && (
              <div className="mt-8 pt-5 border-t border-dark-700">
                <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <PenTool size={12} /> Authorized Signatory
                </h3>
                <p className="text-xs text-dark-500 mb-3">
                  Image printed on customer-invoice PDFs above the "Authorized signatory"
                  line. Each company has its own signatory.
                </p>
                <div className="flex items-start gap-4">
                  <div className="relative w-[220px] h-[100px] rounded-lg border border-dark-700 bg-dark-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {uploadingSignature ? (
                      <Loader2 className="w-5 h-5 animate-spin text-dark-400" />
                    ) : company.hasSignature && !signatureError[company._id] ? (
                      <img
                        src={getSignatureUrl(company)}
                        alt="Signature"
                        className="max-w-full max-h-full object-contain p-2"
                        onError={() => setSignatureError((prev) => ({ ...prev, [company._id]: true }))}
                      />
                    ) : (
                      <div className="text-center">
                        <PenTool className="w-6 h-6 text-dark-600 mx-auto" />
                        <p className="text-[10px] text-dark-500 mt-1">No signature</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={uploadingSignature}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dark-600 hover:border-rivvra-500/50 text-sm text-dark-300 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Upload size={12} />
                      {company.hasSignature ? 'Replace' : 'Upload'} signature
                    </button>
                    {company.hasSignature && (
                      <button
                        type="button"
                        onClick={handleSignatureRemove}
                        disabled={uploadingSignature}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dark-600 hover:border-red-500/50 text-sm text-dark-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <X size={12} />
                        Remove
                      </button>
                    )}
                    <p className="text-[10px] text-dark-500">PNG/JPG, transparent bg, &lt; 2 MB.</p>
                  </div>
                </div>
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSignatureUpload}
                />
              </div>
            )}

            {/* ─── BANK DETAILS Section ─── */}
            <div className="mt-8 pt-5 border-t border-dark-700">
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Bank Details</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12">
                <div className="divide-y divide-dark-800">
                  <FieldRow label="Account Name">
                    <input
                      type="text"
                      value={form.bankDetails.accountName}
                      onChange={(e) => handleBankChange('accountName', e.target.value)}
                      className="input-field text-sm"
                      placeholder="Company Legal Name"
                    />
                  </FieldRow>
                  <FieldRow label="Bank Name">
                    <input
                      type="text"
                      value={form.bankDetails.bankName}
                      onChange={(e) => handleBankChange('bankName', e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. HDFC BANK"
                    />
                  </FieldRow>
                </div>
                <div className="divide-y divide-dark-800">
                  <FieldRow label="Account Number">
                    <input
                      type="text"
                      value={form.bankDetails.accountNo}
                      onChange={(e) => handleBankChange('accountNo', e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. 50200072741421"
                    />
                  </FieldRow>
                  <FieldRow label="IFSC Code">
                    <input
                      type="text"
                      value={form.bankDetails.ifsc}
                      onChange={(e) => handleBankChange('ifsc', e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. HDFC0004668"
                    />
                  </FieldRow>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEW (Odoo-style table)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Companies</h2>
          <span className="text-sm text-dark-500">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</span>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm px-3 py-1.5">
          <Plus size={15} />
          New
        </button>
      </div>

      {/* Table */}
      {companies.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-400 uppercase tracking-wide">
                  Company Name
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-400 uppercase tracking-wide">
                  Currency
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-400 uppercase tracking-wide">
                  Location
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-dark-400 uppercase tracking-wide">
                  Tax ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {companies.map((c, i) => (
                <tr
                  key={c._id}
                  onClick={() => openDetail(c, i)}
                  className="hover:bg-dark-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm text-white font-medium">{c.name}</span>
                      {c.isDefault && (
                        <span className="flex items-center gap-0.5 text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium leading-none">
                          <Star size={8} /> Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-dark-300">{c.currency || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-dark-400">
                      {[c.address?.city, c.address?.state, c.address?.country].filter(Boolean).join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-dark-400 font-mono">{c.gstin || c.pan || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-dark-400">
          <Building2 className="w-14 h-14 mx-auto mb-3 text-dark-600" />
          <p className="text-base">No companies yet</p>
          <p className="text-sm mt-1">Click "New" to create your first legal entity.</p>
        </div>
      )}
    </div>
  );
}
