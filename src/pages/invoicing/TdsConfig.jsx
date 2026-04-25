import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import {
  Loader2, Plus, Pencil, Trash2, Percent, X, Check, Sparkles, Search,
} from 'lucide-react';

const APPLICABLE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];

const APPLICABLE_STYLES = {
  all:        { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  individual: { bg: 'bg-blue-500/10',    text: 'text-blue-400' },
  company:    { bg: 'bg-amber-500/10',   text: 'text-amber-400' },
};

const EMPTY_ROW = {
  sectionCode: '',
  description: '',
  rateIndividual: '',
  rateCompany: '',
  ratePanMissing: 20,
  thresholdPerInvoice: 0,
  thresholdAnnual: 0,
  applicableTo: 'all',
  active: true,
};

function formatAmount(n) {
  if (n == null || n === 0) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function TdsConfig() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_ROW });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const companyId = currentCompany?._id;

  const loadData = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await invoicingApi.listTdsConfig(orgSlug);
      setRows(res.rows || []);
    } catch (err) {
      showToast(err.message || 'Failed to load TDS sections', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, companyId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.sectionCode || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_ROW });
  }

  function startEdit(row) {
    setEditingId(row._id);
    setForm({
      sectionCode: row.sectionCode || '',
      description: row.description || '',
      rateIndividual: row.rateIndividual ?? '',
      rateCompany: row.rateCompany ?? '',
      ratePanMissing: row.ratePanMissing ?? 20,
      thresholdPerInvoice: row.thresholdPerInvoice ?? 0,
      thresholdAnnual: row.thresholdAnnual ?? 0,
      applicableTo: row.applicableTo || 'all',
      active: row.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_ROW });
  }

  async function handleSave() {
    if (!form.sectionCode.trim()) {
      showToast('Section code is required (e.g. 194C)', 'error');
      return;
    }
    if (!companyId) {
      showToast('Select a company from the header first', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sectionCode: form.sectionCode.trim().toUpperCase(),
        description: form.description.trim(),
        rateIndividual: Number(form.rateIndividual) || 0,
        rateCompany: Number(form.rateCompany) || 0,
        ratePanMissing: Number(form.ratePanMissing) || 20,
        thresholdPerInvoice: Number(form.thresholdPerInvoice) || 0,
        thresholdAnnual: Number(form.thresholdAnnual) || 0,
        applicableTo: form.applicableTo,
        active: form.active,
      };

      if (editingId === 'new') {
        await invoicingApi.createTdsConfig(orgSlug, payload);
        showToast('TDS section added');
      } else {
        await invoicingApi.updateTdsConfig(orgSlug, editingId, payload);
        showToast('TDS section updated');
      }
      cancelEdit();
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save TDS section', 'error');
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(row) {
    setConfirmDelete({ row, busy: false });
  }

  async function runDelete() {
    if (!confirmDelete?.row) return;
    const row = confirmDelete.row;
    setConfirmDelete((c) => (c ? { ...c, busy: true } : null));
    setDeletingId(row._id);
    try {
      await invoicingApi.deleteTdsConfig(orgSlug, row._id);
      setRows(prev => prev.filter(r => r._id !== row._id));
      if (editingId === row._id) cancelEdit();
      showToast('TDS section deleted');
      setConfirmDelete(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete TDS section', 'error');
      setConfirmDelete((c) => (c ? { ...c, busy: false } : null));
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(row) {
    try {
      await invoicingApi.updateTdsConfig(orgSlug, row._id, { active: !row.active });
      setRows(prev => prev.map(r => r._id === row._id ? { ...r, active: !r.active } : r));
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  async function handleSeedDefaults() {
    if (!companyId) {
      showToast('Select a company from the header first', 'error');
      return;
    }
    setSeeding(true);
    try {
      const res = await invoicingApi.seedTdsDefaults(orgSlug);
      showToast(`Seeded ${res.inserted} section(s), ${res.skipped} already existed`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to seed defaults', 'error');
    } finally {
      setSeeding(false);
    }
  }

  const inputCls = 'w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500';
  const selectCls = 'px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500';

  function FormRow() {
    return (
      <tr className="border-b border-dark-700/50 bg-dark-800/80">
        <td className="px-4 py-3">
          <input
            value={form.sectionCode}
            onChange={e => setForm(p => ({ ...p, sectionCode: e.target.value }))}
            placeholder="194C"
            autoFocus
            className={`${inputCls} max-w-[110px] font-mono`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="e.g. Payment to contractors"
            className={inputCls}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number" min="0" step="0.01"
            value={form.rateIndividual}
            onChange={e => setForm(p => ({ ...p, rateIndividual: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[80px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number" min="0" step="0.01"
            value={form.rateCompany}
            onChange={e => setForm(p => ({ ...p, rateCompany: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[80px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number" min="0" step="0.01"
            value={form.ratePanMissing}
            onChange={e => setForm(p => ({ ...p, ratePanMissing: e.target.value }))}
            placeholder="20"
            className={`${inputCls} max-w-[80px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number" min="0" step="1"
            value={form.thresholdPerInvoice}
            onChange={e => setForm(p => ({ ...p, thresholdPerInvoice: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[120px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number" min="0" step="1"
            value={form.thresholdAnnual}
            onChange={e => setForm(p => ({ ...p, thresholdAnnual: e.target.value }))}
            placeholder="0"
            className={`${inputCls} max-w-[120px] text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={form.applicableTo}
            onChange={e => setForm(p => ({ ...p, applicableTo: e.target.value }))}
            className={selectCls}
          >
            {APPLICABLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, active: !p.active }))}
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${form.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-500'}`}
          >
            {form.active ? 'Active' : 'Inactive'}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white transition-colors disabled:opacity-50"
              title="Save"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={cancelEdit}
              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete TDS section?"
        message={
          confirmDelete?.row
            ? `Delete TDS section "${confirmDelete.row.sectionCode}"? Existing payments already tagged with it are unaffected, but new entries can no longer use it.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={!!confirmDelete?.busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={runDelete}
      />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">TDS Sections</h1>
          <p className="text-sm text-dark-400 mt-0.5">
            Tax deducted at source on vendor/contractor payments
            {currentCompany?.name && <span className="text-dark-500"> · {currentCompany.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length === 0 && !loading && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding || !companyId}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {seeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Seed Indian Defaults
            </button>
          )}
          <button
            onClick={startAdd}
            disabled={editingId === 'new' || !companyId}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus size={16} /> Add Section
          </button>
        </div>
      </div>

      {!companyId && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          Select a company from the header to manage its TDS sections. TDS config is per-company (each entity has its own TAN and files Form 26Q separately).
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sections..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
        </div>
      ) : (
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3"><span className="text-xs font-medium text-dark-400">Section</span></th>
                  <th className="text-left px-4 py-3"><span className="text-xs font-medium text-dark-400">Description</span></th>
                  <th className="text-right px-4 py-3"><span className="text-xs font-medium text-dark-400">Indiv %</span></th>
                  <th className="text-right px-4 py-3"><span className="text-xs font-medium text-dark-400">Company %</span></th>
                  <th className="text-right px-4 py-3"><span className="text-xs font-medium text-dark-400">No PAN %</span></th>
                  <th className="text-right px-4 py-3"><span className="text-xs font-medium text-dark-400">Per Invoice ₹</span></th>
                  <th className="text-right px-4 py-3"><span className="text-xs font-medium text-dark-400">Annual ₹</span></th>
                  <th className="text-left px-4 py-3"><span className="text-xs font-medium text-dark-400">Applies To</span></th>
                  <th className="text-center px-4 py-3"><span className="text-xs font-medium text-dark-400">Status</span></th>
                  <th className="text-right px-4 py-3 w-[100px]"><span className="text-xs font-medium text-dark-400">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && <FormRow />}

                {filtered.length === 0 && editingId !== 'new' ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16">
                      <Percent size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {rows.length === 0 ? 'No TDS sections configured yet' : 'No sections match your search'}
                      </p>
                      {rows.length === 0 && companyId && (
                        <p className="text-xs text-dark-600 mt-1">Seed the standard Indian sections or add one manually.</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(row => {
                    if (editingId === row._id) return <FormRow key={row._id} />;
                    const appSt = APPLICABLE_STYLES[row.applicableTo] || APPLICABLE_STYLES.all;
                    return (
                      <tr
                        key={row._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-medium text-white">{row.sectionCode}</span>
                        </td>
                        <td className="px-4 py-3 text-dark-300 max-w-[280px] truncate" title={row.description}>
                          {row.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-white">{row.rateIndividual ?? 0}%</td>
                        <td className="px-4 py-3 text-right text-white">{row.rateCompany ?? 0}%</td>
                        <td className="px-4 py-3 text-right text-amber-300">{row.ratePanMissing ?? 20}%</td>
                        <td className="px-4 py-3 text-right text-dark-300">{formatAmount(row.thresholdPerInvoice)}</td>
                        <td className="px-4 py-3 text-right text-dark-300">{formatAmount(row.thresholdAnnual)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${appSt.bg} ${appSt.text} capitalize`}>
                            {row.applicableTo || 'all'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(row)}
                            title={row.active !== false ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                          >
                            {row.active !== false ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-dark-700 text-dark-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-dark-600" />
                                Inactive
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(row)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => requestDelete(row)}
                              disabled={deletingId === row._id}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Delete"
                            >
                              {deletingId === row._id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
