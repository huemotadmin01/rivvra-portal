import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import assetApi from '../../utils/assetApi';
import employeeApi from '../../utils/employeeApi';
import {
  ArrowLeft, Loader2, User, Calendar, Package, Pencil, RotateCcw, AlertTriangle,
  CheckCircle2, X, Clock, History, IndianRupee, RefreshCw,
} from 'lucide-react';

const STATUS_CONFIG = {
  available:  { label: 'Available',  bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  assigned:   { label: 'Assigned',   bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  returned:   { label: 'Returned',   bg: 'bg-dark-700/50',    text: 'text-dark-300',    border: 'border-dark-600' },
  lost:       { label: 'Lost',       bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30' },
  retired:    { label: 'Retired',    bg: 'bg-dark-800',       text: 'text-dark-500',    border: 'border-dark-700' },
};

const CONDITION_LABELS = { new: 'New', good: 'Good', fair: 'Fair', damaged: 'Damaged', lost: 'Lost' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AssetDetail() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole } = useOrg();
  const isAdmin = getAppRole('employee') === 'admin';

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
  const [reassignForm, setReassignForm] = useState({ employeeId: '', notes: '' });
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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleAssign() {
    if (!assignForm.employeeId) return;
    setSaving(true);
    try {
      await assetApi.assign(orgSlug, assetId, assignForm);
      setShowAssign(false);
      setAssignForm({ employeeId: '', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleReassign() {
    if (!reassignForm.employeeId) return;
    setSaving(true);
    try {
      // Return from current employee first, then assign to new
      await assetApi.returnAsset(orgSlug, assetId, { condition: 'good', notes: 'Reassigned to another employee' });
      await assetApi.assign(orgSlug, assetId, reassignForm);
      setShowReassign(false);
      setReassignForm({ employeeId: '', notes: '' });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleReturn() {
    setSaving(true);
    try {
      await assetApi.returnAsset(orgSlug, assetId, returnForm);
      setShowReturn(false);
      setReturnForm({ condition: 'good', notes: '', deductionAmount: '' });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleMarkLost() {
    setSaving(true);
    try {
      await assetApi.markLost(orgSlug, assetId, lostForm);
      setShowLost(false);
      setLostForm({ notes: '', deductionAmount: '' });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    setSaving(true);
    try {
      await assetApi.update(orgSlug, assetId, editForm);
      setShowEdit(false);
      await load();
    } catch (e) { console.error(e); }
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

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
    </div>
  );

  if (!asset) return (
    <div className="p-6 text-center text-dark-400">
      <p>Asset not found</p>
      <button onClick={() => navigate(orgPath('/employee/assets'))} className="text-rivvra-400 text-sm mt-2">Back to Assets</button>
    </div>
  );

  const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.available;
  const history = (asset.assignmentHistory || []).slice().reverse();

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate(orgPath('/employee/assets'))}
          className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white mb-3 transition-colors">
          <ArrowLeft size={16} /> Back to Assets
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">{asset.name}</h1>
            <p className="text-sm text-dark-400 mt-0.5">{asset.assetTypeName}{asset.modelName ? ` - ${asset.modelName}` : ''}</p>
          </div>
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${st.bg} ${st.text} ${st.border}`}>
            {st.label}
          </span>
        </div>
      </div>

      {/* Action Buttons (Admin) */}
      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          {asset.status === 'available' && (
            <button onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors">
              <User size={14} /> Assign to Employee
            </button>
          )}
          {asset.status === 'assigned' && (
            <>
              <button onClick={() => setShowReassign(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors">
                <User size={14} /> Reassign
              </button>
              <button onClick={() => setShowReturn(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                <RotateCcw size={14} /> Mark Returned
              </button>
              <button onClick={() => setShowLost(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors">
                <AlertTriangle size={14} /> Mark Lost
              </button>
            </>
          )}
          {(asset.status === 'returned' || asset.status === 'retired') && (
            <button onClick={handleMakeAvailable}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
              <RefreshCw size={14} /> Make Available
            </button>
          )}
          <button onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-dark-300 text-sm font-medium hover:bg-dark-600 transition-colors">
            <Pencil size={14} /> Edit Details
          </button>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Details */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Package size={15} /> Details</h3>
          <div className="space-y-2">
            <InfoRow label="Type" value={asset.assetTypeName} />
            <InfoRow label="Name" value={asset.name} />
            <InfoRow label="Model" value={asset.modelName || '—'} />
            <InfoRow label="Condition" value={CONDITION_LABELS[asset.condition] || asset.condition} />
            <InfoRow label="Notes" value={asset.notes || '—'} />
            <InfoRow label="Created" value={formatDate(asset.createdAt)} />
          </div>
        </div>

        {/* Current Assignment */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><User size={15} /> Current Assignment</h3>
          {asset.status === 'assigned' ? (
            <div className="space-y-2">
              <InfoRow label="Assigned To" value={asset.assignedToName} />
              <InfoRow label="Assigned Date" value={formatDate(asset.assignedDate)} />
            </div>
          ) : (
            <p className="text-sm text-dark-500 py-4 text-center">Not currently assigned</p>
          )}
        </div>
      </div>

      {/* Assignment History */}
      {history.length > 0 && (
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><History size={15} /> Assignment History</h3>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 pl-3 border-l-2 border-dark-600 pb-3 last:pb-0">
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">{h.employeeName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-dark-400">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(h.assignedDate)}</span>
                    {h.returnedDate && (
                      <span className="flex items-center gap-1">
                        <RotateCcw size={11} /> Returned {formatDate(h.returnedDate)}
                        {h.returnCondition && <span className="text-dark-500">({h.returnCondition})</span>}
                      </span>
                    )}
                  </div>
                  {h.deductionAmount > 0 && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <IndianRupee size={10} /> Deduction: {h.deductionAmount.toLocaleString('en-IN')}
                    </p>
                  )}
                  {h.returnNotes && <p className="text-xs text-dark-500 mt-1">{h.returnNotes}</p>}
                </div>
                {!h.returnedDate && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400">Active</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Assign Modal ── */}
      {showAssign && (
        <Modal title="Assign Asset" onClose={() => setShowAssign(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Employee *</label>
              <select value={assignForm.employeeId} onChange={e => setAssignForm(f => ({ ...f, employeeId: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                <option value="">Select employee...</option>
                {employees.map(e => (
                  <option key={e._id} value={e._id}>{e.fullName || `${e.firstName} ${e.lastName}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Notes</label>
              <textarea value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <ModalActions onSave={handleAssign} onCancel={() => setShowAssign(false)} saving={saving} disabled={!assignForm.employeeId} label="Assign" />
        </Modal>
      )}

      {/* ── Reassign Modal ── */}
      {showReassign && (
        <Modal title="Reassign Asset" onClose={() => setShowReassign(false)}>
          <p className="text-sm text-dark-400 mb-3">Currently assigned to: <span className="text-white font-medium">{asset.assignedToName}</span></p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">New Employee *</label>
              <select value={reassignForm.employeeId} onChange={e => setReassignForm(f => ({ ...f, employeeId: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                <option value="">Select employee...</option>
                {employees.filter(e => e._id !== asset.assignedTo).map(e => (
                  <option key={e._id} value={e._id}>{e.fullName || `${e.firstName} ${e.lastName}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Notes</label>
              <textarea value={reassignForm.notes} onChange={e => setReassignForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <ModalActions onSave={handleReassign} onCancel={() => setShowReassign(false)} saving={saving} disabled={!reassignForm.employeeId} label="Reassign" />
        </Modal>
      )}

      {/* ── Return Modal ── */}
      {showReturn && (
        <Modal title="Return Asset" onClose={() => setShowReturn(false)}>
          <p className="text-sm text-dark-400 mb-3">Returning from: <span className="text-white font-medium">{asset.assignedToName}</span></p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Return Condition *</label>
              <select value={returnForm.condition} onChange={e => setReturnForm(f => ({ ...f, condition: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Deduction Amount (if any)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">INR</span>
                <input type="number" value={returnForm.deductionAmount} onChange={e => setReturnForm(f => ({ ...f, deductionAmount: e.target.value }))}
                  placeholder="0" className="w-full pl-12 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Notes</label>
              <textarea value={returnForm.notes} onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <ModalActions onSave={handleReturn} onCancel={() => setShowReturn(false)} saving={saving} label="Confirm Return" />
        </Modal>
      )}

      {/* ── Mark Lost Modal ── */}
      {showLost && (
        <Modal title="Mark Asset as Lost" onClose={() => setShowLost(false)}>
          <p className="text-sm text-red-400 mb-3 flex items-center gap-2"><AlertTriangle size={14} /> This will mark the asset as lost and unassign it.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Deduction Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">INR</span>
                <input type="number" value={lostForm.deductionAmount} onChange={e => setLostForm(f => ({ ...f, deductionAmount: e.target.value }))}
                  placeholder="0" className="w-full pl-12 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Notes</label>
              <textarea value={lostForm.notes} onChange={e => setLostForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <ModalActions onSave={handleMarkLost} onCancel={() => setShowLost(false)} saving={saving} label="Mark as Lost" danger />
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {showEdit && (
        <Modal title="Edit Asset" onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Asset Type</label>
              <select value={editForm.assetTypeId} onChange={e => setEditForm(f => ({ ...f, assetTypeId: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Model Name</label>
              <input value={editForm.modelName} onChange={e => setEditForm(f => ({ ...f, modelName: e.target.value }))}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-rivvra-500" />
            </div>
          </div>
          <ModalActions onSave={handleEdit} onCancel={() => setShowEdit(false)} saving={saving} label="Save Changes" />
        </Modal>
      )}
    </div>
  );
}

// ── Shared Components ──

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-dark-500 shrink-0">{label}</span>
      <span className="text-sm text-dark-200 text-right">{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onSave, onCancel, saving, disabled, label, danger }) {
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-dark-700">
      <button onClick={onSave} disabled={saving || disabled}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
          danger ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-rivvra-500 hover:bg-rivvra-600 text-white'
        }`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {label}
      </button>
      <button onClick={onCancel}
        className="px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm font-medium transition-colors">
        Cancel
      </button>
    </div>
  );
}
