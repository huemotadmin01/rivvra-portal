import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import invoicingApi from '../../utils/invoicingApi';
import ActivityPanel from '../../components/shared/ActivityPanel';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Loader2, Trash2,
  Building2, User, Mail, Phone, MapPin,
  Globe, Briefcase, Tag, FileText, Users, Receipt,
  Upload, Download, Paperclip, Eye, Pencil,
} from 'lucide-react';

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
  { value: '', label: '-- None --' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
];

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
// EditableField – inline editing sub-component
// ---------------------------------------------------------------------------

function EditableField({ label, value, field, type = 'text', options, editable, onSave, placeholder, maxLength, transform }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');

  useEffect(() => setLocalValue(value ?? ''), [value]);

  const save = () => {
    setEditing(false);
    const finalValue = transform ? transform(localValue) : localValue;
    if (finalValue !== (value ?? '')) onSave(field, finalValue);
  };

  if (!editable) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
        <span className="text-dark-400 text-sm">{label}</span>
        <span className="text-white text-sm">{value || '\u2014'}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2 group">
      <span className="text-dark-400 text-sm">{label}</span>
      {editing ? (
        type === 'select' ? (
          <select
            autoFocus
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={save}
            className="bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
          >
            {options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            autoFocus
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={save}
            className="bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-sm text-white focus:outline-none min-h-[60px]"
          />
        ) : (
          <input
            autoFocus
            type={type}
            value={localValue}
            onChange={(e) => {
              let v = e.target.value;
              if (transform) v = transform(v);
              setLocalValue(v);
            }}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setLocalValue(value ?? ''); setEditing(false); }
            }}
            placeholder={placeholder}
            maxLength={maxLength}
            className="bg-dark-800 border border-rivvra-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
          />
        )
      ) : (
        <div
          className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-dark-800 min-h-[28px]"
          onClick={() => setEditing(true)}
        >
          <span className="text-white text-sm">
            {value || <span className="text-dark-500 italic">{placeholder || '\u2014'}</span>}
          </span>
          <Pencil size={10} className="text-dark-600 opacity-0 group-hover:opacity-100 shrink-0" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable Name (header inline edit)
// ---------------------------------------------------------------------------

function EditableName({ value, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => setLocalValue(value || ''), [value]);

  const save = () => {
    setEditing(false);
    const trimmed = localValue.trim();
    if (trimmed && trimmed !== value) onSave('name', trimmed);
    else setLocalValue(value || '');
  };

  if (!editable || !editing) {
    return (
      <div
        className={`inline-flex items-center gap-2 ${editable ? 'group cursor-pointer rounded px-1 -mx-1 hover:bg-dark-800' : ''}`}
        onClick={() => editable && setEditing(true)}
      >
        <h1 className="text-2xl font-bold text-white">{value}</h1>
        {editable && <Pencil size={12} className="text-dark-600 opacity-0 group-hover:opacity-100 shrink-0" />}
      </div>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { setLocalValue(value || ''); setEditing(false); }
      }}
      className="text-2xl font-bold text-white bg-dark-800 border border-rivvra-500 rounded px-2 py-0.5 focus:outline-none w-full max-w-md"
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContactDetail() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const fromInvoice = searchParams.get('from') === 'invoice';
  const fromInvoiceId = searchParams.get('invoiceId');

  const [contact, setContact] = useState(null);
  usePageTitle(contact?.name || contact?.companyName);
  const [childContacts, setChildContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState('details');

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dropdown data
  const [salespersons, setSalespersons] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);

  const isAdmin = getAppRole('contacts') === 'admin';
  const orgSlug = currentOrg?.slug;

  // -- Fetch contact ----------------------------------------------------------
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
    } catch (err) {
      showToast('Failed to load contact', 'error');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, contactId, showToast]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // Fetch dropdown data
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;

    contactsApi.listSalespersons(orgSlug).catch(() => ({ success: false }))
      .then((spRes) => {
        if (!cancelled && spRes.success) setSalespersons(spRes.salespersons || []);
      });

    invoicingApi.listPaymentTerms(orgSlug)
      .then((res) => { if (!cancelled) setPaymentTerms(res?.paymentTerms || []); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [orgSlug]);

  // Fetch attachments
  const loadAttachments = useCallback(async () => {
    if (!orgSlug || !contactId) return;
    setAttachLoading(true);
    try {
      const res = await contactsApi.listAttachments(orgSlug, contactId);
      if (res.success) setAttachments(res.documents || []);
    } catch {}
    finally { setAttachLoading(false); }
  }, [orgSlug, contactId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  // -- Inline save handlers ---------------------------------------------------
  const saveField = async (field, value) => {
    try {
      await contactsApi.update(orgSlug, contactId, { [field]: value });
      setContact((prev) => ({ ...prev, [field]: value }));
      showToast('Saved');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    }
  };

  const saveAddressField = async (field, value) => {
    const newAddress = { ...(contact.address || {}), [field]: value };
    try {
      await contactsApi.update(orgSlug, contactId, { address: newAddress });
      setContact((prev) => ({ ...prev, address: newAddress }));
      showToast('Saved');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    }
  };

  // -- Delete handler ---------------------------------------------------------
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await contactsApi.delete(orgSlug, contactId);
      if (res.success) {
        const count = res.childrenDeleted || 0;
        showToast(
          contact.type === 'company' && count > 0
            ? `Company and ${count} related contact(s) deleted`
            : 'Contact deleted successfully',
        );
        navigate(orgPath('/contacts/list'), { replace: true });
      } else {
        showToast(res.error || 'Failed to delete', 'error');
        setDeleting(false);
        setShowDeleteModal(false);
      }
    } catch {
      showToast('Failed to delete contact', 'error');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // -- Loading state ----------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  // -- 404 state --------------------------------------------------------------
  if (notFound || !contact) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center h-72 text-dark-400">
          <User size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Contact not found</p>
        </div>
      </div>
    );
  }

  const addr = contact.address || {};

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'activities', label: 'Activities' },
    { id: 'notes', label: 'Notes' },
    { id: 'attachments', label: 'Attachments' },
  ];

  // Helper: build salesperson options
  const salespersonOptions = [
    { value: '', label: 'No salesperson' },
    ...salespersons.map((sp) => ({ value: sp._id, label: sp.name })),
  ];

  // Helper: build payment terms options
  const paymentTermOptions = [
    { value: '', label: '-- None --' },
    ...paymentTerms.map((pt) => ({ value: pt._id, label: pt.name })),
  ];

  // Helper: display value for salesperson
  const salespersonDisplayValue = contact.salespersonName || (
    salespersons.find((sp) => sp._id === contact.salespersonId)?.name || ''
  );

  // Helper: display value for payment terms
  const paymentTermDisplayValue = paymentTerms.find((pt) => pt._id === contact.defaultPaymentTermId)?.name || '';

  // -- Render -----------------------------------------------------------------
  return (
    <div className="p-6 max-w-5xl">
      {/* Back to Invoice link */}
      {fromInvoice && fromInvoiceId && (
        <button
          onClick={() => navigate(orgPath(`/invoicing/invoices/${fromInvoiceId}`))}
          className="flex items-center gap-1.5 text-sm text-rivvra-500 hover:text-rivvra-400 mb-4 transition-colors"
        >
          <span>&larr;</span> Back to Invoice
        </button>
      )}

      {/* Header Card */}
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
                <EditableName
                  value={contact.title ? `${contact.title} ${contact.name}` : contact.name}
                  editable={isAdmin}
                  onSave={(_, val) => {
                    // If there was a title prefix, strip it for saving just the name
                    saveField('name', val.replace(/^(Mr\.|Mrs\.|Miss|Ms\.|Dr\.|Prof\.)\s*/i, '').trim() || val);
                  }}
                />
                {contact.jobTitle && (
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

              {/* Delete button only */}
              {isAdmin && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-sm transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
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

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Contact Information */}
            <SectionCard title="Contact Information" icon={Mail}>
              <EditableField label="Email" value={contact.email} field="email" type="email" editable={isAdmin} onSave={saveField} placeholder="Add email" />
              <EditableField label="Phone" value={contact.phone} field="phone" editable={isAdmin} onSave={saveField} placeholder="Add phone" />
              <EditableField label="Mobile" value={contact.mobile} field="mobile" editable={isAdmin} onSave={saveField} placeholder="Add mobile" />
              <EditableField label="Website" value={contact.website} field="website" editable={isAdmin} onSave={saveField} placeholder="Add website" />
            </SectionCard>

            {/* Company / Work Details */}
            <SectionCard
              title={contact.type === 'company' ? 'Company Details' : 'Work Details'}
              icon={contact.type === 'company' ? Building2 : Briefcase}
            >
              {contact.type === 'individual' ? (
                <>
                  <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                    <span className="text-dark-400 text-sm">Type</span>
                    <span className="text-white text-sm">
                      <Badge className="bg-emerald-500/10 text-emerald-400">Individual</Badge>
                    </span>
                  </div>
                  <EditableField label="Job Title" value={contact.jobTitle} field="jobTitle" editable={isAdmin} onSave={saveField} placeholder="Add job title" />
                  <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                    <span className="text-dark-400 text-sm">Company</span>
                    <span className="text-white text-sm">
                      {contact.parentCompanyName ? (
                        <Link
                          to={orgPath(`/contacts/${contact.parentCompanyId}`)}
                          className="text-rivvra-400 hover:underline"
                        >
                          {contact.parentCompanyName}
                        </Link>
                      ) : '\u2014'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                    <span className="text-dark-400 text-sm">Type</span>
                    <span className="text-white text-sm">
                      <Badge className="bg-blue-500/10 text-blue-400">Company</Badge>
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
                    <span className="text-dark-400 text-sm">Employees</span>
                    <span className="text-white text-sm">
                      {childContacts.length > 0 ? `${childContacts.length} contact(s)` : '\u2014'}
                    </span>
                  </div>
                </>
              )}
            </SectionCard>

            {/* Billing Address */}
            <SectionCard title="Billing Address" icon={MapPin}>
              <EditableField label="Street" value={addr.street} field="street" editable={isAdmin} onSave={saveAddressField} placeholder="Add street" />
              <EditableField label="Street 2" value={addr.street2} field="street2" editable={isAdmin} onSave={saveAddressField} placeholder="Apt, Suite, Floor" />
              <EditableField label="City" value={addr.city} field="city" editable={isAdmin} onSave={saveAddressField} placeholder="Add city" />
              <EditableField label="State" value={addr.state} field="state" editable={isAdmin} onSave={saveAddressField} placeholder="Add state" />
              <EditableField label="ZIP" value={addr.zip} field="zip" editable={isAdmin} onSave={saveAddressField} placeholder="Add ZIP" />
              <EditableField label="Country" value={addr.country} field="country" editable={isAdmin} onSave={saveAddressField} placeholder="Add country" />
            </SectionCard>

            {/* Classification */}
            <SectionCard title="Classification" icon={Users}>
              <EditableField
                label="Salesperson"
                value={salespersonDisplayValue}
                field="salespersonId"
                type="select"
                options={salespersonOptions}
                editable={isAdmin}
                onSave={(field, val) => saveField(field, val)}
              />
              <EditableField
                label="Customer"
                value={contact.isCustomer ? 'Yes' : 'No'}
                field="isCustomer"
                type="select"
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                editable={isAdmin}
                onSave={(field, val) => saveField(field, val === 'true')}
              />
              <EditableField
                label="Supplier"
                value={contact.isSupplier ? 'Yes' : 'No'}
                field="isSupplier"
                type="select"
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                editable={isAdmin}
                onSave={(field, val) => saveField(field, val === 'true')}
              />
            </SectionCard>

            {/* Tax Information */}
            <SectionCard title="Tax Information" icon={Receipt}>
              <EditableField
                label="GST Treatment"
                value={contact.gstTreatment}
                field="gstTreatment"
                type="select"
                options={GST_TREATMENT_OPTIONS}
                editable={isAdmin}
                onSave={saveField}
              />
              <EditableField
                label="GSTIN"
                value={contact.gstin}
                field="gstin"
                editable={isAdmin}
                onSave={saveField}
                placeholder="29AALCR0152L1Z2"
                maxLength={15}
                transform={(v) => v.toUpperCase()}
              />
              <EditableField
                label="PAN"
                value={contact.pan}
                field="pan"
                editable={isAdmin}
                onSave={saveField}
                placeholder="AALCR0152L"
                maxLength={10}
                transform={(v) => v.toUpperCase()}
              />
              <EditableField
                label="Country Code"
                value={contact.countryCode}
                field="countryCode"
                editable={isAdmin}
                onSave={saveField}
                placeholder="IN"
                maxLength={2}
                transform={(v) => v.toUpperCase()}
              />
              <EditableField
                label="Place of Supply"
                value={contact.placeOfSupply}
                field="placeOfSupply"
                editable={isAdmin}
                onSave={saveField}
                placeholder="e.g. Karnataka (KA)"
              />
              <EditableField
                label="Payment Terms"
                value={paymentTermDisplayValue}
                field="defaultPaymentTermId"
                type="select"
                options={paymentTermOptions}
                editable={isAdmin}
                onSave={(field, val) => saveField(field, val || null)}
              />
              <EditableField
                label="Default Currency"
                value={contact.defaultCurrency}
                field="defaultCurrency"
                type="select"
                options={CURRENCY_OPTIONS}
                editable={isAdmin}
                onSave={(field, val) => saveField(field, val || null)}
              />
            </SectionCard>

            {/* Tags (read-only) */}
            <SectionCard title="Tags" icon={Tag}>
              <div className="flex flex-wrap gap-1.5">
                {(contact.tagNames || []).length > 0 ? (
                  contact.tagNames.map((tag, i) => (
                    <Badge key={i} className="bg-dark-700 text-dark-300">{tag}</Badge>
                  ))
                ) : (
                  <p className="text-dark-500 text-sm">No tags assigned</p>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Child Contacts (for companies) */}
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

      {/* Activities Tab */}
      {activeTab === 'activities' && (
        <>
          <ActivityPanel orgSlug={orgSlug} entityType="crm_contact" entityId={contactId} />
          <div className="mt-4">
            <SignRequestWidget
              orgSlug={orgSlug}
              linkedModel="contact"
              linkedId={contactId}
              prefillData={{ name: contact?.name || '', email: contact?.email || '', phone: contact?.phone || '', company: contact?.company || '' }}
            />
          </div>
        </>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Internal Notes</h3>
          </div>
          <EditableField
            label=""
            value={contact.internalNotes}
            field="internalNotes"
            type="textarea"
            editable={isAdmin}
            onSave={saveField}
            placeholder="Add internal notes about this contact..."
          />
        </div>
      )}

      {/* Attachments Tab */}
      {activeTab === 'attachments' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Paperclip size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Attachments</h3>
            <span className="ml-auto text-xs bg-dark-700 text-dark-300 px-2 py-0.5 rounded-full font-medium">
              {attachments.length} file{attachments.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Upload area */}
          <div className="mb-4">
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-dark-600 rounded-xl text-sm text-dark-400 hover:border-rivvra-500 hover:text-rivvra-400 transition-colors cursor-pointer">
              {attachUploading ? (
                <><Loader2 size={16} className="animate-spin" /> Uploading...</>
              ) : (
                <><Upload size={16} /> Click to upload a file</>
              )}
              <input type="file" className="hidden" disabled={attachUploading} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAttachUploading(true);
                try {
                  await contactsApi.uploadAttachment(orgSlug, contactId, file);
                  showToast('File uploaded');
                  await loadAttachments();
                } catch (err) {
                  showToast(err.message || 'Upload failed', 'error');
                } finally {
                  setAttachUploading(false);
                  e.target.value = '';
                }
              }} />
            </label>
          </div>

          {/* File list + Preview */}
          {attachLoading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-dark-500" /></div>
          ) : attachments.length === 0 ? (
            <p className="text-sm text-dark-500 text-center py-4">No attachments yet.</p>
          ) : (
            <div className="space-y-2">
              {attachments.map(doc => {
                const isImage = doc.mimeType?.startsWith('image/');
                const isPdf = doc.mimeType === 'application/pdf';
                const isPreviewable = isImage || isPdf;
                const sizeKb = doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : '';
                return (
                  <div key={doc._id}
                    onClick={() => isPreviewable ? setPreviewDoc(doc) : (() => {
                      const url = contactsApi.getAttachmentUrl(orgSlug, contactId, doc._id);
                      const token = localStorage.getItem('rivvra_token');
                      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                        .then(r => r.blob()).then(blob => {
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob); a.download = doc.filename; a.click();
                        }).catch(() => showToast('Download failed', 'error'));
                    })()}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors group cursor-pointer bg-dark-800/60 border border-dark-700/50 hover:bg-dark-800">
                    <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                      {isImage ? <Eye size={16} className="text-blue-400" /> : isPdf ? <FileText size={16} className="text-red-400" /> : <Paperclip size={16} className="text-dark-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.filename}</p>
                      <p className="text-xs text-dark-500">{sizeKb}{doc.uploadedAt ? ` \u00b7 ${new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isPreviewable && (
                        <span className="p-1.5 rounded-lg text-dark-400 hover:text-rivvra-400 hover:bg-rivvra-500/10 transition-colors" title="Preview">
                          <Eye size={14} />
                        </span>
                      )}
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('Delete this attachment?')) return;
                        try {
                          await contactsApi.deleteAttachment(orgSlug, contactId, doc._id);
                          showToast('Attachment deleted');
                          await loadAttachments();
                        } catch { showToast('Delete failed', 'error'); }
                      }} className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {previewDoc && (
            <DocumentPreviewModal
              filename={previewDoc.filename}
              mimeType={previewDoc.mimeType}
              fetchUrl={contactsApi.getAttachmentUrl(orgSlug, contactId, previewDoc._id)}
              onClose={() => setPreviewDoc(null)}
            />
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete {contact.type === 'company' ? 'Company' : 'Contact'}</h2>
            <p className="text-xs text-dark-400 mb-1">
              Are you sure you want to permanently delete <span className="text-dark-200 font-medium">{contact.name}</span>?
            </p>
            {contact.type === 'company' && childContacts.length > 0 && (
              <p className="text-xs text-red-400/80 mb-1">
                This will also delete {childContacts.length} related individual contact{childContacts.length !== 1 ? 's' : ''}.
              </p>
            )}
            <p className="text-xs text-dark-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
