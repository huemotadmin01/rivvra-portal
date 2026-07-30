import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import fnfApi from '../../utils/fnfApi';
import { formatMoney } from '../../utils/formatCurrency';
import {
  Loader2, Calculator, CheckCircle2, Clock, FileText, AlertTriangle,
  ArrowRight, User, Calendar, IndianRupee, Search,
} from 'lucide-react';

// Settlement statuses in the order an admin walks through them.
const STATUS_CONFIG = {
  not_started: { label: 'Not started',  bg: 'bg-dark-700',       text: 'text-dark-400',    dot: 'bg-dark-500' },
  draft:       { label: 'Draft',        bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-500' },
  finalized:   { label: 'Finalized',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  // 'paid' was missing and fell back to the "Not started" label.
  paid:        { label: 'Paid',         bg: 'bg-rivvra-500/10',  text: 'text-rivvra-400',  dot: 'bg-rivvra-500' },
};

// draft → finalized → paid, so the row shows how far along a settlement is and
// what the next action is.
const PROGRESS_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'finalized', label: 'Finalized' },
  { key: 'paid', label: 'Paid' },
];

const NEXT_ACTION = {
  not_started: 'Calculate settlement',
  draft: 'Review & finalize',
  finalized: 'Mark as paid',
  paid: null,
};

// Module scope — never declare a component inside a render body.
function SettlementProgress({ status }) {
  const reached = PROGRESS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-1" title={`Settlement progress: ${(STATUS_CONFIG[status] || STATUS_CONFIG.not_started).label}`}>
      {PROGRESS_STEPS.map((step, i) => (
        <span key={step.key} className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${i <= reached ? 'bg-emerald-500' : 'bg-dark-600'}`} />
          <span className={`text-[10px] ${i <= reached ? 'text-dark-300' : 'text-dark-600'}`}>{step.label}</span>
          {i < PROGRESS_STEPS.length - 1 && <span className={`w-3 h-px ${i < reached ? 'bg-emerald-500/60' : 'bg-dark-700'}`} />}
        </span>
      ))}
    </div>
  );
}

// Stage = backend-computed lifecycle category for the row
const STAGE_CONFIG = {
  scheduled: { label: 'Exit scheduled',      bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-500' },
  pending:   { label: 'Awaiting settlement', bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-500' },
  settled:   { label: 'Settled',             bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  return formatMoney(n);
}

export default function FnFDashboard() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const [pending, setPending] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | scheduled | pending | settled
  const [loadError, setLoadError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, [orgSlug, currentCompany?._id]);

  async function loadAll() {
    setLoading(true);
    setPending([]);
    setSettlements([]);
    setLoadError(null);
    try {
      const [pendingRes, settRes] = await Promise.all([
        fnfApi.getPending(orgSlug),
        fnfApi.listSettlements(orgSlug),
      ]);
      setPending(pendingRes.data || []);
      setSettlements(settRes.data || []);
    } catch (e) {
      // Without this, an auth/API failure rendered the "No separated confirmed
      // employees" empty state with zeroed stat cards — indistinguishable from
      // a genuinely empty list.
      console.error(e);
      setLoadError(e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to load F&F settlements');
    }
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
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
      <p className="text-xs text-dark-500">Loading exits and settlements…</p>
    </div>
  );

  if (loadError) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3 text-center">
      <AlertTriangle size={24} className="text-red-400" />
      <p className="text-sm text-red-400 max-w-md">{loadError}</p>
      <p className="text-xs text-dark-500 max-w-md">The list could not be loaded, so this is not an empty result.</p>
      <button onClick={loadAll} className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200 hover:bg-dark-700">Retry</button>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Calculator size={20} /> Full & Final Settlements
        </h1>
        <p className="text-sm text-dark-400 mt-0.5">
          Final dues for employees who are leaving or have left. Each settlement moves
          draft → finalized → paid.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all',       label: 'All exits',       hint: 'Everyone listed below',        value: stats.total,     color: 'text-white' },
          { key: 'scheduled', label: 'Exit scheduled',  hint: 'Still working, LWD is set',    value: stats.scheduled, color: 'text-blue-400' },
          { key: 'pending',   label: 'Awaiting settlement', hint: 'Needs your action',        value: stats.pending,   color: 'text-amber-400' },
          { key: 'settled',   label: 'Settled',         hint: 'Finalized or paid',            value: stats.settled,   color: 'text-emerald-400' },
        ].map(s => (
          <button key={s.key} onClick={() => setTab(s.key)}
            title={`Show only: ${s.label}`}
            className={`bg-dark-800/60 border rounded-xl p-3 text-left transition-colors ${
              tab === s.key ? 'border-rivvra-500/40' : 'border-dark-700/50 hover:border-dark-600'
            }`}>
            <p className="text-xs text-dark-400">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mt-1 tabular-nums`}>{s.value}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{s.hint}</p>
          </button>
        ))}
      </div>

      {/* Search — client-side over the rows already loaded */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, employee code or email…"
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500" />
        </div>
        <span className="text-xs text-dark-500">
          Showing {filtered.length} of {merged.length}
          {tab !== 'all' && ` · ${(STAGE_CONFIG[tab] || {}).label || tab} only`}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 px-6 text-dark-500">
          <Calculator size={48} className="mx-auto mb-3 opacity-30" />
          {merged.length === 0 ? (
            <>
              <p className="text-sm text-dark-300">No exits to settle</p>
              <p className="text-xs text-dark-500 mt-1 max-w-md mx-auto">
                Employees appear here once they have a last working day set or have been marked as
                separated. Their final dues — unpaid salary, leave encashment, notice recovery — are
                then settled from this page.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-dark-300">No employee matches your search or filter</p>
              <button onClick={() => { setSearch(''); setTab('all'); }} className="mt-2 text-xs text-rivvra-400 hover:text-rivvra-300">Clear search and filters</button>
            </>
          )}
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
                  <div className="flex items-center gap-3 mt-1 text-xs text-dark-500 flex-wrap">
                    <span className="capitalize">{emp.status}</span>
                    {emp.lastWorkingDate && (
                      <span className="flex items-center gap-1" title="Last working day">
                        <Calendar size={10} /> Last working day: {fmtDate(emp.lastWorkingDate)}
                      </span>
                    )}
                    {emp.separationReason && <span>{emp.separationReason}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <SettlementProgress status={emp.fnfStatus} />
                    {NEXT_ACTION[emp.fnfStatus] && (
                      <span className="text-[10px] text-amber-400/90">Next: {NEXT_ACTION[emp.fnfStatus]}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {emp.netSettlement !== undefined && emp.netSettlement !== null ? (
                    <>
                      <p className="text-[10px] text-dark-500">Net settlement</p>
                      <p className={`text-sm font-medium tabular-nums ${emp.netSettlement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtINR(emp.netSettlement)}
                      </p>
                      {emp.netSettlement < 0 && <p className="text-[10px] text-red-400/70">Recoverable from employee</p>}
                    </>
                  ) : (
                    <p className="text-xs text-dark-600" title="No settlement calculated yet">Not calculated</p>
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
