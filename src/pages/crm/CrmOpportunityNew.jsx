import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, User, Building2, Briefcase } from 'lucide-react';

/**
 * CrmOpportunityNew — routed create flow for CRM opportunities. Mirrors
 * the minimal "+" form locked 2026-05-07: identity fields only (POC,
 * company, email/phone, client type), with the opportunity name auto-
 * derived from the contact. Expected Role / Revenue / Requirement Type
 * / Stage all fill in on the record page after creation.
 *
 * Replaces the in-place CreateModal previously triggered from
 * CrmPipeline + CrmOpportunities — every "New Opportunity" CTA now
 * navigates here per the modal-to-route rule.
 */
export default function CrmOpportunityNew() {
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Opportunity');

  const [form, setForm] = useState({
    contactId: '', contactName: '', contactCompanyId: '', companyName: '',
    contactEmail: '', contactPhone: '',
    clientType: 'new',
  });
  const [submitting, setSubmitting] = useState(false);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);

  useEffect(() => {
    if (!slug) return;
    contactsApi.list(slug, { type: 'individual', limit: 200 })
      .then((res) => { if (res.success) setIndividualContacts(res.contacts || []); })
      .catch(() => {});
    contactsApi.listCompanies(slug)
      .then((res) => { if (res.success) setCompanyContacts(res.companies || []); })
      .catch(() => {});
  }, [slug]);

  // POC dropdown options ("Company, Contact Name" — Odoo convention).
  const pocOptions = individualContacts.map((c) => ({
    _id: c._id,
    name: c.parentCompanyName ? `${c.parentCompanyName}, ${c.name}` : c.name,
  }));

  const handlePocChange = (id, displayName) => {
    if (id) {
      const contact = individualContacts.find((c) => c._id === id);
      setForm((f) => ({
        ...f,
        contactId: id,
        contactName: contact?.name || displayName,
        contactCompanyId: contact?.parentCompanyId || '',
        companyName: contact?.parentCompanyName || '',
        contactEmail: contact?.email || f.contactEmail,
        contactPhone: contact?.phone || f.contactPhone,
      }));
    } else {
      setForm((f) => ({ ...f, contactId: '', contactName: displayName, contactCompanyId: '', companyName: '' }));
    }
  };

  const pocDisplayValue = form.contactId
    ? (form.companyName ? `${form.companyName}, ${form.contactName}` : form.contactName)
    : form.contactName;

  const handleCompanyChange = (id, name) => {
    setForm((f) => ({ ...f, contactCompanyId: id, companyName: name }));
  };

  const isCreatingNew = !form.contactId && form.contactName.trim();
  const canSubmit = form.contactName.trim() && (!isCreatingNew || form.companyName.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const baseName = form.contactName.trim() || 'New';
      const payload = { ...form, name: `${baseName}'s opportunity` };
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
          Pick an existing contact or type a new one. Other fields fill in on the record page.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <SectionCard title="Customer" icon={User}>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-start">
            <span className="text-dark-400 text-sm pt-1.5">Customer's POC *</span>
            <div>
              <ComboSelect
                value={form.contactId}
                displayValue={pocDisplayValue}
                options={pocOptions}
                onChange={handlePocChange}
                placeholder="Search by company or contact name…"
              />
              {form.contactId && form.companyName && (
                <p className="mt-1 text-[11px] text-dark-500 flex items-center gap-1">
                  <Building2 size={11} /> {form.companyName} · <User size={11} /> {form.contactName}
                </p>
              )}
            </div>
          </div>

          {isCreatingNew && (
            <div className="mt-3 bg-dark-900/50 border border-dark-700 rounded-lg p-4 space-y-3">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">
                New contact details
              </p>

              <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                <span className="text-dark-400 text-sm">Contact Name</span>
                <input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                  placeholder="Full name"
                />
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
                <span className="text-dark-400 text-sm pt-1.5">Company *</span>
                <ComboSelect
                  value={form.contactCompanyId}
                  displayValue={form.companyName}
                  options={companyContacts}
                  onChange={handleCompanyChange}
                  placeholder="Search or type company name"
                />
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                <span className="text-dark-400 text-sm">Email</span>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                  placeholder="email@company.com"
                />
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                <span className="text-dark-400 text-sm">Phone</span>
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                  placeholder="+91…"
                />
              </div>
            </div>
          )}
        </SectionCard>

        <div className="mt-5">
          <SectionCard title="Opportunity" icon={Briefcase}>
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
              <span className="text-dark-400 text-sm">Client Type</span>
              <select
                value={form.clientType}
                onChange={(e) => setForm({ ...form, clientType: e.target.value })}
                className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
              >
                <option value="new">New Client</option>
                <option value="existing">Existing Client</option>
              </select>
            </div>
          </SectionCard>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
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
