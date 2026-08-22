// ============================================================================
// CrmOpportunityNewV2.jsx — routed create flow for a CRM opportunity, on ds
// (phase 6a)
// ============================================================================
// Copied from CrmOpportunityNew.jsx. Nothing about what gets posted changes:
// still contactId + an optional name, plus salespersonId only when an admin
// explicitly picked one. The sticky `pickedContact`, the auto-filled name that
// stops once the user edits it, and the salesperson preview mirroring the
// server's contact → company → creator resolution all carry over verbatim.
//
// Presentation moves to ds: `PageHeader`, a `Panel` of `Field`s, and the two
// `ComboSelect` pickers become ds `ComboBox` — the POC one keeping its
// server-side `onSearch`, which is what stopped the option list being capped
// at a 500-record pre-load.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import employeeApi from '../../utils/employeeApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Mail, Phone, Building2, UserCheck, Sparkles } from 'lucide-react';
import { Button, ComboBox, Field, Input, PageHeader, Panel, Spinner } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

export default function CrmOpportunityNewV2() {
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

  // 2026-05-14: contacts refetch on every typed query (debounced inside the
  // picker) instead of a one-shot pre-load of the first 500. Pre-load was a
  // hard cap — tenants with more contacts saw the tail of their list silently
  // disappear from the picker.
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

  // Server defaults salesperson to the creator (not the contact's
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
      value: c._id,
      label: c.parentCompanyName ? `${c.parentCompanyName}, ${c.name}` : c.name,
      sub: c.email || undefined,
    })),
    [individualContacts]
  );

  const salespersonOptions = useMemo(
    () => [
      { value: '', label: 'You (creator)' },
      ...employeeOptions.map((e) => ({ value: e._id, label: e.name })),
    ],
    [employeeOptions]
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

  const handlePocChange = useCallback((id) => {
    setContactId(id || '');
    // Pin the picked contact so a subsequent search refetch can't make the
    // preview disappear.
    const found = individualContacts.find((c) => c._id === id) || null;
    if (found) setPickedContact(found);
    if (!id) setPickedContact(null);
  }, [individualContacts]);

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
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 620 }}>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<ChevronLeft size={15} />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: 12, padding: '0 8px 0 4px' }}
      >
        Back
      </Button>

      <PageHeader
        title="New Opportunity"
        sub={
          <>
            Pick an existing customer contact. For net-new customers, use{' '}
            <a href={`/org/${slug}/outreach`} style={{ color: 'var(--brand)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Outreach
            </a>{' '}
            to qualify the lead first.
          </>
        }
        style={{ marginBottom: 16 }}
      />

      <form onSubmit={handleSubmit}>
        <Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* POC picker */}
            <Field label="Customer's POC" required htmlFor="opp-poc">
              <ComboBox
                id="opp-poc"
                aria-label="Customer's POC"
                value={contactId}
                onChange={handlePocChange}
                onSearch={setContactSearch}
                options={pocOptions}
                emptyLabel="Select a contact…"
                placeholder="Search by company or contact name…"
              />
            </Field>

            {/* Admin-only salesperson override. Non-admins always inherit the
                creator (themselves) server-side, so we hide this field for
                them rather than show a disabled control that hints at a
                permission they don't have. */}
            {isOrgAdmin && (
              <Field
                label="Salesperson"
                hint="Defaults to you. Pick someone else to assign on their behalf."
                htmlFor="opp-salesperson"
              >
                <ComboBox
                  id="opp-salesperson"
                  aria-label="Salesperson"
                  value={salespersonId}
                  onChange={(id) => setSalespersonId(id || '')}
                  options={salespersonOptions}
                  emptyLabel="You (creator)"
                  placeholder="Search employee…"
                />
              </Field>
            )}

            {/* Preview — appears after picking. The auto-filled label sits in
                the corner so the block reads as a continuation of the form,
                not a separate panel. */}
            {selectedContact && (
              <div style={{
                position: 'relative', padding: '14px 16px 12px', borderRadius: 'var(--r-2)',
                background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)',
              }}>
                <span style={{
                  position: 'absolute', top: -7, left: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '0 6px', background: 'var(--surface-1)',
                  font: `600 9px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--fg-4)',
                }}>
                  <Sparkles size={9} style={{ color: 'var(--brand)' }} />
                  Auto-filled
                </span>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', columnGap: 16, rowGap: 10 }}>
                  <PreviewRow icon={Building2} label="Company" value={parentCompany?.name || selectedContact.parentCompanyName || '—'} />
                  <PreviewRow icon={UserCheck} label="Salesperson" value={resolvedSalesperson} />
                  <PreviewRow icon={Mail} label="Email" value={selectedContact.email || '—'} />
                  <PreviewRow icon={Phone} label="Phone" value={selectedContact.phone || selectedContact.mobile || '—'} />
                </dl>
              </div>
            )}

            {/* Opportunity name */}
            <Field
              label="Opportunity Name"
              hint="Fine-tune stage, revenue, role and other details on the record page after creating."
              htmlFor="opp-name"
            >
              <Input
                id="opp-name"
                value={oppName}
                onChange={(e) => { setOppName(e.target.value); setOppNameDirty(true); }}
                disabled={!selectedContact}
                placeholder={selectedContact ? '' : 'Pick a contact above to auto-fill'}
                style={!selectedContact ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              />
            </Field>
          </div>
        </Panel>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            iconLeft={submitting ? <Spinner size={14} /> : null}
          >
            Create Opportunity
          </Button>
        </div>
      </form>
    </div>
  );
}

function PreviewRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
      <Icon size={13} style={{ color: 'var(--fg-4)', flexShrink: 0, marginTop: 3 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <dt style={{ font: `550 9.5px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--fg-4)' }}>
          {label}
        </dt>
        <dd style={{
          font: `450 13px/1.45 ${FONT}`, color: 'var(--fg)', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </dd>
      </div>
    </div>
  );
}
