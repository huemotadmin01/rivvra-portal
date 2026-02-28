import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import {
  ArrowLeft, Edit2, Save, X, Loader2,
  Building2, User, Mail, Phone, MapPin,
  Globe, Briefcase, Tag, FileText, Users,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Badge({ children, className }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{label}</span>
      <span className="text-white text-sm">{value ?? '\u2014'}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} className="text-dark-400" />}
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContactDetail() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  const [contact, setContact] = useState(null);
  const [childContacts, setChildContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState('details');

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Dropdown data for edit
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [salespersons, setSalespersons] = useState([]);

  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  // ── Fetch contact ─────────────────────────────────────────────────────
  const fetchContact = useCallback(async () => {
    if (!orgSlug || !contactId) return;
    setLoading(true);
    setNotFound(false);

    try {
      const res = await contactsApi.get(orgSlug, contactId);
      if (res.success && res.contact) {
        setContact(res.contact);
        setChildContacts(res.childContacts || []);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, contactId]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // Fetch companies + tags for edit mode
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

  // ── Enter edit mode ───────────────────────────────────────────────────
  const startEditing = () => {
    if (!contact) return;
    const addr = contact.address || {};
    setForm({
      title: contact.title || '',
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      website: contact.website || '',
      jobTitle: contact.jobTitle || '',
      parentCompany: contact.parentCompanyId || '',
      street: addr.street || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || '',
      country: addr.country || '',
      tags: contact.tags || [],
      notes: contact.internalNotes || '',
      isCustomer: contact.isCustomer || false,
      isSupplier: contact.isSupplier || false,
      salespersonId: contact.salespersonId || '',
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm({});
  };

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

  // ── Save edits ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: form.title,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        mobile: form.mobile.trim(),
        website: form.website.trim(),
        jobTitle: contact.type === 'individual' ? form.jobTitle.trim() : '',
        parentCompanyId: contact.type === 'individual' ? form.parentCompany : '',
        address: {
          street: form.street.trim(),
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
      };

      const res = await contactsApi.update(orgSlug, contactId, payload);
      if (res.success) {
        showToast('Contact updated');
        setEditing(false);
        fetchContact();
      }
    } catch (err) {
      showToast(err.message || 'Failed to update contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  // ── 404 state ─────────────────────────────────────────────────────────
  if (notFound || !contact) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(orgPath('/contacts'))}
          className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Contacts</span>
        </button>
        <div className="flex flex-col items-center justify-center h-72 text-dark-400">
          <User size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Contact not found</p>
        </div>
      </div>
    );
  }

  const addr = contact.address || {};
  const addressLines = [addr.street, addr.city, addr.state, addr.zip, addr.country]
    .filter(Boolean)
    .join(', ');

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'notes', label: 'Notes' },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate(orgPath('/contacts'))}
        className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Contacts</span>
      </button>

      {/* ── Header Card ──────────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 ${
            contact.type === 'company' ? 'bg-blue-500/20' : 'bg-orange-500/20'
          }`}>
            {contact.type === 'company' ? (
              <Building2 size={32} className="text-blue-400" />
            ) : (
              <span className="text-2xl font-bold text-orange-400">
                {getInitials(contact.name)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                {editing ? (
                  <div className="flex items-center gap-2 mb-1">
                    <select
                      value={form.title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      className="input-field w-24 text-sm"
                    >
                      <option value="">Title</option>
                      {['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.'].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="input-field text-xl font-bold flex-1"
                    />
                  </div>
                ) : (
                  <h1 className="text-2xl font-bold text-white">
                    {contact.title ? `${contact.title} ` : ''}{contact.name}
                  </h1>
                )}
                {contact.jobTitle && !editing && (
                  <p className="text-dark-400 mt-0.5">{contact.jobTitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Badge className={
                    contact.type === 'company'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }>
                    {contact.type === 'company' ? 'Company' : 'Individual'}
                  </Badge>
                  {contact.isCustomer && (
                    <Badge className="bg-purple-500/10 text-purple-400">Customer</Badge>
                  )}
                  {contact.isSupplier && (
                    <Badge className="bg-amber-500/10 text-amber-400">Supplier</Badge>
                  )}
                  {(contact.tagNames || []).map((tag, i) => (
                    <Badge key={i} className="bg-dark-700 text-dark-300">{tag}</Badge>
                  ))}
                </div>
              </div>

              {/* Edit / Save / Cancel buttons */}
              {isAdmin && !editing && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors flex-shrink-0"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
              )}
              {editing && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={cancelEditing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-dark-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-rivvra-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rivvra-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Details Tab ──────────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Contact Information */}
            <SectionCard title="Contact Information" icon={Mail}>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Mobile</label>
                    <input
                      type="text"
                      value={form.mobile}
                      onChange={(e) => handleChange('mobile', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Website</label>
                    <input
                      type="text"
                      value={form.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Email" value={contact.email} />
                  <InfoRow label="Phone" value={contact.phone} />
                  <InfoRow label="Mobile" value={contact.mobile} />
                  <InfoRow label="Website" value={
                    contact.website ? (
                      <a
                        href={contact.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-rivvra-400 hover:underline"
                      >
                        {contact.website}
                      </a>
                    ) : null
                  } />
                </>
              )}
            </SectionCard>

            {/* Work / Organization */}
            <SectionCard
              title={contact.type === 'company' ? 'Company Details' : 'Work Details'}
              icon={contact.type === 'company' ? Building2 : Briefcase}
            >
              {editing && contact.type === 'individual' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Job Title</label>
                    <input
                      type="text"
                      value={form.jobTitle}
                      onChange={(e) => handleChange('jobTitle', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Company</label>
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
                </div>
              ) : contact.type === 'individual' ? (
                <>
                  <InfoRow label="Job Title" value={contact.jobTitle} />
                  <InfoRow
                    label="Company"
                    value={
                      contact.parentCompanyName ? (
                        <Link
                          to={orgPath(`/contacts/${contact.parentCompanyId}`)}
                          className="text-rivvra-400 hover:underline"
                        >
                          {contact.parentCompanyName}
                        </Link>
                      ) : null
                    }
                  />
                </>
              ) : (
                <>
                  <InfoRow label="Type" value="Company" />
                  <InfoRow
                    label="Employees"
                    value={childContacts.length > 0 ? `${childContacts.length} contact(s)` : null}
                  />
                </>
              )}
            </SectionCard>

            {/* Address */}
            <SectionCard title="Address" icon={MapPin}>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Street</label>
                    <input
                      type="text"
                      value={form.street}
                      onChange={(e) => handleChange('street', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">State</label>
                      <input
                        type="text"
                        value={form.state}
                        onChange={(e) => handleChange('state', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={form.zip}
                        onChange={(e) => handleChange('zip', e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Country</label>
                      <input
                        type="text"
                        value={form.country}
                        onChange={(e) => handleChange('country', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <InfoRow label="Full Address" value={addressLines || null} />
              )}
            </SectionCard>

            {/* Tags */}
            <SectionCard title="Tags" icon={Tag}>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 ? (
                    <p className="text-dark-500 text-sm">No tags available. Create tags in Contacts Config.</p>
                  ) : (
                    tags.map((tag) => (
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
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(contact.tagNames || []).length > 0 ? (
                    contact.tagNames.map((tag, i) => (
                      <Badge key={i} className="bg-dark-700 text-dark-300">{tag}</Badge>
                    ))
                  ) : (
                    <p className="text-dark-500 text-sm">No tags assigned</p>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Classification */}
            <SectionCard title="Classification" icon={Users}>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Salesperson</label>
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
                  <div className="flex items-center gap-6 pt-1">
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
              ) : (
                <>
                  <InfoRow
                    label="Salesperson"
                    value={contact.salespersonName || null}
                  />
                  <InfoRow
                    label="Customer"
                    value={contact.isCustomer ? 'Yes' : 'No'}
                  />
                  <InfoRow
                    label="Supplier"
                    value={contact.isSupplier ? 'Yes' : 'No'}
                  />
                </>
              )}
            </SectionCard>
          </div>

          {/* ── Child Contacts (for companies) ─────────────────────────── */}
          {contact.type === 'company' && childContacts.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-blue-400" />
                <h3 className="text-white font-semibold">Contacts at {contact.name}</h3>
                <span className="ml-auto text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                  {childContacts.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Job Title</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Email</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {childContacts.map((child) => (
                      <tr
                        key={child._id}
                        onClick={() => navigate(orgPath(`/contacts/${child._id}`))}
                        className="hover:bg-dark-800/30 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-sm text-white font-medium">{child.name}</td>
                        <td className="px-3 py-2.5 text-sm text-dark-300">{child.jobTitle || '\u2014'}</td>
                        <td className="px-3 py-2.5 text-sm text-dark-300">{child.email || '\u2014'}</td>
                        <td className="px-3 py-2.5 text-sm text-dark-300">{child.phone || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Notes Tab ────────────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Internal Notes</h3>
          </div>
          {editing ? (
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add internal notes about this contact..."
              rows={8}
              className="input-field min-h-[200px] w-full"
            />
          ) : (
            <div className="text-dark-300 text-sm whitespace-pre-wrap min-h-[100px]">
              {contact.internalNotes || (
                <span className="text-dark-500 italic">No notes yet.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
