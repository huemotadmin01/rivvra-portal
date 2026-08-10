import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import employeeApi from '../../utils/employeeApi';
import ComboSelect from '../../components/ComboSelect';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, Mail, Phone, Building2, UserCheck, Sparkles } from 'lucide-react';

/**
 * CrmOpportunityNew — minimal routed create flow.
 *
 * Picks an existing contact, derives Company / Email / Phone / Salesperson
 * from that contact (read-only preview), and posts a single field —
 * contactId — to the API. Net-new contacts go through Outreach → Lead →
 * Convert; this form does not create contacts inline.
 *
 * Salesperson resolution happens server-side
 * (contact → company → creator) and the preview here mirrors that
 * order so the user sees the same value before submit.
 */
export default function CrmOpportunityNew() {
  const { orgSlug: slug, isOrgAdmin } = useOrg();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Opportunity');

  const [contactId, setContactId] = useState('');
  // Sticky picked contact — survives list refetches when the user types
  // a new search and the previously-picked record falls out of results.
  const [pickedContact, setPickedContact] = useState(null);
  const [oppName, setOppName] = useState('');
  const [oppNameDirty, setOppNameDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  // Admin-only salesperson override. Non-admins always get the creator as
  // salesperson server-side, so we don't render the picker for them.
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [salespersonId, setSalespersonId] = useState('');

  // 2026-05-14: contacts now refetch on every typed query (debounced
  // inside ComboSelect) instead of a one-shot pre-load of the first
  // 500. Pre-load was a hard cap — tenants with more contacts saw the
  // tail of their list silently disappear from the picker.
  useEffect(() => {
    if (!slug) return;
    const params = { type: 'individual', limit: 50 };
    if (contactSearch) params.search = contactSearch;
    contactsApi.list(slug, params)
      .then((res) => { if (res.success) setIndividualContacts(res.contacts || []); })
      .catch(() => {});
  }, [slug, contactSearch]);

  useEffect(() => {
    if (!slug) return;
    contactsApi.listCompanies(slug)
      .then((res) => { if (res.success) setCompanyContacts(res.companies || []); })
      .catch(() => {});
  }, [slug]);

  const companiesById = useMemo(() => {
    const map = new Map();
    for (const c of companyContacts) map.set(String(c._id), c);
    return map;
  }, [companyContacts]);

  const selectedContact = useMemo(
    () => pickedContact || individualContacts.find((c) => c._id === contactId) || null,
    [pickedContact, individualContacts, contactId]
  );

  const parentCompany = useMemo(() => {
    if (!selectedContact?.parentCompanyId) return null;
    return companiesById.get(String(selectedContact.parentCompanyId)) || null;
  }, [selectedContact, companiesById]);

  // Load active employees for the admin salesperson picker.
  useEffect(() => {
    if (!slug || !isOrgAdmin) return;
    employeeApi.list(slug, { status: 'active', limit: 500 })
      .then((res) => {
        if (res?.success) {
          const list = res.employees || res.data || [];
          setEmployeeOptions(list.map((e) => ({ _id: String(e._id), name: e.fullName || e.name || e.email })));
        }
      })
      .catch(() => {});
  }, [slug, isOrgAdmin]);

  // Server now defaults salesperson to the creator (not the contact's
  // salesperson). Preview mirrors that so admins/non-admins see the same
  // truth as the server will write. Admin can override via the picker.
  const selectedEmployeeName = useMemo(() => {
    if (!salespersonId) return null;
    return employeeOptions.find((e) => e._id === salespersonId)?.name || null;
  }, [salespersonId, employeeOptions]);

  const resolvedSalesperson = useMemo(() => {
    if (isOrgAdmin && selectedEmployeeName) return selectedEmployeeName;
    return user?.name || user?.email || 'You';
  }, [isOrgAdmin, selectedEmployeeName, user]);

  const pocOptions = useMemo(
    () => individualContacts.map((c) => ({
      _id: c._id,
      name: c.parentCompanyName ? `${c.parentCompanyName}, ${c.name}` : c.name,
    })),
    [individualContacts]
  );

  // Auto-fill opportunity name from the selected contact, but stop once
  // the user edits it manually so we don't clobber their input.
  useEffect(() => {
    if (oppNameDirty) return;
    if (selectedContact) {
      setOppName(`${selectedContact.name}'s opportunity`);
    } else {
      setOppName('');
    }
  }, [selectedContact, oppNameDirty]);

  const canSubmit = Boolean(contactId) && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = { contactId, name: oppName.trim() || undefined };
      // Only admins may assign on behalf of someone else. The API enforces
      // this; we just send the field when the admin explicitly picked one.
      if (isOrgAdmin && salespersonId) payload.salespersonId = salespersonId;
      const res = await crmApi.createOpportunity(slug, payload);
      if (res?.success) {
        addToast('Opportunity created', 'success');
        const id = res.opportunity?._id || res._id;
        if (id) navigate(`/org/${slug}/crm/opportunities/${id}`, { replace: true });
        else navigate(`/org/${slug}/crm/opportunities`, { replace: true });
      } else {
        addToast(res?.error || 'Failed to create opportunity', 'error');
      }
    } catch (err) {
      addToast(err?.message || 'Failed to create opportunity', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors mb-6"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-white tracking-tight">New Opportunity</h1>
        <p className="text-dark-400 text-[13px] mt-1.5 leading-relaxed">
          Pick an existing customer contact. For net-new customers, use{' '}
          <a
            href={`/org/${slug}/outreach`}
            className="text-rivvra-400 hover:text-rivvra-300 underline-offset-2 hover:underline"
          >
            Outreach
          </a>{' '}
          to qualify the lead first.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card p-5 space-y-5">
          {/* POC picker */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-dark-500 font-medium block mb-2">
              Customer's POC <span className="text-rivvra-400">*</span>
            </label>
            <ComboSelect
              value={contactId}
              displayValue={
                selectedContact
                  ? (selectedContact.parentCompanyName
                      ? `${selectedContact.parentCompanyName}, ${selectedContact.name}`
                      : selectedContact.name)
                  : ''
              }
              options={pocOptions}
              onChange={(id) => {
                setContactId(id || '');
                // Pin the picked contact so a subsequent search refetch
                // can't make the preview disappear.
                const found = individualContacts.find((c) => c._id === id) || null;
                if (found) setPickedContact(found);
                if (!id) setPickedContact(null);
              }}
              onSearch={(q) => setContactSearch(q)}
              placeholder="Search by company or contact name…"
              disableCreate
            />
          </div>

          {/* Admin-only salesperson override. Non-admins always inherit the
              creator (themselves) server-side, so we hide this field for
              them rather than show a disabled control that hints at a
              permission they don't have. */}
          {isOrgAdmin && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-dark-500 font-medium block mb-2">
                Salesperson <span className="text-dark-500 normal-case tracking-normal">(defaults to you)</span>
              </label>
              <ComboSelect
                value={salespersonId}
                displayValue={selectedEmployeeName || ''}
                options={employeeOptions}
                onChange={(id) => setSalespersonId(id || '')}
                placeholder="You (creator) — pick to assign someone else"
                disableCreate
              />
            </div>
          )}

          {/* Preview card — appears after picking. Tighter, no decorative
              header; the auto-filled label moves to a small chip in the
              corner so the card feels like a continuation of the form,
              not a separate panel. */}
          {selectedContact && (
            <div className="relative bg-dark-900/60 border border-dark-700/80 rounded-xl px-4 py-3.5">
              <span className="absolute -top-2 left-3 px-1.5 bg-dark-850 text-[9px] uppercase tracking-wider text-dark-500 font-semibold flex items-center gap-1">
                <Sparkles size={9} className="text-rivvra-400/70" />
                Auto-filled
              </span>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                <PreviewRow icon={Building2} label="Company" value={parentCompany?.name || selectedContact.parentCompanyName || '—'} />
                <PreviewRow icon={UserCheck} label="Salesperson" value={resolvedSalesperson} />
                <PreviewRow icon={Mail} label="Email" value={selectedContact.email || '—'} />
                <PreviewRow icon={Phone} label="Phone" value={selectedContact.phone || selectedContact.mobile || '—'} />
              </dl>
            </div>
          )}

          {/* Opportunity name */}
          <div className="pt-1">
            <label className="text-[11px] uppercase tracking-wider text-dark-500 font-medium block mb-2">
              Opportunity Name
            </label>
            <input
              value={oppName}
              onChange={(e) => { setOppName(e.target.value); setOppNameDirty(true); }}
              disabled={!selectedContact}
              placeholder={selectedContact ? '' : 'Pick a contact above to auto-fill'}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            />
            <p className="mt-2 text-[11px] text-dark-500 leading-relaxed">
              Fine-tune stage, revenue, role, and other details on the record page after creating.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2 text-sm font-medium bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Create Opportunity
          </button>
        </div>
      </form>
    </div>
  );
}

function PreviewRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={13} className="text-dark-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wider text-dark-500 font-medium">{label}</dt>
        <dd className="text-[13px] text-dark-100 truncate mt-0.5">{value}</dd>
      </div>
    </div>
  );
}
