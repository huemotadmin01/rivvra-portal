import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import crmApi from '../../utils/crmApi';
import invoicingApi from '../../utils/invoicingApi';
import { getAddressLocale, validateZip } from '../../utils/addressLocale';
import { formatCurrency } from '../../utils/formatCurrency';
import { withFromContext } from '../../utils/entityDescribe';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  Avatar, Button, Chip, ConfirmDialog, DataTable, EditableHeading, EmptyState,
  EntityLookup, InlineComboField, InlineField, Modal, Panel, RecordMeta,
  SkeletonHeader, SkeletonPage, SkeletonTabs, SkeletonTwoCard, Spinner, Tabs, TagPicker,
} from '../../components/ds';
import ActivityPanelV2 from '../../components/shared/v2/ActivityPanelV2';
// Legacy islands still rendered inside the v2 shell. SignRequestWidget is
// dark-only; it belongs to the Sign surface and migrates with it.
import SignRequestWidget from '../../components/shared/SignRequestWidget';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import {
  Archive, ArchiveRestore, Briefcase, Building2, Eye, FileText, Globe, Mail, MapPin,
  MoreHorizontal, Paperclip, Phone, Receipt, Tag, Trash2, Upload, User, Users,
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
  { value: '', label: '— None —' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
];

const TITLE_PREFIX_RE = /^(Mr\.|Mrs\.|Miss|Ms\.|Dr\.|Prof\.)\s*/i;

const REFERENCE_LABELS = {
  invoices: 'Invoices',
  creditNotes: 'Credit notes',
  followUpLogs: 'Follow-up logs',
  crmOpportunitiesByContact: 'CRM opportunities (as contact)',
  crmOpportunitiesByCompany: 'CRM opportunities (as company)',
  incentiveRecords: 'Incentive records',
  childContacts: 'Child contacts',
  employeeAssignments: 'Employee assignments',
  tsClients: 'Timesheet client records',
  timesheets: 'Timesheets',
};

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'activities', label: 'Activities' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'attachments', label: 'Attachments' },
];

// Module-scoped pipeline cache, carried over from the legacy page so tab-flips
// and back-nav don't re-hit /crm/opportunities. 5-min TTL.
const pipelineCache = new Map();
const PIPELINE_TTL_MS = 5 * 60 * 1000;

const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');

/* v2 Contact Detail (Phase 3a) — the detail archetype: header + Tabs +
   Panels of InlineFields, on ds only.

   Scope: the Details tab is fully migrated. Activities, Pipeline and
   Attachments render the existing legacy components inside the v2 shell.
   Create mode (/contacts/new-record) stays on the legacy page — it is a
   different flow (local-only state, explicit Save/Discard) and is not part of
   this phase. */
