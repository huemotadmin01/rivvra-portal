// ============================================================================
// NewRequirementModal.jsx — one step from "client gave me a requirement" to an
// ATS job (2026-11-24)
// ============================================================================
//
// For an existing client the opportunity record was pure ceremony: 218 of 291
// "wins" were created only to raise a job, and converted seconds later. This
// asks the four things the job needs and does both steps on the server
// (POST /crm/requirements). The intake record is kept for the audit trail but
// never shows in the pipeline or the Follow-ups queue.
//
// Props: open, onClose, contact (optional — an individual contact to lock the
// picker to), companyName (optional — pre-fills the search), onCreated.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import crmApi from '../../utils/crmApi';
import { Modal, Button, Field, Input, Select, ComboBox, Textarea } from '../ds';

const micro = { font: "450 12px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

export default function NewRequirementModal({ open, onClose, contact = null, companyName = '', onCreated }) {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const slug = currentOrg?.slug;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [contactId, setContactId] = useState('');
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [role, setRole] = useState('');
  const [type, setType] = useState('');
  const [revenue, setRevenue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setContactId(contact?._id || ''); setPicked(contact || null);
    setSearch(contact ? '' : (companyName || ''));
    setRole(''); setType(''); setRevenue(''); setNotes(''); setError(''); setSaving(false);
  }, [open, contact, companyName]);

  useEffect(() => {
    if (!open || !slug || contact) return undefined;
    let dead = false;
    const params = { type: 'individual', limit: 50 };
    if (search) params.search = search;
    contactsApi.list(slug, params)
      .then((res) => { if (!dead && res?.success) setOptions(res.contacts || []); })
      .catch(() => { if (!dead) setOptions([]); });
    return () => { dead = true; };
  }, [open, slug, search, contact]);

  const comboOptions = useMemo(() => {
    const rows = picked && !options.some((c) => c._id === picked._id) ? [picked, ...options] : options;
    return rows.map((c) => ({
      value: c._id,
      label: c.parentCompanyName ? `${c.parentCompanyName}, ${c.name}` : c.name,
      sub: c.email || undefined,
    }));
  }, [options, picked]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!contactId) { setError('Pick the client contact who gave you the requirement'); return; }
    if (!role.trim()) { setError('Enter the role to fill'); return; }
    if (!type) { setError('Pick the requirement type'); return; }
    if (revenue === '' || !(Number(revenue) >= 0)) { setError('Enter the expected revenue (0 if not known yet)'); return; }
    setSaving(true); setError('');
    try {
      const res = await crmApi.createRequirement(slug, {
        contactId, expectedRole: role.trim(), requirementType: type, expectedRevenue: Number(revenue), notes: notes.trim() || undefined,
      });
      showToast(`Job created · ${role.trim()}`);
      onCreated?.(res);
      onClose?.();
      if (res?.jobId) navigate(orgPath(`/ats/jobs/${res.jobId}`));
    } catch (err) {
      setError(err?.message || 'Could not create the requirement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      size="md"
      tone="brand"
      icon={<Briefcase size={16} />}
      title="New requirement"
      sub="An existing client gave you a role to fill. This creates the job for the recruiters in one step."
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create job'}</Button>
        </>
      )}
    >
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Client contact" required htmlFor="req-contact">
          {contact ? (
            <div style={{ font: "500 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
              {contact.parentCompanyName ? `${contact.parentCompanyName}, ` : ''}{contact.name}
              {contact.email ? <span style={{ ...micro, marginLeft: 8 }}>{contact.email}</span> : null}
            </div>
          ) : (
            <ComboBox
              id="req-contact"
              aria-label="Client contact"
              value={contactId}
              onChange={(id) => { setContactId(id || ''); setPicked(options.find((c) => c._id === id) || null); if (error) setError(''); }}
              onSearch={setSearch}
              options={comboOptions}
              emptyLabel="Select a contact…"
              placeholder="Search by company or contact name…"
            />
          )}
        </Field>
        <Field label="Role to fill" required htmlFor="req-role">
          <Input id="req-role" value={role} onChange={(e) => { setRole(e.target.value); if (error) setError(''); }} placeholder="e.g. Senior Java Developer" maxLength={200} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Requirement type" required htmlFor="req-type">
            <Select id="req-type" value={type} onChange={(e) => { setType(e.target.value); if (error) setError(''); }}>
              <option value="">Select…</option>
              <option value="Staff Augmentation">Staff Augmentation</option>
              <option value="Full-time Hire">Full-time Hire</option>
            </Select>
          </Field>
          <Field label="Expected revenue" required htmlFor="req-revenue">
            <Input id="req-revenue" type="number" min="0" inputMode="decimal" value={revenue} onChange={(e) => { setRevenue(e.target.value); if (error) setError(''); }} placeholder="0 if not known yet" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="req-notes">
          <Textarea id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} placeholder="Anything the recruiters should know (optional)" />
        </Field>
        {error && <div style={{ ...micro, color: 'var(--danger)' }}>{error}</div>}
      </form>
    </Modal>
  );
}
