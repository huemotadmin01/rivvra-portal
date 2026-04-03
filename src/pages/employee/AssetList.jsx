import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import assetApi from '../../utils/assetApi';
import employeeApi from '../../utils/employeeApi';
import {
  Search, Plus, Loader2, Package, ChevronDown, X, Monitor, Headphones, Briefcase, Box,
  User, ArrowRight, Filter,
} from 'lucide-react';

const STATUS_CONFIG = {
  available:  { label: 'Available',  bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  assigned:   { label: 'Assigned',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-500' },
  returned:   { label: 'Returned',   bg: 'bg-dark-700',       text: 'text-dark-300',    dot: 'bg-dark-400' },
  lost:       { label: 'Lost',       bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-500' },
  retired:    { label: 'Retired',    bg: 'bg-dark-800',       text: 'text-dark-500',    dot: 'bg-dark-600' },
};

const CONDITION_CONFIG = {
  new:     { label: 'New',     color: 'text-emerald-400' },
  good:    { label: 'Good',    color: 'text-blue-400' },
  fair:    { label: 'Fair',    color: 'text-amber-400' },
  damaged: { label: 'Damaged', color: 'text-red-400' },
  lost:    { label: 'Lost',    color: 'text-red-400' },
};

const TYPE_ICONS = {
  laptop: Monitor,
  headphone: Headphones,
  headphones: Headphones,
  bag: Briefcase,
};

function getTypeIcon(name) {
  const key = (name || '').toLowerCase();
  for (const [k, Icon] of Object.entries(TYPE_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Box;
}

export default function AssetList() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole } = useOrg();
  const isAdmin = getAppRole('employee') === 'admin';

  const [assets, setAssets] = useState([]);
  const [types, setTypes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Add asset modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ assetTypeId: '', name: '', modelName: '', condition: 'good', notes: '' });
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    loadAll();
  }, [orgSlug]);

  async function loadAll() {
    setLoading(true);
    try {
      const [assetsRes, typesRes, statsRes] = await Promise.all([
        assetApi.list(orgSlug),
        assetApi.listTypes(orgSlug),
        assetApi.stats(orgSlug),
      ]);
      setAssets(assetsRes.data || []);
      setTypes(typesRes.data || []);
      setStats(statsRes.data || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // Filtered assets
  const filtered = useMemo(() => {
    let list = assets;
    if (statusFilter) list = list.filter(a => a.status === statusFilter);
    if (typeFilter) list = list.filter(a => a.assetTypeId === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.modelName || '').toLowerCase().includes(q) ||
        (a.assetTypeName || '').toLowerCase().includes(q) ||
        (a.assignedToName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, statusFilter, typeFilter, search]);

  async function handleAdd() {
    if (!addForm.assetTypeId || !addForm.name.trim()) return;
    setSaving(true);
    try {
      await assetApi.create(orgSlug, addForm);
      setShowAdd(false);
      setAddForm({ assetTypeId: '', name: '', modelName: '', condition: 'good', notes: '' });
      await loadAll();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Assets</h1>
          <p className="text-sm text-dark-400 mt-0.5">Track and manage company assets</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors">
            <Plus size={16} /> Add Asset
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Assigned', value: stats.assigned, color: 'text-blue-400' },
            { label: 'Available', value: stats.available, color: 'text-emerald-400' },
            { label: 'Returned', value: stats.returned, color: 'text-dark-300' },
            { label: 'Lost', value: stats.lost, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-3">
              <p className="text-xs text-dark-400">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500">
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 focus:outline-none focus:border-rivvra-500">
          <option value="">All Types</option>
          {types.map(t => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        {(statusFilter || typeFilter || search) && (
          <button onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition-colors">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Asset Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{assets.length === 0 ? 'No assets yet' : 'No assets match your filters'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(asset => {
            const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.available;
            const cond = CONDITION_CONFIG[asset.condition] || CONDITION_CONFIG.good;
            const TypeIcon = getTypeIcon(asset.assetTypeName);
            return (
              <div key={asset._id}
                onClick={() => navigate(orgPath(`/employee/assets/${asset._id}`))}
                className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 hover:border-dark-600 cursor-pointer transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-dark-700/60 flex items-center justify-center">
                      <TypeIcon size={18} className="text-dark-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-rivvra-400 transition-colors">{asset.name}</p>
                      <p className="text-xs text-dark-500">{asset.assetTypeName}{asset.modelName ? ` - ${asset.modelName}` : ''}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.bg} ${st.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
                {asset.status === 'assigned' && asset.assignedToName && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dark-700/40">
                    <User size={12} className="text-dark-500" />
                    <span className="text-xs text-dark-400">{asset.assignedToName}</span>
                    {asset.assignedDate && (
                      <span className="text-xs text-dark-600 ml-auto">
                        since {new Date(asset.assignedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[10px] font-medium ${cond.color}`}>Condition: {cond.label}</span>
                  <ArrowRight size={14} className="text-dark-600 group-hover:text-rivvra-400 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Asset Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAdd(false)}>
          <div className="bg-dark-850 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add Asset</h2>
              <button onClick={() => setShowAdd(false)} className="text-dark-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Asset Type *</label>
                <select value={addForm.assetTypeId} onChange={e => setAddForm(f => ({ ...f, assetTypeId: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                  <option value="">Select type...</option>
                  {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dell Latitude 3420"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
              </div>
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Model Name</label>
                <input value={addForm.modelName} onChange={e => setAddForm(f => ({ ...f, modelName: e.target.value }))}
                  placeholder="e.g. Lenovo ThinkPad"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
              </div>
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Condition</label>
                <select value={addForm.condition} onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500">
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Optional notes..."
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleAdd} disabled={saving || !addForm.assetTypeId || !addForm.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add Asset
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
