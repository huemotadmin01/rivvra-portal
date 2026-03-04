import { useState, useEffect, useRef, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import { API_BASE_URL } from '../../utils/config';
import api from '../../utils/api';
import {
  Building2, Plus, Loader2, Pencil, Trash2, X, Save, Star,
  ChevronLeft, Upload, Camera, Globe, Phone, Mail, MapPin,
  Hash, FileText, CreditCard, Image,
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
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
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
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLogoUrl(company) {
  if (!company?._id) return null;
  return `${API_BASE_URL}/api/org-company/${company._id}/logo?t=${company.updatedAt || ''}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SettingsCompanies() {
  const { currentOrg } = useOrg();
  const { refreshCompanies } = useCompany();
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState({});
  const fileInputRef = useRef(null);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchCompanies = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await api.request(`/api/org/${orgSlug}/companies`);
      if (res.success) {
        const list = res.companies || [];
        setCompanies(list);
        // If we're viewing a company, refresh it
        if (selectedCompany) {
          const updated = list.find((c) => c._id === selectedCompany._id);
          if (updated) {
            setSelectedCompany(updated);
            populateForm(updated);
          }
        }
      }
    } catch { /* ignore */ }
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
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field, value) => {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));
  };

  // ─── CRUD Actions ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setSelectedCompany(null);
    setIsCreating(true);
    setForm(EMPTY_FORM);
  };

  const openDetail = (company) => {
    setIsCreating(false);
    setSelectedCompany(company);
    populateForm(company);
  };

  const goBack = () => {
    setSelectedCompany(null);
    setIsCreating(false);
    setForm(EMPTY_FORM);
  };

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
        // After create, switch to detail view for the new company
        if (!selectedCompany && res.company) {
          setIsCreating(false);
          setSelectedCompany(res.company);
          populateForm(res.company);
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
        // Clear logo error cache for this company
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

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  // ─── Detail / Create View ──────────────────────────────────────────────────

  if (selectedCompany || isCreating) {
    const company = selectedCompany;
    const isEdit = !!company;
    const hasLogo = isEdit && company.hasLogo && !logoError[company._id];
    const logoUrl = isEdit ? getLogoUrl(company) : null;

    return (
      <div>
        {/* Top bar: back + title + actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isEdit ? company.name : 'New Company'}
              </h2>
              {isEdit && company.isDefault && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium mt-0.5">
                  <Star size={10} /> Default Company
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && !company.isDefault && (
              <button
                onClick={() => handleDelete(company)}
                className="bg-dark-800 hover:bg-red-500/15 text-dark-400 hover:text-red-400 rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Save Changes' : 'Create Company'}
            </button>
          </div>
        </div>

        {/* Main content: 2-column Odoo-style layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── Left Column: Logo + Key Info (1/3) ─── */}
          <div className="space-y-5">

            {/* Logo Upload Card */}
            <div className="card p-5">
              <label className="block text-xs font-medium text-dark-400 uppercase tracking-wide mb-3">
                Company Logo
              </label>
              <div className="flex flex-col items-center">
                <div
                  onClick={() => isEdit && fileInputRef.current?.click()}
                  className={`relative w-32 h-32 rounded-xl border-2 border-dashed border-dark-600 flex items-center justify-center overflow-hidden transition-all group ${
                    isEdit ? 'cursor-pointer hover:border-rivvra-500/50 hover:bg-dark-800/50' : 'cursor-default opacity-60'
                  }`}
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
                  ) : hasLogo && logoUrl ? (
                    <>
                      <img
                        src={logoUrl}
                        alt={company.name}
                        className="w-full h-full object-contain p-2"
                        onError={() => setLogoError((prev) => ({ ...prev, [company._id]: true }))}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <Image className="w-8 h-8 text-dark-500 mx-auto mb-1" />
                      <span className="text-[11px] text-dark-500">
                        {isEdit ? 'Click to upload' : 'Save first'}
                      </span>
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
                {isEdit && (
                  <p className="text-[11px] text-dark-500 mt-2 text-center">
                    PNG, JPG, SVG — max 2 MB
                  </p>
                )}
              </div>
            </div>

            {/* Quick Info Card */}
            <div className="card p-5 space-y-4">
              <label className="block text-xs font-medium text-dark-400 uppercase tracking-wide">
                Quick Info
              </label>

              {/* Currency */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  className="input-field text-sm"
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Registration Number */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">
                  <Hash size={11} className="inline mr-1 -mt-0.5" />
                  Company ID / Registration No.
                </label>
                <input
                  type="text"
                  value={form.registrationNumber}
                  onChange={(e) => handleChange('registrationNumber', e.target.value)}
                  className="input-field text-sm"
                  placeholder="e.g. BC1546216"
                />
              </div>

              {/* GST Treatment */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">GST Treatment</label>
                <select
                  value={form.gstTreatment}
                  onChange={(e) => handleChange('gstTreatment', e.target.value)}
                  className="input-field text-sm"
                >
                  {GST_TREATMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* GSTIN */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                  className="input-field text-sm"
                  placeholder="29AALCR0152L1Z2"
                  maxLength={15}
                />
              </div>

              {/* PAN */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">PAN</label>
                <input
                  type="text"
                  value={form.pan}
                  onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                  className="input-field text-sm"
                  placeholder="AALCR0152L"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          {/* ─── Right Column: Details (2/3) ─── */}
          <div className="lg:col-span-2 space-y-5">

            {/* General Information */}
            <div className="card p-5">
              <label className="block text-xs font-medium text-dark-400 uppercase tracking-wide mb-4">
                General Information
              </label>
              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="input-field"
                    placeholder="HUEMOT TECHNOLOGY PVT LTD"
                  />
                </div>

                {/* Contact Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">
                      <Phone size={12} className="inline mr-1.5 -mt-0.5" />
                      Phone
                    </label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="input-field"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">
                      <Phone size={12} className="inline mr-1.5 -mt-0.5" />
                      Mobile
                    </label>
                    <input
                      type="text"
                      value={form.mobile}
                      onChange={(e) => handleChange('mobile', e.target.value)}
                      className="input-field"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                {/* Email + Website */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">
                      <Mail size={12} className="inline mr-1.5 -mt-0.5" />
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="input-field"
                      placeholder="info@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">
                      <Globe size={12} className="inline mr-1.5 -mt-0.5" />
                      Website
                    </label>
                    <input
                      type="text"
                      value={form.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      className="input-field"
                      placeholder="https://company.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="card p-5">
              <label className="block text-xs font-medium text-dark-400 uppercase tracking-wide mb-4">
                <MapPin size={12} className="inline mr-1.5 -mt-0.5" />
                Address
              </label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={form.address.street}
                  onChange={(e) => handleAddressChange('street', e.target.value)}
                  placeholder="Street Address"
                  className="input-field"
                />
                <input
                  type="text"
                  value={form.address.street2}
                  onChange={(e) => handleAddressChange('street2', e.target.value)}
                  placeholder="Street Address Line 2"
                  className="input-field"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={form.address.city}
                    onChange={(e) => handleAddressChange('city', e.target.value)}
                    placeholder="City"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={form.address.state}
                    onChange={(e) => handleAddressChange('state', e.target.value)}
                    placeholder="State / Province"
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={form.address.zip}
                    onChange={(e) => handleAddressChange('zip', e.target.value)}
                    placeholder="ZIP / Postal"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={form.address.country}
                    onChange={(e) => handleAddressChange('country', e.target.value)}
                    placeholder="Country"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={form.address.countryCode}
                    onChange={(e) => handleAddressChange('countryCode', e.target.value.toUpperCase())}
                    placeholder="Code (IN)"
                    maxLength={2}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ─── List View ─────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Companies</h2>
          <p className="text-sm text-dark-400 mt-0.5">Manage legal entities within your organization</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add Company
        </button>
      </div>

      {/* Company Cards */}
      <div className="grid gap-3">
        {companies.map((c) => (
          <div
            key={c._id}
            onClick={() => openDetail(c)}
            className="card p-4 flex items-center justify-between cursor-pointer hover:border-dark-600 transition-colors group"
          >
            <div className="flex items-center gap-4">
              {/* Logo or icon */}
              <div className="w-12 h-12 rounded-xl bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.hasLogo && !logoError[c._id] ? (
                  <img
                    src={getLogoUrl(c)}
                    alt={c.name}
                    className="w-full h-full object-contain p-1.5"
                    onError={() => setLogoError((prev) => ({ ...prev, [c._id]: true }))}
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-rivvra-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold group-hover:text-rivvra-400 transition-colors">{c.name}</h3>
                  {c.isDefault && (
                    <span className="flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                      <Star size={10} /> Default
                    </span>
                  )}
                  {c.currency && (
                    <span className="text-[10px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded font-mono">
                      {c.currency}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-dark-400">
                  {c.email && <span className="flex items-center gap-1"><Mail size={11} /> {c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                  {c.address?.city && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {c.address.city}{c.address.state ? `, ${c.address.state}` : ''}{c.address.country ? ` — ${c.address.country}` : ''}
                    </span>
                  )}
                </div>
                {(c.gstin || c.pan || c.registrationNumber) && (
                  <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-dark-500">
                    {c.registrationNumber && <span>Reg: {c.registrationNumber}</span>}
                    {c.gstin && <span>GSTIN: {c.gstin}</span>}
                    {c.pan && <span>PAN: {c.pan}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil size={14} className="text-dark-400" />
            </div>
          </div>
        ))}

        {companies.length === 0 && (
          <div className="text-center py-16 text-dark-400">
            <Building2 className="w-14 h-14 mx-auto mb-3 text-dark-600" />
            <p className="text-base">No companies yet</p>
            <p className="text-sm mt-1">Click "Add Company" to create your first legal entity.</p>
          </div>
        )}
      </div>
    </div>
  );
}
