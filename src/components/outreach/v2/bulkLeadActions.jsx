import { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { Modal, Button, Field, Input, Select } from '../../ds';

/* 2026-11-03: bulk actions for the contacts table — the bulk bar used to offer
   only Export CSV and Delete, while reps mostly need to act on many contacts
   at once. Both dialogs reuse the existing per-contact endpoints (no new API):
   PUT /api/portal/leads/:id/lists and PUT /api/portal/leads/:id
   { outreachStatus }, a few at a time, and report what succeeded. */

// Statuses a rep may set by hand. "In sequence" and "Bounced" are set by the
// system (enrolment / bounce webhook), so they are not offered.
const MANUAL_STATUS_OPTIONS = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'replied', label: 'Interested' },
  { value: 'replied_not_interested', label: 'Not Interested' },
  { value: 'no_response', label: 'No Response' },
  { value: 'converted', label: 'Converted' },
];

// Same list as the API's AUTO_STOP_STATUSES (portal-leads.js): setting one of
// these by hand stops any active / paused sequence for that contact.
const STOPS_SEQUENCES = new Set(['replied', 'replied_not_interested', 'no_response', 'converted']);

// Run `fn` over items, `size` at a time, collecting ok / failed counts.
async function inBatches(items, size, fn) {
  let ok = 0; let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    const res = await Promise.allSettled(items.slice(i, i + size).map(fn));
    for (const r of res) { if (r.status === 'fulfilled' && r.value?.success !== false) ok++; else failed++; }
  }
  return { ok, failed };
}

/** Add the selected contacts to one list (existing or new). */
export function BulkAddToListModal({ open, onClose, leads = [], onDone, showToast }) {
  const [lists, setLists] = useState([]);
  const [choice, setChoice] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(''); setNewName(''); setBusy(false);
    api.getLists()
      .then((res) => setLists(Array.isArray(res?.lists) ? res.lists : []))
      .catch(() => setLists([]));
  }, [open]);

  const listName = choice === '__new' ? newName.trim() : choice;

  const run = async () => {
    if (!listName || !leads.length) return;
    setBusy(true);
    try {
      if (choice === '__new' && !lists.some((l) => (l.name || l) === listName)) {
        await api.createList(listName);
      }
      const updated = [];
      const { ok, failed } = await inBatches(leads, 5, async (lead) => {
        const next = Array.from(new Set([...(lead.lists || []), listName]));
        const res = await api.updateLeadLists(lead._id, next);
        if (res?.success !== false) updated.push({ ...lead, lists: next });
        return res;
      });
      showToast?.(failed
        ? `Added ${ok} to "${listName}" — ${failed} failed`
        : `Added ${ok} contact${ok === 1 ? '' : 's'} to "${listName}"`, failed ? 'error' : 'success');
      onDone?.(updated);
      onClose();
    } catch (e) {
      showToast?.(e?.message || 'Could not add to list', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title="Add to list"
      sub={`${leads.length} contact${leads.length === 1 ? '' : 's'} selected`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !listName}>{busy ? 'Adding…' : 'Add to list'}</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="List" htmlFor="bulk-list">
          <Select id="bulk-list" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a list…</option>
            {lists.map((l) => {
              const name = l.name || l;
              return <option key={name} value={name}>{name}</option>;
            })}
            <option value="__new">+ New list…</option>
          </Select>
        </Field>
        {choice === '__new' && (
          <Field label="New list name" htmlFor="bulk-list-new">
            <Input id="bulk-list-new" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Q4 Bengaluru prospects" autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** Set one outreach status on the selected contacts. */
export function BulkStatusModal({ open, onClose, leads = [], onDone, showToast }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setStatus(''); setBusy(false); } }, [open]);

  const run = async () => {
    if (!status || !leads.length) return;
    setBusy(true);
    try {
      const updated = [];
      let stopped = 0;
      const { ok, failed } = await inBatches(leads, 5, async (lead) => {
        const res = await api.updateLead(lead._id, { outreachStatus: status });
        if (res?.success !== false) {
          updated.push({ ...lead, outreachStatus: status });
          stopped += Number(res?.stoppedSequenceCount) || 0;
        }
        return res;
      });
      const label = MANUAL_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
      const tail = stopped ? ` · ${stopped} active sequence${stopped === 1 ? '' : 's'} stopped` : '';
      showToast?.(failed
        ? `Set ${ok} to "${label}" — ${failed} failed${tail}`
        : `${ok} contact${ok === 1 ? '' : 's'} set to "${label}"${tail}`, failed ? 'error' : 'success');
      onDone?.(updated);
      onClose();
    } catch (e) {
      showToast?.(e?.message || 'Could not change status', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title="Change status"
      sub={`${leads.length} contact${leads.length === 1 ? '' : 's'} selected`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !status}>{busy ? 'Saving…' : 'Change status'}</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <Field label="New status" htmlFor="bulk-status" hint="In Sequence and Bounced are set automatically, so they are not listed.">
          <Select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Choose a status…</option>
            {MANUAL_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        {STOPS_SEQUENCES.has(status) && (
          <div style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--warn, #f59e0b)' }}>
            This also stops any active sequence these contacts are in, and moves them to the status's default list.
          </div>
        )}
      </div>
    </Modal>
  );
}
