import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import assetApi from '../../utils/assetApi';
import employeeApi from '../../utils/employeeApi';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  ArrowLeft, User, Calendar, Package, Pencil, RotateCcw, AlertTriangle,
  Loader2, CheckCircle2, History, IndianRupee, RefreshCw,
} from 'lucide-react';
import {
  Panel, Chip, Button, Input, Textarea, Select, ComboBox, Field,
  Modal, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Every handler from `const { assetId } = useParams()` through
// `handleMakeAvailable` is spliced in byte-identically, as are `formatDate`,
// `CONDITION_LABELS`, and the two render-resident derivations (`st`, and the
// reversed `assignmentHistory`).
//
// That matters most for `handleReassign`, which is two sequential writes — a
// `returnAsset` with a synthetic "Reassigned to another employee" note, then an
// `assign`. If the second call fails the asset is left *returned*, not
// reassigned, and the error text says "Failed to reassign". Carried across
// exactly, including that window.
//
// Money is carried verbatim and untouched: `deductionAmount` on the return and
// lost forms is a payroll deduction, and the history row's
// `h.deductionAmount.toLocaleString('en-IN')` is its display. Both are
// hardcoded to INR — see the note in the PR; not changed here.
//
// Not triggered: assign, reassign, return, mark lost, edit, make available.
// ─────────────────────────────────────────────────────────────────────────────

// Status carries meaning, so each maps to a Chip tone rather than a colour pair.
const STATUS_TONE = {
  available: 'brand',
  assigned:  'info',
  returned:  'neutral',
  lost:      'danger',
  retired:   'neutral',
};

const STATUS_LABELS = {
  available: 'Available',
  assigned:  'Assigned',
  returned:  'Returned',
  lost:      'Lost',
  retired:   'Retired',
};

const CONDITION_LABELS = { new: 'New', good: 'Good', fair: 'Fair', damaged: 'Damaged', lost: 'Lost' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The lookup's two search axes are fullName and email, exactly what the legacy
// `EmployeeLookup` matched; ComboBox searches label and sub, so they map 1:1.
const toOption = (e) => ({ value: String(e._id), label: e.fullName || e.name || '', sub: e.email || '' });

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ flexShrink: 0, font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ textAlign: 'right', font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{value}</span>
    </div>
  );
}

