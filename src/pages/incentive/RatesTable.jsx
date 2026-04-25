// ============================================================================
// RatesTable.jsx — Admin rate versioning (effective-dated %)
// ----------------------------------------------------------------------------
// A rate row lives in one of three "lanes":
//   - Org-wide      : applies to everyone in (orgId, companyId, role)
//   - Per-tier      : applies to employees whose `designation` matches `tier`
//   - Per-employee  : applies to one specific employee
//
// Resolution order at record creation: per-employee → per-tier → org-wide →
// IncentiveSettings default. Lanes are mutually exclusive (you cannot tag a
// row with both employeeId AND tier). Old rate rows that already have an
// employeeId continue to work as personal overrides.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import {
  Loader2, Plus, Trash2, Percent, Pencil, X, Check, Globe2, Users, User, Search,
} from 'lucide-react';

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

export default function RatesTable() {
  const { currentOrg } = useOrg();
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
  }, [orgSlug]);

  async function load() {
    setLoading(true);
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

  return (
    <div className="p-6 max-w-5xl space-y-5">
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

      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Percent className="text-fuchsia-400" /> Incentive Rate Table
        </h1>
        <p className="text-sm text-dark-400 mt-1">
          Effective-dated rates per role. Resolution order at record creation:
          <span className="text-white"> per-employee → per-tier → org-wide → settings default</span>.
          New rates only affect records created after they take effect (forward-only).
        </p>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
          Add new rate
        </h3>

        {/* Scope picker — three radios so the lane is unmissable. */}
        <div className="flex flex-wrap gap-2 mb-4">
          <ScopeRadio
            active={newRate.scope === SCOPE.ORG}
            onClick={() => setNewRate({ ...newRate, scope: SCOPE.ORG, employeeId: '', tier: '' })}
            icon={Globe2}
            label="Org-wide"
            hint="Default for everyone in this role"
          />
          <ScopeRadio
            active={newRate.scope === SCOPE.TIER}
            onClick={() => setNewRate({ ...newRate, scope: SCOPE.TIER, employeeId: '' })}
            icon={Users}
            label="Per-tier"
            hint="Matches employee designation"
          />
          <ScopeRadio
            active={newRate.scope === SCOPE.EMPLOYEE}
            onClick={() => setNewRate({ ...newRate, scope: SCOPE.EMPLOYEE, tier: '' })}
            icon={User}
            label="Per-employee"
            hint="Personal override for one person"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <select
            value={newRate.role}
            onChange={(e) => setNewRate({ ...newRate, role: e.target.value })}
            className={inputCls}
            aria-label="Role"
          >
            <option value="recruiter">Recruiter</option>
            <option value="account_manager">Account Manager</option>
          </select>

          {newRate.scope === SCOPE.EMPLOYEE && (
            <div className="md:col-span-2">
              <EmployeePicker
                employees={employees}
                value={newRate.employeeId}
                onChange={(id) => setNewRate({ ...newRate, employeeId: id })}
              />
            </div>
          )}
          {newRate.scope === SCOPE.TIER && (
            <input
              type="text"
              value={newRate.tier}
              onChange={(e) => setNewRate({ ...newRate, tier: e.target.value })}
              placeholder='Tier (e.g. "Team Lead")'
              maxLength={80}
              className={`${inputCls} md:col-span-2`}
              aria-label="Tier"
            />
          )}
          {newRate.scope === SCOPE.ORG && (
            <div className="md:col-span-2 text-xs text-dark-500 italic flex items-center px-1">
              Applies to everyone in this role unless overridden.
            </div>
          )}

          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={newRate.ratePct}
            onChange={(e) => setNewRate({ ...newRate, ratePct: e.target.value })}
            placeholder="Rate %"
            className={inputCls}
            aria-label="Rate %"
          />
          <input
            type="date"
            value={newRate.effectiveFrom}
            onChange={(e) => setNewRate({ ...newRate, effectiveFrom: e.target.value })}
            className={`${inputCls} [color-scheme:dark]`}
            aria-label="Effective from"
          />
          <button
            onClick={onAdd}
            disabled={saving}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>

        <input
          type="text"
          value={newRate.note}
          onChange={(e) => setNewRate({ ...newRate, note: e.target.value })}
          placeholder="Note (optional)"
          maxLength={500}
          className={`${inputCls} mt-3`}
          aria-label="Note"
        />
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-dark-500" size={24} />
          </div>
        ) : rates.length === 0 ? (
          <div className="p-10 text-center text-dark-400 text-sm">
            No rates configured yet. Records will use the IncentiveSettings default.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-850 text-dark-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Scope</th>
                <th className="text-right px-4 py-2 font-medium">Rate</th>
                <th className="text-left px-4 py-2 font-medium">Effective from</th>
                <th className="text-left px-4 py-2 font-medium">Effective to</th>
                <th className="text-left px-4 py-2 font-medium">Note</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const isEditing = editing?.id === r._id;
                if (isEditing) return (
                  <EditingRow
                    key={r._id}
                    row={r}
                    state={editing}
                    setState={setEditing}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                  />
                );
                return (
                  <DisplayRow
                    key={r._id}
                    row={r}
                    employee={r.employeeId ? employeesById.get(r.employeeId) : null}
                    enrichedName={r.employeeName}
                    onEdit={() => startEdit(r)}
                    onDelete={() => requestDelete(r)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars -- Icon is the renamed `icon` prop, used as JSX below
function ScopeRadio({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-left transition-colors ${
        active
          ? 'bg-fuchsia-600/20 border-fuchsia-500 text-white'
          : 'bg-dark-850 border-dark-700 text-dark-300 hover:border-dark-600'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-[11px] text-dark-400 mt-0.5">{hint}</div>
    </button>
  );
}

function DisplayRow({ row, employee, enrichedName, onEdit, onDelete }) {
  const lane = laneOfRow(row);
  const scopeCell = (() => {
    if (lane === SCOPE.EMPLOYEE) {
      const name = employee?.name || enrichedName || 'Employee';
      const desig = employee?.designation;
      return (
        <span className="inline-flex items-center gap-1.5">
          <User size={12} className="text-fuchsia-400" />
          <span className="text-white">{name}</span>
          {desig && <span className="text-dark-500 text-xs">· {desig}</span>}
        </span>
      );
    }
    if (lane === SCOPE.TIER) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Users size={12} className="text-blue-400" />
          <span className="text-white">{row.tier}</span>
          <span className="text-dark-500 text-xs">tier</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        <Globe2 size={12} className="text-emerald-400" />
        <span className="text-dark-200">Org-wide</span>
      </span>
    );
  })();

  return (
    <tr className="border-t border-dark-800">
      <td className="px-4 py-2 text-white">{ROLE_LABEL[row.role] || row.role}</td>
      <td className="px-4 py-2">{scopeCell}</td>
      <td className="px-4 py-2 text-right text-white font-medium">{fmtPct(row.rate)}</td>
      <td className="px-4 py-2 text-dark-300">{fmtDate(row.effectiveFrom)}</td>
      <td className="px-4 py-2 text-dark-300">
        {row.effectiveTo ? fmtDate(row.effectiveTo) : <span className="text-emerald-400">open</span>}
      </td>
      <td className="px-4 py-2 text-dark-400 max-w-[200px] truncate" title={row.note || ''}>
        {row.note || '—'}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button
          onClick={onEdit}
          className="text-dark-300 hover:text-white p-1"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 p-1 ml-1"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

function EditingRow({ row, state, setState, onSave, onCancel }) {
  const lane = laneOfRow(row);
  const set = (patch) => setState((s) => (s ? { ...s, ...patch } : s));
  return (
    <tr className="border-t border-fuchsia-700/40 bg-fuchsia-950/10">
      <td className="px-4 py-2 text-white align-top pt-3">{ROLE_LABEL[row.role] || row.role}</td>
      <td className="px-4 py-2 align-top pt-3">
        {lane === SCOPE.TIER ? (
          <input
            type="text"
            value={state.tier}
            onChange={(e) => set({ tier: e.target.value })}
            maxLength={80}
            className={`${inputCls} text-xs`}
            placeholder="Tier"
          />
        ) : lane === SCOPE.EMPLOYEE ? (
          <span className="text-dark-300 text-xs italic">
            {row.employeeName || 'Employee'} (locked)
          </span>
        ) : (
          <span className="text-dark-300 text-xs italic">Org-wide (locked)</span>
        )}
      </td>
      <td className="px-4 py-2 text-right align-top pt-3">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={state.ratePct}
          onChange={(e) => set({ ratePct: e.target.value })}
          className={`${inputCls} text-right text-xs`}
        />
      </td>
      <td className="px-4 py-2 align-top pt-3">
        <input
          type="date"
          value={state.effectiveFrom}
          onChange={(e) => set({ effectiveFrom: e.target.value })}
          className={`${inputCls} text-xs [color-scheme:dark]`}
        />
      </td>
      <td className="px-4 py-2 align-top pt-3">
        <input
          type="date"
          value={state.effectiveTo}
          onChange={(e) => set({ effectiveTo: e.target.value })}
          className={`${inputCls} text-xs [color-scheme:dark]`}
        />
      </td>
      <td className="px-4 py-2 align-top pt-3">
        <input
          type="text"
          value={state.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={500}
          className={`${inputCls} text-xs`}
          placeholder="Note"
        />
      </td>
      <td className="px-4 py-2 text-right align-top pt-3 whitespace-nowrap">
        <button
          onClick={onSave}
          disabled={state.busy}
          className="text-emerald-400 hover:text-emerald-300 p-1 disabled:opacity-50"
          title="Save"
        >
          {state.busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          onClick={onCancel}
          disabled={state.busy}
          className="text-dark-300 hover:text-white p-1 ml-1 disabled:opacity-50"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </td>
    </tr>
  );
}

// Searchable employee lookup for the Per-employee scope. Matches the
// type-to-filter pattern used elsewhere in the app (RecordDetail combo,
// asset Assign/Reassign modals). Pure form-mode — no async save cycle, just
// `value` + `onChange`. Click the X chip to clear the selection.
function EmployeePicker({ employees, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selected = useMemo(
    () => (value ? employees.find((e) => e._id === value) : null),
    [employees, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees
      .filter((e) =>
        (e.name || '').toLowerCase().includes(q)
        || (e.email || '').toLowerCase().includes(q)
        || (e.designation || '').toLowerCase().includes(q)
        || (e.employeeId || '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [employees, search]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center justify-between bg-dark-850 border border-dark-700 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <User size={14} className="text-fuchsia-400 flex-shrink-0" />
          <span className="text-sm text-white truncate">{selected.name}</span>
          {selected.designation && (
            <span className="text-xs text-dark-500 truncate">· {selected.designation}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { onChange(''); setSearch(''); }}
          className="text-dark-400 hover:text-white flex-shrink-0 ml-2"
          title="Clear selection"
          aria-label="Clear selected employee"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && filtered.length === 1) {
              onChange(filtered[0]._id);
              setOpen(false);
              setSearch('');
            }
          }}
          placeholder="Search employee by name, email, designation…"
          className={`${inputCls} pl-9`}
          aria-label="Employee"
        />
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-dark-900 border border-dark-700 rounded-lg shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-dark-500 italic">
              No employees match.
            </div>
          ) : (
            filtered.map((emp) => (
              <button
                key={emp._id}
                type="button"
                onClick={() => {
                  onChange(emp._id);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full text-left px-3 py-2 hover:bg-dark-800 transition-colors"
              >
                <div className="text-sm text-white">{emp.name}</div>
                {emp.designation && (
                  <div className="text-[11px] text-dark-500">{emp.designation}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-600';
