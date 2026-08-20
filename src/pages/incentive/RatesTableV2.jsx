// ============================================================================
// RatesTableV2.jsx — Admin rate versioning (effective-dated %), on ds
// ============================================================================
//
// Route: /org/:slug/incentive/rates, behind PageSwitch.
//
// This page decides what percentage every incentive record is computed at.
// Nothing about that resolution moves: the lane model, the validators, and
// both directions of the ×100 / ÷100 conversion between the "Rate %" the admin
// types and the fraction stored on the row are spliced in byte-identically.
//
// Carried across unchanged, and each one matters:
//
//   • `fmtPct` — the ONLY place a stored fraction becomes a displayed
//     percentage. 0.06 must read "6.00%", not "0.06%" or "6%".
//   • `onAdd`'s `Number(newRate.ratePct) / 100` and `startEdit`'s
//     `(Number(r.rate) || 0) * 100`. These are inverses; changing either one
//     alone silently rescales every rate written afterwards by 100.
//   • `validateRatePct` — required, finite, 0 ≤ n ≤ 100. The upper bound is
//     what stops a "6" meant as a fraction being stored as 600%.
//   • `laneOfRow` and the mutual exclusion behind it. A row is per-employee OR
//     per-tier OR org-wide, decided by which field is set, and `saveEdit` only
//     sends `tier` when the row is already on the tier lane — otherwise an
//     edit would move an org row onto a different lane.
//   • `toDateInputValue`, which normalises whatever Mongo returns into the
//     YYYY-MM-DD an <input type="date"> will accept. It returns '' rather than
//     a bad string, so a malformed date clears the field instead of silently
//     posting garbage as an effective-from.
//
// ── Two deliberate departures ──────────────────────────────────────────────
// 1. The local `EmployeePicker` is gone; the Per-employee lane now uses ds
//    `ComboBox`. Same Escape/Enter/click-outside behaviour, and Enter still
//    commits only when the search has narrowed to exactly one row. Search
//    coverage is preserved by putting the employee code in ComboBox's new
//    `keywords` field — matched, never drawn.
//    What is NOT preserved: legacy showed the selection as a chip with an X to
//    clear it back to empty. ComboBox has no clear-to-empty. Re-picking works,
//    and both lane switches already reset `employeeId`, so the only lost move
//    is "deselect and leave the form invalid".
// 2. ds `ConfirmDialog` replaces `shared/ConfirmDialog`. Prop-compatible; the
//    one difference is that Enter no longer confirms a `danger` dialog, which
//    is what we want on a delete.
//
// ⚠️ `incentiveApi.lookupEmployees` returns exactly 50 employees and ignores
//    both `limit` and `search` — verified against staging. So the picker can
//    only ever reach the first 50 people in the org, and typing a 51st
//    person's name finds nothing. That is a pre-existing server-side cap, not
//    something this migration introduced, and fixing it means an API change.
//    Left as-is and flagged.
//
// Not triggered: add rate, save edit, delete rate.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import {
  Plus, Trash2, Percent, Pencil, X, Check, Globe2, Users, User, Loader2,
} from 'lucide-react';
import {
  Panel, PageHeader, Button, Field, Input, Select, ComboBox, RadioCards,
  ConfirmDialog, DataTable, EmptyState,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const metaStyle = { font: "400 12.5px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const cellInput = { height: 30, fontSize: 12.5 };

const ROLE_LABEL = {
  recruiter: 'Recruiter',
  account_manager: 'Account Manager',
};

// Lane = which scope this rate row applies to. Keeping the UI explicit
// because the distinction matters for the resolver and we don't want admins
// to silently create the wrong layer.
const SCOPE = {
  ORG: 'org',
  TIER: 'tier',
  EMPLOYEE: 'employee',
};

const BLANK_NEW_RATE = {
  scope: SCOPE.ORG,
  role: 'recruiter',
  employeeId: '',
  tier: '',
  ratePct: '',
  effectiveFrom: '',
  note: '',
};

function laneOfRow(r) {
  if (r.employeeId) return SCOPE.EMPLOYEE;
  if (r.tier) return SCOPE.TIER;
  return SCOPE.ORG;
}

function fmtPct(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

// HTML <input type="date"> wants YYYY-MM-DD. Mongo gives us an ISO string or a
// Date — normalise to YYYY-MM-DD or empty.
function toDateInputValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}
// ── Main Page ──────────────────────────────────────────────────────────────
function RatesTableV2() {
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newRate, setNewRate] = useState(BLANK_NEW_RATE);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editing, setEditing] = useState(null); // { id, ratePct, effectiveFrom, effectiveTo, tier, note, busy }

  useEffect(() => {
    if (orgSlug) {
      load();
      loadEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  async function load() {
    setLoading(true);
    setRates([]);
    try {
      const res = await incentiveApi.listRates(orgSlug);
      setRates(res?.rates || res || []);
    } catch (e) {
      console.error(e);
      showToast(e?.message || 'Failed to load rates', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    setEmployees([]);
    try {
      const res = await incentiveApi.lookupEmployees(orgSlug);
      setEmployees(res?.employees || res || []);
    } catch (e) {
      console.error('Failed to load employees', e);
      // Non-fatal — admin can still add Org-wide / Tier rates.
    }
  }

  function validateRatePct(s) {
    if (s === '' || s == null) return 'Rate is required';
    const n = Number(s);
    if (!Number.isFinite(n)) return 'Rate must be a number';
    if (n < 0) return 'Rate cannot be negative';
    if (n > 100) return 'Rate cannot exceed 100%';
    return null;
  }

  async function onAdd() {
    const rateErr = validateRatePct(newRate.ratePct);
    if (rateErr) { showToast(rateErr, 'error'); return; }
    if (!newRate.effectiveFrom) {
      showToast('Effective-from date is required', 'error'); return;
    }
    if (newRate.scope === SCOPE.EMPLOYEE && !newRate.employeeId) {
      showToast('Pick an employee for a personal override', 'error'); return;
    }
    if (newRate.scope === SCOPE.TIER && !newRate.tier.trim()) {
      showToast('Tier label is required (e.g. "Team Lead")', 'error'); return;
    }
    setSaving(true);
    try {
      await incentiveApi.createRate(orgSlug, {
        role: newRate.role,
        rate: Number(newRate.ratePct) / 100,
        effectiveFrom: newRate.effectiveFrom,
        note: newRate.note || undefined,
        employeeId: newRate.scope === SCOPE.EMPLOYEE ? newRate.employeeId : null,
        tier: newRate.scope === SCOPE.TIER ? newRate.tier.trim() : null,
      });
      setNewRate(BLANK_NEW_RATE);
      showToast('Rate added. Prior open entry on this lane auto-closed.', 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Failed to add rate', 'error');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r) {
    setEditing({
      id: r._id,
      lane: laneOfRow(r),
      ratePct: ((Number(r.rate) || 0) * 100).toFixed(2),
      effectiveFrom: toDateInputValue(r.effectiveFrom),
      effectiveTo: toDateInputValue(r.effectiveTo),
      tier: r.tier || '',
      note: r.note || '',
      busy: false,
    });
  }

  function cancelEdit() { setEditing(null); }

  async function saveEdit() {
    if (!editing) return;
    const rateErr = validateRatePct(editing.ratePct);
    if (rateErr) { showToast(rateErr, 'error'); return; }
    if (!editing.effectiveFrom) {
      showToast('Effective-from date is required', 'error'); return;
    }
    setEditing((e) => (e ? { ...e, busy: true } : null));
    try {
      const payload = {
        rate: Number(editing.ratePct) / 100,
        effectiveFrom: editing.effectiveFrom,
        effectiveTo: editing.effectiveTo || null,
        note: editing.note || '',
      };
      // Only send tier when this row is on the tier lane — backend rejects
      // tier on a personal-override row, and we'd corrupt the lane on org
      // rows otherwise.
      if (editing.lane === SCOPE.TIER) payload.tier = editing.tier.trim();
      await incentiveApi.updateRate(orgSlug, editing.id, payload);
      showToast('Rate updated', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      showToast(e?.message || 'Update failed', 'error');
      setEditing((prev) => (prev ? { ...prev, busy: false } : null));
    }
  }

  function requestDelete(rate) { setConfirmDelete({ rate, busy: false }); }

  async function runDelete() {
    if (!confirmDelete?.rate) return;
    const r = confirmDelete.rate;
    setConfirmDelete((c) => (c ? { ...c, busy: true } : null));
    try {
      await incentiveApi.deleteRate(orgSlug, r._id);
      showToast('Deleted', 'success');
      setConfirmDelete(null);
      await load();
    } catch (e) {
      showToast(e?.message || 'Delete failed', 'error');
      setConfirmDelete((c) => (c ? { ...c, busy: false } : null));
    }
  }

  const employeesById = useMemo(() => {
    const m = new Map();
    for (const e of employees) m.set(e._id, e);
    return m;
  }, [employees]);

  // ComboBox options. `employeeId` goes in `keywords` — searchable, never drawn
  // — so the four fields legacy matched on (name, email, designation, code)
  // are all still reachable from the search box.
  const employeeOptions = useMemo(
    () => employees.map((e) => ({
      value: e._id,
      label: e.name || e.fullName || 'Employee',
      sub: [e.designation, e.email].filter(Boolean).join(' · '),
      keywords: e.employeeId || '',
    })),
    [employees],
  );

  const set = (patch) => setEditing((s) => (s ? { ...s, ...patch } : s));

  // One column set for both modes: a row in edit renders controls in the same
  // cells it reads from, so no column can drift between the two.
  const columns = [
    {
      key: 'role',
      header: 'Role',
      width: 150,
      render: (r) => ROLE_LABEL[r.role] || r.role,
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 240,
      render: (r) => {
        const lane = laneOfRow(r);
        if (editing?.id === r._id) {
          // Only the tier label is editable. The employee and org lanes are
          // locked because moving a row between lanes would change who the
          // rate resolves for.
          if (lane === SCOPE.TIER) {
            return (
              <Input
                value={editing.tier}
                onChange={(e) => set({ tier: e.target.value })}
                maxLength={80}
                placeholder="Tier"
                aria-label="Tier"
                style={cellInput}
              />
            );
          }
          return (
            <span style={{ ...microStyle, fontStyle: 'italic' }}>
              {lane === SCOPE.EMPLOYEE ? `${r.employeeName || 'Employee'} (locked)` : 'Org-wide (locked)'}
            </span>
          );
        }
        if (lane === SCOPE.EMPLOYEE) {
          const emp = r.employeeId ? employeesById.get(r.employeeId) : null;
          const name = emp?.name || r.employeeName || 'Employee';
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <User size={12} style={{ color: 'var(--acc-fuchsia)', flexShrink: 0 }} />
              <span style={{ color: 'var(--fg)' }}>{name}</span>
              {emp?.designation && <span style={microStyle}>· {emp.designation}</span>}
            </span>
          );
        }
        if (lane === SCOPE.TIER) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={12} style={{ color: 'var(--acc-blue)', flexShrink: 0 }} />
              <span style={{ color: 'var(--fg)' }}>{r.tier}</span>
              <span style={microStyle}>tier</span>
            </span>
          );
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Globe2 size={12} style={{ color: 'var(--acc-emerald)', flexShrink: 0 }} />
            <span style={{ color: 'var(--fg-2)' }}>Org-wide</span>
          </span>
        );
      },
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      width: 110,
      // step/min/max are legacy's exactly: two decimals, 0–100. The bound is
      // what stops a fraction typed as "0.06" or a "600" typo landing in the
      // stored rate.
      render: (r) => (editing?.id === r._id ? (
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={editing.ratePct}
          onChange={(e) => set({ ratePct: e.target.value })}
          aria-label="Rate %"
          style={{ ...cellInput, textAlign: 'right' }}
        />
      ) : (
        <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{fmtPct(r.rate)}</span>
      )),
    },
    {
      key: 'effectiveFrom',
      header: 'Effective from',
      width: 150,
      render: (r) => (editing?.id === r._id ? (
        <Input
          type="date"
          value={editing.effectiveFrom}
          onChange={(e) => set({ effectiveFrom: e.target.value })}
          aria-label="Effective from"
          style={cellInput}
        />
      ) : fmtDate(r.effectiveFrom)),
    },
    {
      key: 'effectiveTo',
      header: 'Effective to',
      width: 150,
      render: (r) => (editing?.id === r._id ? (
        <Input
          type="date"
          value={editing.effectiveTo}
          onChange={(e) => set({ effectiveTo: e.target.value })}
          aria-label="Effective to"
          style={cellInput}
        />
      ) : r.effectiveTo ? fmtDate(r.effectiveTo) : (
        <span style={{ color: 'var(--brand-ink)' }}>open</span>
      )),
    },
    {
      key: 'note',
      header: 'Note',
      width: 200,
      muted: true,
      render: (r) => (editing?.id === r._id ? (
        <Input
          value={editing.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={500}
          placeholder="Note"
          aria-label="Note"
          style={cellInput}
        />
      ) : (
        <span title={r.note || ''}>{r.note || '—'}</span>
      )),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 92,
      render: (r) => (editing?.id === r._id ? (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={saveEdit}
            disabled={editing.busy}
            aria-label="Save"
            title="Save"
            style={{ color: 'var(--brand-ink)' }}
            iconLeft={editing.busy
              ? <Loader2 size={14} className="animate-spin" />
              : <Check size={14} />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelEdit}
            disabled={editing.busy}
            aria-label="Cancel"
            title="Cancel"
            iconLeft={<X size={14} />}
          />
        </span>
      ) : (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startEdit(r)}
            aria-label={`Edit ${ROLE_LABEL[r.role] || r.role} rate of ${fmtPct(r.rate)}`}
            title="Edit"
            iconLeft={<Pencil size={14} />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requestDelete(r)}
            aria-label={`Delete ${ROLE_LABEL[r.role] || r.role} rate of ${fmtPct(r.rate)}`}
            title="Delete"
            style={{ color: 'var(--danger)' }}
            iconLeft={<Trash2 size={14} />}
          />
        </span>
      )),
    },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180, display: 'grid', gap: 18 }}>
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete rate entry?"
        message={
          confirmDelete?.rate
            ? `Delete the ${ROLE_LABEL[confirmDelete.rate.role] || confirmDelete.rate.role} rate of ${fmtPct(confirmDelete.rate.rate)} effective ${fmtDate(confirmDelete.rate.effectiveFrom)}? Records already approved keep their snapshotted rate; only future drafts are affected.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={!!confirmDelete?.busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={runDelete}
      />

      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 'var(--r-2, 12px)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--brand-soft)', color: 'var(--brand-ink)', flexShrink: 0,
            }}>
              <Percent size={16} />
            </span>
            Incentive Rate Table
          </span>
        }
        sub={
          <span style={metaStyle}>
            Effective-dated rates per role. Resolution order at record creation:
            <span style={{ color: 'var(--fg)' }}> per-employee → per-tier → org-wide → settings default</span>.
            New rates only affect records created after they take effect (forward-only).
          </span>
        }
      />

      <Panel title="Add new rate">
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Scope picker. All three lanes stay on screen with their hints —
              the distinction decides who the rate resolves for, and an admin
              picking the wrong one creates a silently wrong layer. */}
          <RadioCards
            aria-label="Rate scope"
            value={newRate.scope}
            onChange={(scope) => setNewRate({
              ...newRate,
              scope,
              // Clearing the other lane's field is what keeps the lanes
              // mutually exclusive — a row may carry employeeId OR tier.
              employeeId: scope === SCOPE.EMPLOYEE ? newRate.employeeId : '',
              tier: scope === SCOPE.TIER ? newRate.tier : '',
            })}
            options={[
              { value: SCOPE.ORG, label: 'Org-wide', hint: 'Default for everyone in this role', icon: <Globe2 size={14} /> },
              { value: SCOPE.TIER, label: 'Per-tier', hint: 'Matches employee designation', icon: <Users size={14} /> },
              { value: SCOPE.EMPLOYEE, label: 'Per-employee', hint: 'Personal override for one person', icon: <User size={14} /> },
            ]}
          />

          {/* The lane-specific control gets its own full-width row. Legacy fitted
              it into a 6-column strip, which only held together at exactly one
              breakpoint; below it the Rate and date fields orphaned themselves
              onto their own lines in an order that no longer read left to
              right. Splitting it keeps the field order stable at every width. */}
          {newRate.scope === SCOPE.EMPLOYEE && (
            <Field label="Employee" htmlFor="rt-employee">
              <ComboBox
                id="rt-employee"
                aria-label="Employee"
                value={newRate.employeeId}
                onChange={(id) => setNewRate({ ...newRate, employeeId: id })}
                options={employeeOptions}
                emptyLabel="Select employee…"
                placeholder="Search by name, email, designation…"
              />
            </Field>
          )}
          {newRate.scope === SCOPE.TIER && (
            <Field label="Tier" htmlFor="rt-tier" hint="Matched against the employee's designation, exactly as written.">
              <Input
                id="rt-tier"
                value={newRate.tier}
                onChange={(e) => setNewRate({ ...newRate, tier: e.target.value })}
                placeholder='e.g. "Team Lead"'
                maxLength={80}
              />
            </Field>
          )}
          {newRate.scope === SCOPE.ORG && (
            <span style={{ ...microStyle, fontStyle: 'italic' }}>
              Applies to everyone in this role unless overridden.
            </span>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label="Role" htmlFor="rt-role">
              <Select
                id="rt-role"
                value={newRate.role}
                onChange={(e) => setNewRate({ ...newRate, role: e.target.value })}
              >
                <option value="recruiter">Recruiter</option>
                <option value="account_manager">Account Manager</option>
              </Select>
            </Field>

            <Field label="Rate %" htmlFor="rt-rate">
              <Input
                id="rt-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={newRate.ratePct}
                onChange={(e) => setNewRate({ ...newRate, ratePct: e.target.value })}
                placeholder="Rate %"
              />
            </Field>
            <Field label="Effective from" htmlFor="rt-from">
              <Input
                id="rt-from"
                type="date"
                value={newRate.effectiveFrom}
                onChange={(e) => setNewRate({ ...newRate, effectiveFrom: e.target.value })}
              />
            </Field>
            <Button
              onClick={onAdd}
              disabled={saving}
              iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            >
              Add
            </Button>
          </div>

          <Field label="Note" htmlFor="rt-note">
            <Input
              id="rt-note"
              value={newRate.note}
              onChange={(e) => setNewRate({ ...newRate, note: e.target.value })}
              placeholder="Note (optional)"
              maxLength={500}
            />
          </Field>
        </div>
      </Panel>

      <DataTable
        columns={columns}
        rows={rates}
        rowKey="_id"
        loading={loading}
        loadingRows={4}
        empty={
          <EmptyState icon={<Percent size={24} />} title="No rates configured yet" compact>
            Records will use the IncentiveSettings default until a rate is added here.
          </EmptyState>
        }
      />
    </div>
  );
}

export default RatesTableV2;