export default function ContactDetailV2() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { orgPath } = usePlatform();
  const { companyCountry, currentCompany } = useCompany();
  const { showToast } = useToast();
  const handleScoped404 = useCompanyScoped404('contact');
  const orgSlug = currentOrg?.slug;

  const fromInvoiceId = searchParams.get('from') === 'invoice' ? searchParams.get('invoiceId') : null;

  const [contact, setContact] = useState(null);
  const [childContacts, setChildContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [attachments, setAttachments] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const [opportunities, setOpportunities] = useState([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [salespersons, setSalespersons] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tagVocab, setTagVocab] = useState([]);

  usePageTitle(contact?.name || '');

  // Tab lives in the URL so a tab is linkable and survives reload. An unknown
  // ?tab= falls back to details rather than rendering nothing.
  const tabParam = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.key === tabParam) ? tabParam : 'details';
  const setActiveTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'details') next.delete('tab'); else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  // Archived contacts are read-only across the page, so the archive state is
  // folded into `isAdmin` and every `editable=` gate inherits it. `isAdminRaw`
  // is what gates un-archiving, which must stay available.
  const isAdminRaw = getAppRole('contacts') === 'admin';
  const isAdmin = isAdminRaw && !contact?.archived;

  // -- Fetch contact ----------------------------------------------------------
  const fetchContact = useCallback(async () => {
    if (!orgSlug || !contactId) return;
    setLoading(true);
    setNotFound(false);
    setChildContacts([]);
    try {
      const res = await contactsApi.get(orgSlug, contactId);
      if (res.success && res.contact) {
        setContact(res.contact);
        setChildContacts(res.childContacts || []);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      if (handleScoped404(err)) return;
      showToast('Failed to load contact', 'error');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, contactId, currentCompany?._id, showToast, handleScoped404]);

  useEffect(() => { fetchContact(); }, [fetchContact]);

  // 404 → toast once and bounce to the list. Ref-guarded because StrictMode
  // double-invokes effects in dev.
  const notFoundFiredRef = useRef(false);
  useEffect(() => {
    if (!notFound || notFoundFiredRef.current) return;
    notFoundFiredRef.current = true;
    showToast('Contact not found', 'error');
    navigate(orgPath('/contacts/list'), { replace: true });
  }, [notFound, navigate, orgPath, showToast]);

  // -- Dropdown data ----------------------------------------------------------
  // Reset first so a company switch can't leave the previous company's options
  // on screen if the new fetch returns nothing.
  useEffect(() => {
    if (!orgSlug) return undefined;
    let cancelled = false;
    setSalespersons([]); setPaymentTerms([]); setProducts([]); setCompanies([]); setTagVocab([]);

    contactsApi.listSalespersons(orgSlug).catch(() => ({ success: false }))
      .then((res) => { if (!cancelled && res.success) setSalespersons(res.salespersons || []); });
    invoicingApi.listPaymentTerms(orgSlug)
      .then((res) => { if (!cancelled) setPaymentTerms(res?.paymentTerms || []); }).catch(() => {});
    invoicingApi.listProducts(orgSlug)
      .then((res) => { if (!cancelled) setProducts(res?.products || []); }).catch(() => {});
    contactsApi.listTags(orgSlug)
      .then((res) => { if (!cancelled && res?.success) setTagVocab(res.tags || []); }).catch(() => {});
    // The parent-company picker filters client-side over the full company
    // list — the same thing the legacy ContactLookup does for type='company'.
    contactsApi.listCompanies(orgSlug)
      .then((res) => { if (!cancelled) setCompanies(res?.companies || []); }).catch(() => {});

    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  // -- Attachments ------------------------------------------------------------
  const loadAttachments = useCallback(async () => {
    if (!orgSlug || !contactId) return;
    setAttachLoading(true);
    try {
      const res = await contactsApi.listAttachments(orgSlug, contactId);
      if (res.success) setAttachments(res.documents || []);
    } catch { /* the panel's own empty state covers this */ }
    finally { setAttachLoading(false); }
  }, [orgSlug, contactId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  // -- Pipeline (lazy, on tab activation) -------------------------------------
  const loadPipeline = useCallback(async () => {
    if (!orgSlug || !contact?._id) return;
    const cacheKey = `${orgSlug}:${contact._id}`;
    const cached = pipelineCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PIPELINE_TTL_MS) {
      setOpportunities(cached.data);
      return;
    }
    setPipelineLoading(true);
    try {
      const params = contact.type === 'company'
        ? { contactCompanyId: contact._id, limit: 100 }
        : { contactId: contact._id, limit: 100 };
      const res = await crmApi.listOpportunities(orgSlug, params);
      if (res.success) {
        const data = res.opportunities || [];
        setOpportunities(data);
        pipelineCache.set(cacheKey, { data, ts: Date.now() });
      }
    } catch {
      showToast('Failed to load pipeline', 'error');
    } finally {
      setPipelineLoading(false);
    }
  }, [orgSlug, contact?._id, contact?.type, showToast]);

  useEffect(() => {
    if (activeTab === 'pipeline') loadPipeline();
  }, [activeTab, loadPipeline]);

  // -- Inline save ------------------------------------------------------------
  // These REJECT on failure: ds InlineField is pessimistic and needs the
  // rejection to keep the editor open with the user's text. The toast is a
  // second signal, not the only one.
  const saveField = useCallback(async (field, value) => {
    try {
      await contactsApi.update(orgSlug, contactId, { [field]: value });
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      throw err;
    }
    setContact((prev) => ({ ...prev, [field]: value }));
    showToast('Saved');
  }, [orgSlug, contactId, showToast]);

  const saveAddressField = useCallback(async (field, value) => {
    const nextAddress = { ...(contact?.address || {}), [field]: value };
    try {
      await contactsApi.update(orgSlug, contactId, { address: nextAddress });
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      throw err;
    }
    setContact((prev) => ({ ...prev, address: nextAddress }));
    showToast('Saved');
  }, [orgSlug, contactId, contact?.address, showToast]);

  // -- Destructive actions ----------------------------------------------------
  const handleDelete = async ({ force = false } = {}) => {
    setDeleting(true);
    try {
      const res = await contactsApi.delete(orgSlug, contactId, { force });
      if (res.status === 409) {
        setDeleteConflict(res);
        setShowDeleteModal(false);
        setDeleting(false);
        return;
      }
      if (res.success) {
        const count = res.childrenDeleted || 0;
        showToast(contact.type === 'company' && count > 0
          ? `Company and ${count} related contact(s) deleted`
          : 'Contact deleted successfully');
        navigate(orgPath('/contacts/list'), { replace: true });
        return;
      }
      showToast(res.error || 'Failed to delete', 'error');
    } catch (err) {
      showToast(err?.message || 'Failed to delete contact', 'error');
    }
    setDeleting(false);
    setShowDeleteModal(false);
    setDeleteConflict(null);
  };

  const openArchiveModal = async () => {
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await contactsApi.archivePreview(orgSlug, contactId);
      setArchivePreview(res || { dependencies: [] });
    } catch {
      setArchivePreview({ dependencies: [] });
    }
  };

  const handleArchive = async (cascade = false) => {
    setArchiving(true);
    try {
      const res = await contactsApi.archive(orgSlug, contactId, { cascade });
      setShowArchiveModal(false);
      setContact((c) => ({ ...c, archived: true }));
      const cnt = res?.cascadedChildCount || 0;
      showToast(cascade && cnt > 0 ? `Archived (with ${cnt} contact${cnt === 1 ? '' : 's'})` : 'Archived');
    } catch (err) {
      showToast(err?.message || 'Failed to archive', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    try {
      await contactsApi.unarchive(orgSlug, contactId);
      setContact((c) => ({ ...c, archived: false }));
      showToast('Unarchived');
    } catch (err) {
      showToast(err?.message || 'Failed to unarchive', 'error');
    }
  };

  // -- Child-contact picker ---------------------------------------------------
  // Rejects rather than toasting alone: EntityLookup is pessimistic and keeps
  // its own error state.
  const handleAddPerson = async (individualId) => {
    if (!individualId || !contactId) return;
    try {
      await contactsApi.update(orgSlug, individualId, { parentCompanyId: contactId });
    } catch (err) {
      showToast(err?.message || 'Failed to link person', 'error');
      throw err;
    }
    showToast('Person linked');
    fetchContact();
  };

  const linkedIds = childContacts.map((c) => c._id);
  const searchIndividuals = useCallback(async (query) => {
    const res = await contactsApi.list(orgSlug, { type: 'individual', search: query, limit: 25 });
    return (res?.contacts || [])
      // Already-linked people would be a no-op pick.
      .filter((c) => !linkedIds.includes(c._id))
      .map((c) => ({ value: c._id, label: c.name, sub: c.jobTitle || c.email || '' }));
  }, [orgSlug, linkedIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const createIndividual = useCallback(async (name) => {
    const res = await contactsApi.create(orgSlug, { type: 'individual', name, parentCompanyId: contactId });
    const created = res?.contact;
    if (!created?._id) throw new Error('Could not create that contact');
    return { value: created._id, label: created.name };
  }, [orgSlug, contactId]);

  // -- Derived options --------------------------------------------------------
  const salespersonOptions = useMemo(
    () => salespersons.map((sp) => ({ value: sp._id, label: sp.name })), [salespersons]);
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c._id, label: c.name })), [companies]);
  const paymentTermOptions = useMemo(
    () => [{ value: '', label: '— None —' }, ...paymentTerms.map((pt) => ({ value: pt._id, label: pt.name }))],
    [paymentTerms]);
  const productOptions = useMemo(
    () => [{ value: '', label: '— None —' },
      ...products.map((p) => ({ value: p._id, label: (p.internalRef ? `[${p.internalRef}] ` : '') + p.name }))],
    [products]);
  const tagOptions = useMemo(
    () => tagVocab.map((t) => ({ value: t._id, label: t.name })), [tagVocab]);

  if (loading) {
    return (
      <SkeletonPage style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1080 }}>
        <SkeletonHeader withButton />
        <SkeletonTabs widths={[62, 78, 70, 92]} />
        <SkeletonTwoCard />
      </SkeletonPage>
    );
  }
  if (notFound || !contact) {
    // The redirect effect is already in flight; hold the frame rather than
    // flashing an error the user can't act on.
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}><Spinner /></div>;
  }

  const addr = contact.address || {};
  const isCompany = contact.type === 'company';
  const billingLocale = getAddressLocale(addr.country);

  const websiteHref = contact.website
    ? (/^https?:\/\//i.test(contact.website) ? contact.website : `https://${contact.website}`)
    : null;

  const quickLink = (href, icon, text, title, external) => (
    <a
      href={href}
      title={title}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
        borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2, #141b24)',
        boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
        font: "500 11.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-3, #98a4b2)',
      }}
    >
      {icon} {text}
    </a>
  );

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1080 }}>
      {fromInvoiceId && (
        <button
          type="button"
          onClick={() => navigate(orgPath(`/invoicing/invoices/${fromInvoiceId}`))}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
            font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--brand, #22c55e)',
          }}
        >
          ← Back to Invoice
        </button>
      )}

      {/* ── Header ── */}
      <Panel style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16, padding: 10, flexWrap: 'wrap' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 999, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: isCompany ? 'color-mix(in srgb, var(--info, #38bdf8) 14%, transparent)' : undefined,
          }}>
            {isCompany
              ? <Building2 size={26} style={{ color: 'var(--info, #38bdf8)' }} />
              : <Avatar name={contact.name} size="lg" />}
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <EditableHeading
                  value={contact.title ? `${contact.title} ${contact.name}` : contact.name}
                  editable={isAdmin}
                  placeholder={isCompany ? 'e.g. Lumber Inc' : 'e.g. John Doe'}
                  // Strip an honorific the user may have typed back in — the
                  // API stores it separately in `title`.
                  transform={(v) => v.replace(TITLE_PREFIX_RE, '').trim() || v}
                  onSave={(next) => saveField('name', next)}
                />
                {contact.jobTitle && (
                  <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginTop: 2 }}>
                    {contact.jobTitle}
                  </p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  {contact.archived && <Chip tone="warn" uppercase dot>Archived</Chip>}
                  <Chip tone={isCompany ? 'info' : 'brand'}>{isCompany ? 'Company' : 'Individual'}</Chip>
                  {contact.isCustomer && <Chip tone="brand">Customer</Chip>}
                  {contact.isSupplier && <Chip tone="warn">Supplier</Chip>}
                  {(contact.tagNames || []).map((t, i) => <Chip key={i}>{t}</Chip>)}
                </div>

                {(contact.email || contact.phone || contact.mobile || contact.website) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {contact.email && quickLink(`mailto:${contact.email}`, <Mail size={12} />, 'Email', contact.email)}
                    {(contact.phone || contact.mobile) && quickLink(`tel:${contact.phone || contact.mobile}`, <Phone size={12} />, 'Call', contact.phone || contact.mobile)}
                    {websiteHref && quickLink(websiteHref, <Globe size={12} />, 'Website', contact.website, true)}
                  </div>
                )}

                <RecordMeta
                  style={{ marginTop: 10 }}
                  createdAt={contact.createdAt}
                  createdByName={contact.createdByName}
                  updatedAt={contact.updatedAt}
                  updatedByName={contact.updatedByName}
                />
              </div>

              {isAdminRaw && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {contact.archived ? (
                    <Button variant="secondary" size="sm" iconLeft={<ArchiveRestore size={14} />} onClick={handleUnarchive}>
                      Unarchive
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" iconLeft={<Archive size={14} />} onClick={openArchiveModal}>
                      Archive
                    </Button>
                  )}
                  <div style={{ position: 'relative' }}>
                    <Button variant="ghost" size="sm" aria-label="More actions" onClick={() => setShowKebab((o) => !o)}>
                      <MoreHorizontal size={16} />
                    </Button>
                    {showKebab && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowKebab(false)} />
                        <div style={{
                          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, width: 232, padding: 4,
                          background: 'var(--surface-1, #0e131a)', borderRadius: 'var(--r-2, 10px)',
                          boxShadow: '0 0 0 1px var(--line-2, rgba(255,255,255,.11)), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.6))',
                        }}>
                          {isOrgAdmin ? (
                            <button
                              type="button"
                              onClick={() => { setShowKebab(false); setShowDeleteModal(true); }}
                              style={{
                                width: '100%', display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left',
                                padding: '8px 10px', borderRadius: 'var(--r-1, 7px)', background: 'transparent',
                                color: 'var(--danger, #ef4444)',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #141b24)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <Trash2 size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                              <span>
                                <span style={{ display: 'block', font: "550 12px/1.4 'Inter', system-ui, sans-serif" }}>Delete permanently</span>
                                <span style={{ display: 'block', font: "450 10.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginTop: 1 }}>
                                  Cannot be recovered. Use Archive instead.
                                </span>
                              </span>
                            </button>
                          ) : (
                            <div style={{ padding: '8px 10px', font: "450 11px/1.4 'Inter', system-ui, sans-serif", fontStyle: 'italic', color: 'var(--fg-4, #828e9f)' }}>
                              No admin actions available.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} style={{ marginBottom: 18 }} />

      {/* ── Details ── */}
      {activeTab === 'details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
            <Panel icon={<Mail size={14} />} title="Contact Information">
              <InlineField label="Email" field="email" type="email" value={contact.email} editable={isAdmin} onSave={saveField} placeholder="Add email" />
              <InlineField label="Phone" field="phone" type="phone" value={contact.phone} editable={isAdmin} onSave={saveField} placeholder="Add phone" />
              <InlineField label="Mobile" field="mobile" type="phone" value={contact.mobile} editable={isAdmin} onSave={saveField} placeholder="Add mobile" />
              <InlineField label="Website" field="website" type="url" value={contact.website} editable={isAdmin} onSave={saveField} placeholder="Add website" />
              <InlineField label="LinkedIn" field="linkedinUrl" type="url" value={contact.linkedinUrl} editable={isAdmin} onSave={saveField} placeholder="Add LinkedIn URL" />
            </Panel>

            <Panel
              icon={isCompany ? <Building2 size={14} /> : <Briefcase size={14} />}
              title={isCompany ? 'Company Details' : 'Work Details'}
            >
              {isCompany ? (
                <InlineField
                  label="Employees" field="_childCount" editable={false} onSave={saveField}
                  displayValue={childContacts.length > 0 ? `${childContacts.length} contact(s)` : '—'}
                />
              ) : (
                <>
                  <InlineField label="Job Title" field="jobTitle" value={contact.jobTitle} editable={isAdmin} onSave={saveField} placeholder="Add job title" />
                  <InlineComboField
                    label="Company"
                    field="parentCompanyId"
                    value={contact.parentCompanyId || ''}
                    options={companyOptions}
                    // The name is denormalised onto the contact, so the row
                    // reads correctly even before the company list lands.
                    displayValue={contact.parentCompanyName}
                    editable={isAdmin}
                    onSave={async (field, val) => {
                      await saveField(field, val || null);
                      setContact((prev) => ({
                        ...prev,
                        parentCompanyName: companies.find((c) => c._id === val)?.name || null,
                      }));
                    }}
                    placeholder="Search companies…"
                  />
                  {contact.parentCompanyId && (
                    <div style={{ padding: '2px 0 6px 148px' }}>
                      <Link
                        to={orgPath(`/contacts/${contact.parentCompanyId}`)}
                        style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand, #22c55e)' }}
                      >
                        Open company →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </Panel>

            {/* Country leads the section so the rest of the rows re-label
                before the user types into them. */}
            <Panel icon={<MapPin size={14} />} title="Billing Address">
              <InlineField label="Country" field="country" value={addr.country} editable={isAdmin} onSave={saveAddressField} placeholder="Add country" />
              <InlineField label={billingLocale.street1Label} field="street" value={addr.street} editable={isAdmin} onSave={saveAddressField} placeholder={billingLocale.street1Placeholder || 'Add street'} />
              <InlineField label={billingLocale.street2Label} field="street2" value={addr.street2} editable={isAdmin} onSave={saveAddressField} placeholder={billingLocale.street2Placeholder || 'Apt, Suite, Floor'} />
              <InlineField label={billingLocale.cityLabel} field="city" value={addr.city} editable={isAdmin} onSave={saveAddressField} placeholder={billingLocale.cityPlaceholder || 'Add city'} />
              <InlineField label={billingLocale.stateLabel} field="state" value={addr.state} editable={isAdmin} onSave={saveAddressField} placeholder={billingLocale.statePlaceholder || 'Add state'} />
              <InlineField label={billingLocale.zipLabel} field="zip" value={addr.zip} editable={isAdmin} onSave={saveAddressField} placeholder={billingLocale.zipPlaceholder || 'Add postal code'} warn={validateZip(addr.zip, addr.country)} />
            </Panel>

            <Panel icon={<Users size={14} />} title="Classification">
              <InlineComboField
                label="Salesperson"
                field="salespersonId"
                value={contact.salespersonId || ''}
                options={salespersonOptions}
                displayValue={contact.salespersonName}
                editable={isAdmin}
                onSave={async (field, val) => {
                  await saveField(field, val || null);
                  setContact((prev) => ({
                    ...prev,
                    salespersonName: salespersons.find((sp) => sp._id === val)?.name || null,
                  }));
                }}
                placeholder="Search employees…"
              />
              {/* Legacy passed the product/payment-term *label* as `value`, so
                  the select opened with nothing selected. These pass the id. */}
              <InlineField
                label="Product" field="defaultProductId" type="select" options={productOptions}
                value={contact.defaultProductId || ''} editable={isAdmin}
                onSave={(field, val) => saveField(field, val || null)}
                placeholder="Select default product"
              />
              <InlineField label="Customer" field="isCustomer" type="toggle" value={!!contact.isCustomer} editable={isAdmin} onSave={saveField} />
              <InlineField label="Supplier" field="isSupplier" type="toggle" value={!!contact.isSupplier} editable={isAdmin} onSave={saveField} />
            </Panel>

            <Panel icon={<Receipt size={14} />} title="Tax Information">
              {companyCountry === 'IN' && (
                <>
                  <InlineField label="GST Treatment" field="gstTreatment" type="select" options={GST_TREATMENT_OPTIONS} value={contact.gstTreatment} editable={isAdmin} onSave={saveField} />
                  <InlineField label="GSTIN" field="gstin" value={contact.gstin} editable={isAdmin} onSave={saveField} placeholder="29AALCR0152L1Z2" maxLength={15} transform={(v) => v.toUpperCase()} />
                  <InlineField label="PAN" field="pan" value={contact.pan} editable={isAdmin} onSave={saveField} placeholder="AALCR0152L" maxLength={10} transform={(v) => v.toUpperCase()} />
                  <InlineField label="TAN" field="tan" value={contact.tan} editable={isAdmin} onSave={saveField} placeholder="BLRR12345A" maxLength={10} transform={(v) => v.toUpperCase()} />
                  <InlineField label="Place of Supply" field="placeOfSupply" value={contact.placeOfSupply} editable={isAdmin} onSave={saveField} placeholder="e.g. Karnataka (KA)" />
                </>
              )}
              {companyCountry === 'US' && (
                <>
                  <InlineField label="Tax ID (EIN)" field="taxId" value={contact.taxId || contact.gstin} editable={isAdmin} onSave={saveField} placeholder="XX-XXXXXXX" />
                  <InlineField label="State" field="placeOfSupply" value={contact.placeOfSupply || addr.state} editable={isAdmin} onSave={saveField} placeholder="e.g. California" />
                </>
              )}
              {companyCountry === 'CA' && (
                <>
                  <InlineField label="GST/HST Number" field="taxId" value={contact.taxId || contact.gstin} editable={isAdmin} onSave={saveField} placeholder="123456789 RT0001" />
                  <InlineField label="Province" field="placeOfSupply" value={contact.placeOfSupply || addr.state} editable={isAdmin} onSave={saveField} placeholder="e.g. Ontario" />
                </>
              )}
              <InlineField label="Country Code" field="countryCode" value={contact.countryCode} editable={isAdmin} onSave={saveField} placeholder={companyCountry || 'IN'} />
              <InlineField
                label="Payment Terms" field="defaultPaymentTermId" type="select" options={paymentTermOptions}
                value={contact.defaultPaymentTermId || ''} editable={isAdmin}
                onSave={(field, val) => saveField(field, val || null)}
              />
              <InlineField
                label="Default Currency" field="defaultCurrency" type="select" options={CURRENCY_OPTIONS}
                value={contact.defaultCurrency || ''} editable={isAdmin}
                onSave={(field, val) => saveField(field, val || null)}
              />
            </Panel>

            <Panel icon={<Tag size={14} />} title="Tags">
              <TagPicker
                value={contact.tags || []}
                options={tagOptions}
                editable={isAdmin}
                onChange={(nextIds) => {
                  const prev = contact.tags || [];
                  const prevNames = contact.tagNames || [];
                  setContact((c) => ({
                    ...c,
                    tags: nextIds,
                    tagNames: nextIds.map((id) => tagOptions.find((o) => o.value === id)?.label || id),
                  }));
                  contactsApi.update(orgSlug, contactId, { tags: nextIds })
                    .then(() => showToast('Tags updated'))
                    .catch((err) => {
                      // TagPicker is fire-and-forget, so the revert is ours.
                      setContact((c) => ({ ...c, tags: prev, tagNames: prevNames }));
                      showToast(err.message || 'Failed to save tags', 'error');
                    });
                }}
              />
            </Panel>
          </div>

          {isCompany && (
            <Panel
              icon={<Users size={14} />}
              title={`Contacts at ${contact.name}`}
              flush
              actions={isAdmin ? (
                <EntityLookup
                  variant="button"
                  triggerLabel="Add person"
                  editable
                  placeholder="Search people…"
                  search={searchIndividuals}
                  onCreate={createIndividual}
                  onSelect={(_f, id) => handleAddPerson(id)}
                />
              ) : null}
            >
              <DataTable
                columns={[
                  {
                    key: 'name', header: 'Name',
                    render: (c) => (
                      <Link to={orgPath(`/contacts/${c._id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Avatar name={c.name} size="sm" />
                        <span style={{ color: 'var(--fg, #eef2f6)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      </Link>
                    ),
                  },
                  { key: 'jobTitle', header: 'Job Title', render: (c) => (c.jobTitle ? <Chip>{c.jobTitle}</Chip> : '—') },
                  { key: 'email', header: 'Email', muted: true },
                  { key: 'phone', header: 'Phone', muted: true },
                  ...(isAdmin ? [{
                    key: '_actions', header: '', width: 44, align: 'right',
                    render: (c) => (
                      <button
                        type="button"
                        title="Delete contact"
                        aria-label={`Delete ${c.name}`}
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ kind: 'child', item: c }); }}
                        style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-4, #828e9f)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    ),
                  }] : []),
                ]}
                rows={childContacts}
                rowKey={(c) => c._id}
                resizable={false}
                empty={(
                  <EmptyState icon={<Users size={22} />} title="No people linked yet" compact>
                    {isAdmin ? 'Use “Add person” to link an individual contact.' : 'Nobody is linked to this company.'}
                  </EmptyState>
                )}
              />
            </Panel>
          )}

          <Panel icon={<FileText size={14} />} title="Internal Notes">
            <InlineField
              label="Notes" field="internalNotes" type="textarea" value={contact.internalNotes}
              editable={isAdmin} onSave={saveField}
              placeholder="Add internal notes about this contact…"
            />
          </Panel>
        </div>
      )}

      {/* ── Activities (legacy island) ── */}
      {activeTab === 'activities' && (
        <>
          <ActivityPanelV2 orgSlug={orgSlug} entityType="crm_contact" entityId={contactId} canEdit={isAdmin} />
          <div style={{ marginTop: 16 }}>
            <SignRequestWidget
              orgSlug={orgSlug}
              linkedModel="contact"
              linkedId={contactId}
              prefillData={{
                name: contact.name || '', email: contact.email || '',
                phone: contact.phone || '', company: contact.parentCompanyName || '',
              }}
            />
          </div>
        </>
      )}

      {/* ── Pipeline ── */}
      {activeTab === 'pipeline' && (
        <Panel
          icon={<Briefcase size={14} />}
          title="Pipeline"
          actions={<Chip>{pipelineLoading ? '…' : `${opportunities.length} deal${opportunities.length !== 1 ? 's' : ''}`}</Chip>}
        >
          {pipelineLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Spinner /></div>
          ) : opportunities.length === 0 ? (
            <EmptyState icon={<Briefcase size={22} />} title="No deals yet" compact>
              Opportunities linked to this contact will appear here.
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {opportunities.map((opp) => (
                <button
                  key={opp._id}
                  type="button"
                  onClick={() => navigate(withFromContext(orgPath(`/crm/opportunities/${opp._id}`), 'crm_contact', contactId))}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: 12,
                    borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-2, #141b24)',
                    boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)' }}>{opp.name}</span>
                    {opp.isLost
                      ? <Chip tone="danger">Lost</Chip>
                      : opp.wonAt ? <Chip tone="warn">Won</Chip> : <Chip>{opp.stageName || 'Unknown'}</Chip>}
                    {opp.isConverted && <Chip tone="brand">Converted</Chip>}
                  </div>
                  {/* Joined rather than per-item prefixed: legacy hardcoded a
                      leading "· " on every part after the first, so a deal
                      with no revenue opened with a stray separator.
                      Per-currency: the opp's own currency, then the contact's
                      default, then INR. Never a hardcoded ₹. */}
                  <div style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' }}>
                    {[
                      opp.expectedRevenue ? formatCurrency(opp.expectedRevenue, opp.currency || contact.defaultCurrency || 'INR') : null,
                      opp.expectedRole || null,
                      opp.salespersonName || null,
                      opp.updatedAt ? fmtDate(opp.updatedAt) : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ── Attachments ── */}
      {activeTab === 'attachments' && (
        <Panel
          icon={<Paperclip size={14} />}
          title="Attachments"
          actions={<Chip>{attachments.length} file{attachments.length !== 1 ? 's' : ''}</Chip>}
        >
          {isAdmin && (
            <label
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px', marginBottom: 12, cursor: attachUploading ? 'default' : 'pointer',
                borderRadius: 'var(--r-2, 10px)', border: '1.5px dashed var(--line-2, rgba(255,255,255,.11))',
                font: "450 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)',
              }}
            >
              {attachUploading ? <><Spinner size={14} /> Uploading…</> : <><Upload size={15} /> Click to upload a file</>}
              <input
                type="file"
                style={{ display: 'none' }}
                disabled={attachUploading}
                onChange={async (e) => {
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
                }}
              />
            </label>
          )}

          {attachLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Spinner /></div>
          ) : attachments.length === 0 ? (
            <EmptyState icon={<Paperclip size={22} />} title="No attachments" compact>
              {isAdmin ? 'Upload a file to attach it to this contact.' : 'Nothing has been attached to this contact.'}
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((doc) => {
                const isImage = doc.mimeType?.startsWith('image/');
                const isPdf = doc.mimeType === 'application/pdf';
                const previewable = isImage || isPdf;
                const openDoc = () => {
                  if (previewable) { setPreviewDoc(doc); return; }
                  const url = contactsApi.getAttachmentUrl(orgSlug, contactId, doc._id);
                  const token = localStorage.getItem('rivvra_token');
                  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = doc.filename;
                      a.click();
                    })
                    .catch(() => showToast('Download failed', 'error'));
                };
                return (
                  <div
                    key={doc._id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                      borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-2, #141b24)',
                      boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
                    }}
                  >
                    <button
                      type="button"
                      onClick={openDoc}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent' }}
                      title={previewable ? 'Preview' : 'Download'}
                    >
                      <span style={{
                        width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-3, #1c242f)',
                      }}>
                        {isImage ? <Eye size={15} style={{ color: 'var(--info, #38bdf8)' }} />
                          : isPdf ? <FileText size={15} style={{ color: 'var(--danger, #ef4444)' }} />
                            : <Paperclip size={15} style={{ color: 'var(--fg-4, #828e9f)' }} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg, #eef2f6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.filename}
                        </span>
                        <span style={{ display: 'block', font: "450 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' }}>
                          {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''}{doc.uploadedAt ? ` · ${fmtDate(doc.uploadedAt)}` : ''}
                        </span>
                      </span>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ kind: 'attachment', item: doc })}
                        title="Delete"
                        aria-label={`Delete ${doc.filename}`}
                        style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-4, #828e9f)', flexShrink: 0 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
        </Panel>
      )}

      {/* ── Archive ── */}
      <Modal
        open={showArchiveModal}
        onClose={archiving ? undefined : () => setShowArchiveModal(false)}
        tone="warn"
        icon={<Archive size={16} />}
        title={`Archive ${isCompany ? 'company' : 'contact'}`}
        sub={`${contact.name} will be hidden from list views and become read-only. You can restore it at any time.`}
        footer={(
          <>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" disabled={archiving} onClick={() => setShowArchiveModal(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" disabled={archiving} onClick={() => handleArchive(false)}>
              Archive {isCompany ? 'company' : 'contact'} only
            </Button>
            {isCompany && archivePreview?.dependencies?.some((d) => d.type === 'contacts_individual') && (
              <Button variant="primary" size="sm" disabled={archiving} onClick={() => handleArchive(true)}>
                Archive with child contacts
              </Button>
            )}
          </>
        )}
      >
        {archivePreview === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "450 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)' }}>
            <Spinner size={13} /> Checking linked records…
          </div>
        ) : archivePreview.dependencies?.length > 0 ? (
          <div style={{
            padding: 12, borderRadius: 'var(--r-2, 10px)',
            background: 'color-mix(in srgb, var(--warn, #f59e0b) 8%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--warn, #f59e0b) 22%, transparent)',
          }}>
            <p style={{ font: "550 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn, #f59e0b)', marginBottom: 6 }}>Linked records</p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {archivePreview.dependencies.map((d, i) => (
                <li key={i} style={{ font: "450 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #c3ccd6)' }}>
                  {d.label}
                  {d.informational && <span style={{ color: 'var(--fg-4, #828e9f)' }}> (won&apos;t be archived)</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      {/* ── Delete ── */}
      <Modal
        open={showDeleteModal}
        onClose={deleting ? undefined : () => setShowDeleteModal(false)}
        tone="danger"
        icon={<Trash2 size={16} />}
        title={`Delete ${isCompany ? 'company' : 'contact'}`}
        sub={`${contact.name} will be permanently removed. This cannot be undone.`}
        footer={(
          <>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={deleting} onClick={() => handleDelete()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        )}
      >
        {isCompany && childContacts.length > 0 && (
          <p style={{ font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--danger, #ef4444)' }}>
            This also deletes {childContacts.length} related individual contact{childContacts.length !== 1 ? 's' : ''}.
          </p>
        )}
      </Modal>

      {/* ── Delete blocked by FK references (409) ── */}
      <Modal
        open={!!deleteConflict}
        onClose={deleting ? undefined : () => { setDeleteConflict(null); setDeleting(false); }}
        tone="danger"
        size="md"
        icon={<Trash2 size={16} />}
        title={`Can't delete ${contact.name}`}
        sub={`Referenced by ${deleteConflict?.totalRefs || 0} other record${(deleteConflict?.totalRefs || 0) === 1 ? '' : 's'}. Reassign them first, or force the delete and leave those records orphaned.`}
        footer={(
          <>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" disabled={deleting} onClick={() => { setDeleteConflict(null); setDeleting(false); }}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={deleting} onClick={() => handleDelete({ force: true })}>
              {deleting ? 'Deleting…' : 'Force delete'}
            </Button>
          </>
        )}
      >
        {deleteConflict && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 'var(--r-2, 10px)', boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))', overflow: 'hidden' }}>
              {Object.entries(deleteConflict.references || {}).filter(([, n]) => n > 0).map(([key, count], i) => (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '7px 12px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line, rgba(255,255,255,.07))',
                  font: "450 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #c3ccd6)',
                }}>
                  <span>{REFERENCE_LABELS[key] || key}</span>
                  <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 550 }}>{count}</span>
                </div>
              ))}
            </div>
            {deleteConflict.samples?.invoices?.length > 0 && (
              <div>
                <p style={{ font: "550 10.5px/1.4 'Inter', system-ui, sans-serif", textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-4, #828e9f)', marginBottom: 4 }}>Sample invoices</p>
                <ul style={{ paddingLeft: 16 }}>
                  {deleteConflict.samples.invoices.map((inv) => (
                    <li key={inv._id} style={{ listStyle: 'disc', font: "450 12px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #c3ccd6)' }}>
                      {inv.invoiceNumber || inv._id}{inv.type === 'credit_note' ? ' (credit note)' : ''}{inv.status ? ` — ${inv.status}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {deleteConflict.samples?.childContacts?.length > 0 && (
              <div>
                <p style={{ font: "550 10.5px/1.4 'Inter', system-ui, sans-serif", textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-4, #828e9f)', marginBottom: 4 }}>Sample child contacts</p>
                <ul style={{ paddingLeft: 16 }}>
                  {deleteConflict.samples.childContacts.map((c) => (
                    <li key={c._id} style={{ listStyle: 'disc', font: "450 12px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #c3ccd6)' }}>
                      {c.name}{c.email ? ` — ${c.email}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Child-contact and attachment deletes. `danger`, so Enter does not
          confirm — see ds/Overlay/ConfirmDialog. */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.kind === 'child' ? 'Delete contact?' : confirmDelete?.kind === 'attachment' ? 'Delete attachment?' : ''}
        message={
          confirmDelete?.kind === 'child'
            ? `Delete contact "${confirmDelete.item?.name}"? This cannot be undone.`
            : confirmDelete?.kind === 'attachment'
              ? `Delete "${confirmDelete.item?.filename}"? This cannot be undone.`
              : ''
        }
        confirmLabel="Delete"
        danger
        busy={!!confirmDelete?.busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setConfirmDelete((p) => p && { ...p, busy: true });
          try {
            if (confirmDelete.kind === 'child') {
              const child = confirmDelete.item;
              const res = await contactsApi.delete(orgSlug, child._id);
              if (res.status === 409) {
                showToast('Contact has linked records and can’t be deleted here. Open the contact to review.', 'error');
              } else if (res.success) {
                showToast('Contact deleted');
                setChildContacts((prev) => prev.filter((c) => c._id !== child._id));
              } else {
                showToast(res.error || 'Failed to delete', 'error');
              }
            } else if (confirmDelete.kind === 'attachment') {
              await contactsApi.deleteAttachment(orgSlug, contactId, confirmDelete.item._id);
              showToast('Attachment deleted');
              await loadAttachments();
            }
          } catch (err) {
            showToast(err?.message || 'Failed to delete', 'error');
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}
