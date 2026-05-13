import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, User, Briefcase, Mail, Phone, Building2, UserCheck } from 'lucide-react';

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
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Opportunity');

  const [contactId, setContactId] = useState('');
  const [oppName, setOppName] = useState('');
  const [oppNameDirty, setOppNameDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);

  useEffect(() => {
    if (!slug) return;
    contactsApi.list(slug, { type: 'individual', limit: 500 })
      .then((res) => { if (res.success) setIndividualContacts(res.contacts || []); })
      .catch(() => {});
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
    () => individualContacts.find((c) => c._id === contactId) || null,
    [individualContacts, contactId]
  );

  const parentCompany = useMemo(() => {
    if (!selectedContact?.parentCompanyId) return null;
    return companiesById.get(String(selectedContact.parentCompanyId)) || null;
  }, [selectedContact, companiesById]);

  const resolvedSalesperson = useMemo(() => {
    return (
      selectedContact?.salespersonName ||
      parentCompany?.salespersonName ||
      'You (no salesperson on contact or company)'
    );
  }, [selectedContact, parentCompany]);

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
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">New Opportunity</h1>
        <p className="text-dark-400 text-sm mt-1">
          Pick an existing customer contact. For net-new customers, use{' '}
          <a
            href={`/org/${slug}/outreach`}
            className="text-rivvra-400 hover:text-rivvra-300 underline-offset-2 hover:underline"
          >
            Outreach
          </a>{' '}
          to qualify the lead and convert to an opportunity.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <SectionCard title="Customer" icon={User}>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-dark-500 font-medium block mb-1.5">
                Customer's POC *
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
                onChange={(id) => setContactId(id || '')}
                placeholder="Search by company or contact name…"
                allowCreate={false}
              />
              <p className="mt-1.5 text-[11px] text-dark-500">
                Only existing contacts can be picked here.
              </p>
            </div>

            {selectedContact && (
              <div className="bg-dark-900/50 border border-dark-700 rounded-lg p-4 space-y-2.5">
                <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">
                  Auto-filled from contact
                </p>
                <PreviewRow icon={Building2} label="Company" value={parentCompany?.name || selectedContact.parentCompanyName || '—'} />
                <PreviewRow icon={Mail} label="Email" value={selectedContact.email || '—'} />
                <PreviewRow icon={Phone} label="Phone" value={selectedContact.phone || selectedContact.mobile || '—'} />
                <PreviewRow icon={UserCheck} label="Salesperson" value={resolvedSalesperson} />
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Opportunity" icon={Briefcase}>
          <div className="py-2">
            <label className="text-[11px] uppercase tracking-wider text-dark-500 font-medium block mb-1.5">
              Opportunity Name
            </label>
            <input
              value={oppName}
              onChange={(e) => { setOppName(e.target.value); setOppNameDirty(true); }}
              disabled={!selectedContact}
              placeholder={selectedContact ? '' : 'Pick a contact above to auto-fill'}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1.5 text-[11px] text-dark-500">
              You can fine-tune stage, revenue, role, and other details on the record page after creating.
            </p>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-2 pt-2">
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
            className="px-4 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2"
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
    <div className="flex items-center gap-2.5 text-sm">
      <Icon size={13} className="text-dark-500 shrink-0" />
      <span className="text-dark-400 w-24 shrink-0">{label}</span>
      <span className="text-dark-100 truncate">{value}</span>
    </div>
  );
}