export default function AssetDetailV2() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole } = useOrg();
  const isAdmin = getAppRole('employee') === 'admin';
  const handleScoped404 = useCompanyScoped404('asset');

  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);

  // Modal states
  const [showAssign, setShowAssign] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  // Forms
  const [assignForm, setAssignForm] = useState({ employeeId: '', notes: '' });
  // ComboBox owns its own search box and popover, so nothing reads these four
  // any more — but the setters are still called by the handlers below, which
  // are spliced in byte-identically. Kept as write-only state rather than
  // editing the handlers.
  const [, setAssignSearch] = useState('');
  const [, setAssignDropdown] = useState(false);
  const [reassignForm, setReassignForm] = useState({ employeeId: '', notes: '' });
  const [, setReassignSearch] = useState('');
  const [, setReassignDropdown] = useState(false);
  const [returnForm, setReturnForm] = useState({ condition: 'good', notes: '', deductionAmount: '' });
  const [lostForm, setLostForm] = useState({ notes: '', deductionAmount: '' });
  const [editForm, setEditForm] = useState({ name: '', modelName: '', condition: '', notes: '', assetTypeId: '' });

  useEffect(() => { load(); }, [assetId, orgSlug]);

  async function load() {
    setLoading(true);
    try {
      const [assetRes, empRes, typesRes] = await Promise.all([
        assetApi.get(orgSlug, assetId),
        isAdmin ? employeeApi.list(orgSlug, { limit: 100 }) : Promise.resolve({ employees: [] }),
        assetApi.listTypes(orgSlug),
      ]);
      const a = assetRes.data;
      setAsset(a);
      const empList = empRes.employees || empRes.data || [];
      setEmployees((Array.isArray(empList) ? empList : []).filter(e => e.status !== 'separated').sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')));
      setTypes(typesRes.data || []);
      setEditForm({ name: a.name, modelName: a.modelName || '', condition: a.condition || 'good', notes: a.notes || '', assetTypeId: a.assetTypeId });
    } catch (e) {
      if (handleScoped404(e)) return;
      console.error(e);
    }
    finally { setLoading(false); }
  }

  const [error, setError] = useState('');

  async function handleAssign() {
    if (!assignForm.employeeId) return;
    setSaving(true); setError('');
    try {
      await assetApi.assign(orgSlug, assetId, { employeeId: assignForm.employeeId, notes: assignForm.notes });
      setShowAssign(false);
      setAssignForm({ employeeId: '', notes: '' });
      setAssignSearch('');
      await load();
    } catch (e) { setError(e.message || 'Failed to assign'); }
    finally { setSaving(false); }
  }

  async function handleReassign() {
    if (!reassignForm.employeeId) return;
    setSaving(true); setError('');
    try {
      await assetApi.returnAsset(orgSlug, assetId, { condition: 'good', notes: 'Reassigned to another employee' });
      await assetApi.assign(orgSlug, assetId, { employeeId: reassignForm.employeeId, notes: reassignForm.notes });
      setShowReassign(false);
      setReassignForm({ employeeId: '', notes: '' });
      setReassignSearch('');
      await load();
    } catch (e) { setError(e.message || 'Failed to reassign'); }
    finally { setSaving(false); }
  }

  async function handleReturn() {
    setSaving(true); setError('');
    try {
      await assetApi.returnAsset(orgSlug, assetId, returnForm);
      setShowReturn(false);
      setReturnForm({ condition: 'good', notes: '', deductionAmount: '' });
      await load();
    } catch (e) { setError(e.message || 'Failed to return'); }
    finally { setSaving(false); }
  }

  async function handleMarkLost() {
    setSaving(true); setError('');
    try {
      await assetApi.markLost(orgSlug, assetId, lostForm);
      setShowLost(false);
      setLostForm({ notes: '', deductionAmount: '' });
      await load();
    } catch (e) { setError(e.message || 'Failed to mark lost'); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    setSaving(true); setError('');
    try {
      await assetApi.update(orgSlug, assetId, editForm);
      setShowEdit(false);
      await load();
    } catch (e) { setError(e.message || 'Failed to update'); }
    finally { setSaving(false); }
  }

  async function handleMakeAvailable() {
    setSaving(true);
    try {
      await assetApi.makeAvailable(orgSlug, assetId);
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  if (loading) return <PageSpinner label="Loading asset…" />;

  if (!asset) return (
    <Panel>
      <EmptyState icon={<Package size={22} />} title="Asset not found"
        actions={<Button variant="secondary" size="sm" onClick={() => navigate(orgPath('/employee/assets'))}>Back to Assets</Button>} />
    </Panel>
  );

  const history = (asset.assignmentHistory || []).slice().reverse();

  const empOptions = employees.map(toOption);
  const reassignOptions = employees.filter(e => e._id !== asset.assignedTo).map(toOption);

  const modalFoot = (onSave, onCancel, label, opts = {}) => (
    <>
      <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      <Button
        size="sm"
        block
        onClick={onSave}
        disabled={saving || opts.disabled}
        variant={opts.danger ? 'secondary' : 'primary'}
        style={opts.danger ? { color: 'var(--danger)' } : undefined}
        iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
      >
        {label}
      </Button>
    </>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Back */}
      <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={15} />}
        onClick={() => navigate(orgPath('/employee/assets'))} style={{ marginBottom: 10 }}>
        Back to Assets
      </Button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>{asset.name}</h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
            {asset.assetTypeName}{asset.modelName ? ` - ${asset.modelName}` : ''}
          </p>
        </div>
        <Chip tone={STATUS_TONE[asset.status] || 'brand'}>{STATUS_LABELS[asset.status] || 'Available'}</Chip>
      </div>

      {/* Actions (admin) */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {asset.status === 'available' && (
            <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)} iconLeft={<User size={14} />}>
              Assign to Employee
            </Button>
          )}
          {asset.status === 'assigned' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowReassign(true)} iconLeft={<User size={14} />}>
                Reassign
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowReturn(true)} iconLeft={<RotateCcw size={14} />}>
                Mark Returned
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowLost(true)}
                style={{ color: 'var(--danger)' }} iconLeft={<AlertTriangle size={14} />}>
                Mark Lost
              </Button>
            </>
          )}
          {(asset.status === 'returned' || asset.status === 'retired') && (
            <Button variant="secondary" size="sm" onClick={handleMakeAvailable} iconLeft={<RefreshCw size={14} />}>
              Make Available
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)} iconLeft={<Pencil size={14} />}>
            Edit Details
          </Button>
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Panel title="Details" icon={<Package size={15} />}>
          <div style={{ display: 'grid', gap: 8, padding: 4 }}>
            <InfoRow label="Type" value={asset.assetTypeName} />
            <InfoRow label="Name" value={asset.name} />
            <InfoRow label="Model" value={asset.modelName || '—'} />
            <InfoRow label="Condition" value={CONDITION_LABELS[asset.condition] || asset.condition} />
            <InfoRow label="Notes" value={asset.notes || '—'} />
            <InfoRow label="Created" value={formatDate(asset.createdAt)} />
          </div>
        </Panel>

        <Panel title="Current Assignment" icon={<User size={15} />}>
          {asset.status === 'assigned' ? (
            <div style={{ display: 'grid', gap: 8, padding: 4 }}>
              <InfoRow label="Assigned To" value={asset.assignedToName} />
              <InfoRow label="Assigned Date" value={formatDate(asset.assignedDate)} />
            </div>
          ) : (
            <EmptyState compact title="Not currently assigned" />
          )}
        </Panel>
      </div>

      {/* Assignment history */}
      {history.length > 0 && (
        <Panel title="Assignment History" icon={<History size={15} />}>
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingLeft: 12, borderLeft: '2px solid var(--line-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{h.employeeName}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} /> {formatDate(h.assignedDate)}
                    </span>
                    {h.returnedDate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <RotateCcw size={11} /> Returned {formatDate(h.returnedDate)}
                        {h.returnCondition && <span>({h.returnCondition})</span>}
                      </span>
                    )}
                  </div>
                  {/* Money — display carried across verbatim, INR and all. */}
                  {h.deductionAmount > 0 && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '4px 0 0' }}>
                      <IndianRupee size={10} /> Deduction: {h.deductionAmount.toLocaleString('en-IN')}
                    </p>
                  )}
                  {h.returnNotes && (
                    <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>{h.returnNotes}</p>
                  )}
                </div>
                {!h.returnedDate && <Chip tone="info">Active</Chip>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Assign ─────────────────────────────────────────────────────────── */}
      <Modal open={showAssign} size="sm" title="Assign Asset"
        onClose={() => { setShowAssign(false); setAssignSearch(''); setAssignDropdown(false); }}
        footer={modalFoot(handleAssign, () => { setShowAssign(false); setAssignSearch(''); setError(''); }, 'Assign', { disabled: !assignForm.employeeId })}>
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Employee" required htmlFor="as-assign-emp">
            <ComboBox id="as-assign-emp" aria-label="Employee" options={empOptions}
              value={assignForm.employeeId}
              onChange={(id) => setAssignForm(f => ({ ...f, employeeId: id }))}
              placeholder="Search employee..." emptyLabel="Select employee…" />
          </Field>
          <Field label="Notes" htmlFor="as-assign-notes">
            <Textarea id="as-assign-notes" rows={2} value={assignForm.notes}
              onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── Reassign ───────────────────────────────────────────────────────── */}
      <Modal open={showReassign} size="sm" title="Reassign Asset"
        onClose={() => { setShowReassign(false); setReassignSearch(''); setReassignDropdown(false); }}
        footer={modalFoot(handleReassign, () => { setShowReassign(false); setReassignSearch(''); setError(''); }, 'Reassign', { disabled: !reassignForm.employeeId })}>
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
            Currently assigned to: <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{asset.assignedToName}</span>
          </p>
          <Field label="New Employee" required htmlFor="as-reassign-emp">
            <ComboBox id="as-reassign-emp" aria-label="New Employee" options={reassignOptions}
              value={reassignForm.employeeId}
              onChange={(id) => setReassignForm(f => ({ ...f, employeeId: id }))}
              placeholder="Search employee..." emptyLabel="Select employee…" />
          </Field>
          <Field label="Notes" htmlFor="as-reassign-notes">
            <Textarea id="as-reassign-notes" rows={2} value={reassignForm.notes}
              onChange={e => setReassignForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── Return ─────────────────────────────────────────────────────────── */}
      <Modal open={showReturn} size="sm" title="Return Asset"
        onClose={() => setShowReturn(false)}
        footer={modalFoot(handleReturn, () => { setShowReturn(false); setError(''); }, 'Confirm Return')}>
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
            Returning from: <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{asset.assignedToName}</span>
          </p>
          <Field label="Return Condition" required htmlFor="as-ret-cond">
            <Select id="as-ret-cond" value={returnForm.condition}
              onChange={e => setReturnForm(f => ({ ...f, condition: e.target.value }))}>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
            </Select>
          </Field>
          <Field label="Deduction Amount (if any)" htmlFor="as-ret-ded">
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', pointerEvents: 'none',
              }}>INR</span>
              <Input id="as-ret-ded" type="number" placeholder="0" value={returnForm.deductionAmount}
                onChange={e => setReturnForm(f => ({ ...f, deductionAmount: e.target.value }))}
                style={{ paddingLeft: 46 }} />
            </div>
          </Field>
          <Field label="Notes" htmlFor="as-ret-notes">
            <Textarea id="as-ret-notes" rows={2} value={returnForm.notes}
              onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── Mark lost ──────────────────────────────────────────────────────── */}
      <Modal open={showLost} size="sm" title="Mark Asset as Lost"
        onClose={() => setShowLost(false)}
        footer={modalFoot(handleMarkLost, () => { setShowLost(false); setError(''); }, 'Mark as Lost', { danger: true })}>
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <Callout tone="danger" icon={<AlertTriangle size={16} />}>
            This will mark the asset as lost and unassign it.
          </Callout>
          <Field label="Deduction Amount" htmlFor="as-lost-ded">
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', pointerEvents: 'none',
              }}>INR</span>
              <Input id="as-lost-ded" type="number" placeholder="0" value={lostForm.deductionAmount}
                onChange={e => setLostForm(f => ({ ...f, deductionAmount: e.target.value }))}
                style={{ paddingLeft: 46 }} />
            </div>
          </Field>
          <Field label="Notes" htmlFor="as-lost-notes">
            <Textarea id="as-lost-notes" rows={2} value={lostForm.notes}
              onChange={e => setLostForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      <Modal open={showEdit} size="sm" title="Edit Asset"
        onClose={() => setShowEdit(false)}
        footer={modalFoot(handleEdit, () => { setShowEdit(false); setError(''); }, 'Save Changes')}>
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Asset Type" htmlFor="as-edit-type">
            <Select id="as-edit-type" value={editForm.assetTypeId}
              onChange={e => setEditForm(f => ({ ...f, assetTypeId: e.target.value }))}>
              {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Name" htmlFor="as-edit-name">
            <Input id="as-edit-name" value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Model Name" htmlFor="as-edit-model">
            <Input id="as-edit-model" value={editForm.modelName}
              onChange={e => setEditForm(f => ({ ...f, modelName: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="as-edit-notes">
            <Textarea id="as-edit-notes" rows={2} value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
