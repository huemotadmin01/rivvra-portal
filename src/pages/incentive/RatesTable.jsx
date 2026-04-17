// ============================================================================
// RatesTable.jsx — Admin rate versioning (effective-dated %)
// ============================================================================

import { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import { Loader2, Plus, Trash2, Percent } from 'lucide-react';

const ROLE_LABEL = {
  recruiter: 'Recruiter',
  account_manager: 'Account Manager',
};

export default function RatesTable() {
  const { currentOrg } = useOrg();
  const { showToast } = useToast();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newRate, setNewRate] = useState({
    role: 'recruiter',
    ratePct: '',
    effectiveFrom: '',
    note: '',
  });

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  async function load() {
    setLoading(true);
    try {
      const res = await incentiveApi.listRates(orgSlug);
      setRates(res?.rates || res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function onAdd() {
    if (!newRate.ratePct || !newRate.effectiveFrom) {
      showToast('Rate % and effective-from date are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await incentiveApi.createRate(orgSlug, {
        role: newRate.role,
        rate: Number(newRate.ratePct) / 100,
        effectiveFrom: newRate.effectiveFrom,
        note: newRate.note,
      });
      setNewRate({ role: 'recruiter', ratePct: '', effectiveFrom: '', note: '' });
      showToast('Rate added. Prior open entry auto-closed.', 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Failed to add rate', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm('Delete this rate entry?')) return;
    try {
      await incentiveApi.deleteRate(orgSlug, id);
      showToast('Deleted', 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Percent className="text-fuchsia-400" /> Incentive Rate Table
        </h1>
        <p className="text-sm text-dark-400 mt-1">
          Effective-dated rates per role. New rates only affect records created
          after they take effect (forward-only).
        </p>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
          Add new rate
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={newRate.role}
            onChange={(e) => setNewRate({ ...newRate, role: e.target.value })}
            className={inputCls}
          >
            <option value="recruiter">Recruiter</option>
            <option value="account_manager">Account Manager</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={newRate.ratePct}
            onChange={(e) => setNewRate({ ...newRate, ratePct: e.target.value })}
            placeholder="Rate %"
            className={inputCls}
          />
          <input
            type="date"
            value={newRate.effectiveFrom}
            onChange={(e) =>
              setNewRate({ ...newRate, effectiveFrom: e.target.value })
            }
            className={inputCls}
          />
          <input
            type="text"
            value={newRate.note}
            onChange={(e) => setNewRate({ ...newRate, note: e.target.value })}
            placeholder="Note (optional)"
            className={`${inputCls} md:col-span-1`}
          />
          <button
            onClick={onAdd}
            disabled={saving}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add
          </button>
        </div>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-dark-500" size={24} />
          </div>
        ) : rates.length === 0 ? (
          <div className="p-10 text-center text-dark-400 text-sm">
            No rates configured yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-850 text-dark-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-right px-4 py-2 font-medium">Rate</th>
                <th className="text-left px-4 py-2 font-medium">Effective from</th>
                <th className="text-left px-4 py-2 font-medium">Effective to</th>
                <th className="text-left px-4 py-2 font-medium">Note</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r._id} className="border-t border-dark-800">
                  <td className="px-4 py-2 text-white">
                    {ROLE_LABEL[r.role] || r.role}
                  </td>
                  <td className="px-4 py-2 text-right text-white font-medium">
                    {(r.rate * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-dark-300">
                    {r.effectiveFrom
                      ? new Date(r.effectiveFrom).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-dark-300">
                    {r.effectiveTo
                      ? new Date(r.effectiveTo).toLocaleDateString()
                      : 'open'}
                  </td>
                  <td className="px-4 py-2 text-dark-400">{r.note || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => onDelete(r._id)}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-600';
