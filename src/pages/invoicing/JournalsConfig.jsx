import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Plus, Pencil, Trash2, FileText, X, Check,
  ToggleLeft, ToggleRight, Search, Star,
} from 'lucide-react';

const TYPE_STYLES = {
  sale:          { bg: 'bg-blue-500/10',    text: 'text-blue-400',    label: 'Sale' },
  purchase:      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Purchase' },
  bank:          { bg: 'bg-green-500/10',   text: 'text-green-400',   label: 'Bank' },
  cash:          { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Cash' },
  miscellaneous: { bg: 'bg-gray-500/10',    text: 'text-gray-400',    label: 'Miscellaneous' },
};

function TypeBadge({ type }) {
  const st = TYPE_STYLES[type] || TYPE_STYLES.miscellaneous;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${st.bg} ${st.text}`}>
      {st.label}
    </span>
  );
}

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

const EMPTY_JOURNAL = {
  name: '',
  code: '',
  type: 'sale',
  currency: 'INR',
  active: true,
  isDefault: false,
};

export default function JournalsConfig() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();

  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_JOURNAL });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicingApi.listJournals(orgSlug);
      setJournals(res.journals || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load journals', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (orgSlug) loadData();
  }, [loadData, orgSlug]);

  const filtered = useMemo(() => {
    let list = journals;
    if (typeFilter) list = list.filter(j => j.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        (j.name || '').toLowerCase().includes(q) ||
        (j.code || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [journals, typeFilter, search]);

  function startAdd() {
    setEditingId('new');
    setForm({ ...EMPTY_JOURNAL });
  }

  function startEdit(journal) {
    setEditingId(journal._id);
    setForm({
      name: journal.name || '',
      code: journal.code || '',
      type: journal.type || 'sale',
      currency: journal.currency || 'INR',
      active: journal.active !== false,
      isDefault: !!journal.isDefault,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_JOURNAL });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast('Journal name is required', 'error');
      return;
    }
    if (!form.code.trim()) {
      showToast('Short code is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        currency: form.currency,
        active: form.active,
        isDefault: !!form.isDefault,
      };

      if (editingId === 'new') {
        await invoicingApi.createJournal(orgSlug, payload);
        showToast('Journal created');
      } else {
        await invoicingApi.updateJournal(orgSlug, editingId, payload);
        showToast('Journal updated');
      }
      setEditingId(null);
      setForm({ ...EMPTY_JOURNAL });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save journal', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(journal) {
    const ok = window.confirm(
      `Delete "${journal.name}" (${journal.code})? This permanently removes the journal. ` +
      `If invoices reference it, deletion is refused — deactivate the journal instead to hide it.`
    );
    if (!ok) return;
    setDeletingId(journal._id);
    try {
      await invoicingApi.deleteJournal(orgSlug, journal._id);
      showToast('Journal deleted');
      setJournals(prev => prev.filter(j => j._id !== journal._id));
      if (editingId === journal._id) cancelEdit();
    } catch (err) {
      showToast(err.message || 'Failed to delete journal', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(journal) {
    try {
      await invoicingApi.updateJournal(orgSlug, journal._id, { active: !journal.active });
      setJournals(prev =>
        prev.map(j => j._id === journal._id ? { ...j, active: !j.active } : j)
      );
      showToast(journal.active ? 'Journal deactivated' : 'Journal activated');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  }

  async function makeDefault(journal) {
    try {
      await invoicingApi.updateJournal(orgSlug, journal._id, { isDefault: true });
      // Backend unsets siblings of the same (company, type). Mirror that here
      // so the UI reflects the change without a full reload.
      setJournals(prev => prev.map(j => {
        if (j._id === journal._id) return { ...j, isDefault: true };
        if (j.type === journal.type) return { ...j, isDefault: false };
        return j;
      }));
      showToast(`${journal.name} set as default ${journal.type} journal`);
    } catch (err) {
      showToast(err.message || 'Failed to set default', 'error');
    }
  }

  const inputCls = 'w-full px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500';
  const selectCls = 'px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500';

  function FormRow() {
    return (
      <tr className="border-b border-dark-700/50 bg-dark-800/80">
        <td className="px-4 py-3">
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Journal name *"
            autoFocus
            className={inputCls}
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.code}
            onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
            placeholder="e.g. SAL"
            className={`${inputCls} max-w-[100px] uppercase`}
            maxLength={10}
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
            className={selectCls}
          >
            <option value="sale">Sale</option>
            <option value="purchase">Purchase</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="miscellaneous">Miscellaneous</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <select
            value={form.currency}
            onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
            className={selectCls}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))}
              className="text-dark-400 hover:text-white transition-colors"
              title={form.active ? 'Active' : 'Inactive'}
            >
              {form.active ? (
                <ToggleRight size={20} className="text-emerald-400" />
              ) : (
                <ToggleLeft size={20} className="text-dark-600" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, isDefault: !prev.isDefault }))}
              className={form.isDefault ? 'text-amber-400' : 'text-dark-600 hover:text-dark-400'}
              title={form.isDefault ? 'Default for this type' : 'Set as default for this type'}
            >
              <Star size={16} fill={form.isDefault ? 'currentColor' : 'none'} />
            </button>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Journals</h1>
          <p className="text-sm text-dark-400 mt-0.5">Configure accounting journals</p>
        </div>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus size={16} /> Add Journal
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search journals..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500"
        >
          <option value="">All Types</option>
          <option value="sale">Sale</option>
          <option value="purchase">Purchase</option>
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
          <option value="miscellaneous">Miscellaneous</option>
        </select>
        {(search || typeFilter) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); }}
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
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Journal Name</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Short Code</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Type</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Currency</span>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-xs font-medium text-dark-400">Status</span>
                  </th>
                  <th className="text-right px-4 py-3 w-[100px]">
                    <span className="text-xs font-medium text-dark-400">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && <FormRow />}

                {filtered.length === 0 && editingId !== 'new' ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <FileText size={48} className="mx-auto mb-3 opacity-30 text-dark-500" />
                      <p className="text-sm text-dark-500">
                        {journals.length === 0 ? 'No journals yet' : 'No journals match your filters'}
                      </p>
                      {journals.length === 0 && (
                        <button
                          onClick={startAdd}
                          className="mt-3 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
                        >
                          Add your first journal
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(journal => {
                    if (editingId === journal._id) {
                      return <FormRow key={journal._id} />;
                    }
                    return (
                      <tr
                        key={journal._id}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white">{journal.name}</p>
                            {journal.isDefault && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400"
                                title={`Default ${journal.type} journal — used when Create Invoice / Create Bill is clicked`}
                              >
                                <Star size={10} fill="currentColor" /> Default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-dark-700 text-dark-300">
                            {journal.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={journal.type} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-dark-300">{journal.currency || 'INR'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleActive(journal)}
                            className="inline-flex items-center transition-colors"
                            title={journal.active !== false ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          >
                            {journal.active !== false ? (
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
                            {!journal.isDefault && journal.active !== false && (
                              <button
                                onClick={() => makeDefault(journal)}
                                disabled={editingId !== null}
                                className="p-1.5 rounded-lg text-dark-400 hover:text-amber-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                                title={`Set as default ${journal.type} journal`}
                              >
                                <Star size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(journal)}
                              disabled={editingId !== null}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(journal)}
                              disabled={deletingId === journal._id}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors disabled:opacity-30"
                              title="Delete"
                            >
                              {deletingId === journal._id ? (
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
