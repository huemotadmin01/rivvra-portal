import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import fnfApi from '../../utils/fnfApi';
import {
  Loader2, Calculator, CheckCircle2, Clock, FileText, AlertTriangle,
  ArrowRight, User, Calendar, IndianRupee, Search,
} from 'lucide-react';

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', bg: 'bg-dark-700', text: 'text-dark-400', dot: 'bg-dark-500' },
  draft:       { label: 'Draft',       bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  finalized:   { label: 'Finalized',   bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

// Stage = backend-computed lifecycle category for the row
const STAGE_CONFIG = {
  scheduled: { label: 'Scheduled Exit', bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-500' },
  pending:   { label: 'Pending F&F',    bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-500' },
  settled:   { label: 'Settled',        bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  return 'INR ' + Number(n).toLocaleString('en-IN');
}

export default function FnFDashboard() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const [pending, setPending] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | scheduled | pending | settled

  useEffect(() => { loadAll(); }, [orgSlug]);

  async function loadAll() {
    setLoading(true);
    try {
      const [pendingRes, settRes] = await Promise.all([
        fnfApi.getPending(orgSlug),
        fnfApi.listSettlements(orgSlug),
      ]);
      setPending(pendingRes.data || []);
      setSettlements(settRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // Merge pending (employees) with settlements
  const merged = pending.map(emp => {
    const sett = settlements.find(s => s.employeeId === emp._id?.toString());
    // Use backend-provided fnfStage when available; otherwise derive locally for safety
    const status = sett?.status || emp.fnfStatus || 'not_started';
    let stage = emp.fnfStage;
    if (!stage) {
      if (status === 'finalized' || status === 'paid') stage = 'settled';
      else if (emp.status === 'active' && emp.lastWorkingDate) stage = 'scheduled';
      else stage = 'pending';
    }
    return {
      ...emp,
      fnfStatus: status,
      fnfStage: stage,
      netSettlement: sett?.netSettlement,
      finalizedAt: sett?.finalizedAt,
      updatedAt: sett?.updatedAt,
    };
  });

  const filtered = merged.filter(e => {
    if (tab !== 'all' && e.fnfStage !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.fullName || '').toLowerCase().includes(q) ||
        (e.employeeId || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: merged.length,
    scheduled: merged.filter(e => e.fnfStage === 'scheduled').length,
    pending: merged.filter(e => e.fnfStage === 'pending').length,
    settled: merged.filter(e => e.fnfStage === 'settled').length,
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Calculator size={20} /> Full & Final Settlements
        </h1>
        <p className="text-sm text-dark-400 mt-0.5">Manage F&F settlements for separated employees</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all',       label: 'Total Exits',    value: stats.total,     color: 'text-white' },
          { key: 'scheduled', label: 'Scheduled Exit', value: stats.scheduled, color: 'text-blue-400' },
          { key: 'pending',   label: 'Pending F&F',    value: stats.pending,   color: 'text-amber-400' },
          { key: 'settled',   label: 'Settled',        value: stats.settled,   color: 'text-emerald-400' },
        ].map(s => (
          <button key={s.key} onClick={() => setTab(s.key)}
            className={`bg-dark-800/60 border rounded-xl p-3 text-left transition-colors ${
              tab === s.key ? 'border-rivvra-500/40' : 'border-dark-700/50 hover:border-dark-600'
            }`}>
            <p className="text-xs text-dark-400">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..."
          className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <Calculator size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{merged.length === 0 ? 'No separated confirmed employees' : 'No results match your filter'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const st = STATUS_CONFIG[emp.fnfStatus] || STATUS_CONFIG.not_started;
            const stage = STAGE_CONFIG[emp.fnfStage] || STAGE_CONFIG.pending;
            return (
              <div key={emp._id}
                onClick={() => navigate(orgPath(`/employee/${emp._id}`))}
                className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 flex items-center gap-4 hover:border-dark-600 cursor-pointer transition-all group">
                <div className="w-10 h-10 rounded-full bg-dark-700/60 flex items-center justify-center shrink-0">
                  <User size={18} className="text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white group-hover:text-rivvra-400 transition-colors truncate">{emp.fullName}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${stage.bg} ${stage.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                      {stage.label}
                    </span>
                    {emp.fnfStatus !== 'not_started' && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
                    <span className="capitalize">{emp.status}</span>
                    {emp.lastWorkingDate && (
                      <span className="flex items-center gap-1"><Calendar size={10} /> LWD: {fmtDate(emp.lastWorkingDate)}</span>
                    )}
                    {emp.separationReason && <span>{emp.separationReason}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {emp.netSettlement !== undefined && emp.netSettlement !== null ? (
                    <p className={`text-sm font-medium ${emp.netSettlement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtINR(emp.netSettlement)}
                    </p>
                  ) : (
                    <p className="text-xs text-dark-600">—</p>
                  )}
                </div>
                <ArrowRight size={16} className="text-dark-600 group-hover:text-rivvra-400 transition-colors shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
