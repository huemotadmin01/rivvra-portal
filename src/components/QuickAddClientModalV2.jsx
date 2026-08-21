import { useState, useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import contactsApi from '../utils/contactsApi';
import PersonLookup from './shared/PersonLookup';
import { Modal, Button, Callout, Field, Input } from './ds';

// ============================================================================
// QuickAddClientModalV2.jsx — quick-add client sub-modal, on ds
// ============================================================================
//
// Forked from `QuickAddClientModal` rather than migrated in place, because the
// legacy file is imported by BOTH `EmployeeDetail` and `EmployeeDetailV2`.
// Only the V2 page points here; legacy keeps the original untouched.
//
// ── Why the fork was necessary, and not merely tidy ─────────────────────────
// The legacy modal is fixed-dark Tailwind (`bg-dark-800`, `text-white`), and
// tailwind.config.js defines `dark-800` as a literal `#1e293b` — it does not
// follow the theme. That was harmless while the picker inside it was also
// fixed-dark.
//
// It stops being harmless the moment a ds component goes inside it. ds reads
// `--fg`, which in LIGHT theme is `#16191D`. On the legacy modal's dark panel
// that measures **1.01:1** — near-black on near-black, invisible. Legacy's own
// `text-white` measures 17.85:1 there.
//
// So "swap the picker" and "move the surface to ds" are ONE job, not two: the
// picker cannot move into a fixed-dark surface without making the selected
// salesperson's name unreadable for every light-theme user. This file moves
// both together, which is why it is a rewrite of the chrome and not a
// one-line import change.
//
// ── Spliced verbatim, and each one matters ──────────────────────────────────
//   • The create payload. `type: 'company'`, `isCustomer: true`, and above all
//     `countryCode: 'India'` / `defaultCurrency: 'INR'` — these decide the
//     contact's country and the currency every future invoice to it inherits
//     (contact.defaultCurrency wins over company.currency). Retyping them was
//     never an option.
//   • `canSubmit` — name AND salesperson AND not saving. It gates the button
//     and short-circuits `handleSubmit`, so a stray call cannot post a
//     half-filled contact.
//   • The `!contact?._id` throw. A 200 that returns no id is treated as a
//     FAILURE, not a success with a broken record — `onCreated` never fires
//     without an id.
//   • The reset effect keyed on `[isOpen, initialName]`, which clears the
//     salesperson between opens so a second client cannot silently inherit the
//     first one's owner.
//
// ── One deliberate behaviour difference ─────────────────────────────────────
// ds `EntityLookup` is pessimistic, but this picker only fills in a draft —
// nothing is written until "Create Client". So it passes `confirmsSave={false}`
// to suppress the green "saved" tick, which would otherwise claim a write that
// has not happened. Matches what the legacy picker showed here: nothing.
// ============================================================================

/**
 * Quick-add client sub-modal.
 *
 * Captures the minimum fields needed to create a CRM contact (name +
 * salesperson). Country/currency default to India/INR — user edits the rest
 * later from the Contacts page.
 *
 * Props:
 *  - isOpen      : boolean
 *  - orgSlug     : string
 *  - initialName : string — pre-fills the name field from the parent typeahead
 *  - onClose     : () => void
 *  - onCreated   : (contact) => void — fires after successful POST
 */
export default function QuickAddClientModalV2({ isOpen, orgSlug, initialName = '', onClose, onCreated }) {
  const [name, setName] = useState(initialName);
  const [salespersonId, setSalespersonId] = useState('');
  const [salespersonName, setSalespersonName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSalespersonId('');
      setSalespersonName('');
      setError('');
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const canSubmit = name.trim() && salespersonId && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const res = await contactsApi.create(orgSlug, {
        type: 'company',
        name: name.trim(),
        isCustomer: true,
        salespersonId,
        salespersonName,
        countryCode: 'India',
        defaultCurrency: 'INR',
      });
      const contact = res?.contact || res;
      if (!contact?._id) throw new Error('Server did not return a contact id');
      onCreated(contact);
    } catch (e) {
      setError(e?.message || 'Failed to create client. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="sm"
      tone="brand"
      icon={<Building2 size={16} />}
      title="Add New Client"
      sub="We'll create a CRM contact in India (INR). You can edit address, GSTIN and other details later from the Contacts page."
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}
            title={!name.trim() ? 'Name is required' : !salespersonId ? 'Salesperson is required' : ''}
          >
            Create Client
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Client Name" htmlFor="qac-name" required>
          <Input
            id="qac-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            autoFocus
          />
        </Field>

        <Field label="Salesperson" required>
          <PersonLookup
            orgSlug={orgSlug}
            variant="inline"
            label=""
            currentValue={salespersonId}
            currentName={salespersonName}
            placeholder="Search employees…"
            allowClear
            confirmsSave={false}
            onSelect={(id, nm) => { setSalespersonId(id); setSalespersonName(nm); }}
          />
        </Field>

        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
