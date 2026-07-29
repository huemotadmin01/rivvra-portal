import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import { getPayrollRuns, getPayrollSettings } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  IndianRupee, Users, TrendingUp, Shield, FileText,
  Play, Lock, Eye, ChevronRight, Calendar, Globe, ArrowRight,
} from 'lucide-react';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const STATUS_COLORS = {
  draft: 'bg-dark-700 text-dark-300',
  processing: 'bg-amber-500/10 text-amber-400',
  processed: 'bg-blue-500/10 text-blue-400',
  finalized: 'bg-purple-500/10 text-purple-400',
  paid: 'bg-green-500/10 text-green-400',
};

export default function PayrollDashboardPage() {
  const { orgSlug } = usePlatform();
  const { currentCompany, companyCountry } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  // FY from period context — hook must stay above every early return
  const { fyApi: fy } = usePeriod();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Optional 'YYYY-MM' cutoff from payroll settings: runs before this month
  // are excluded from FY stat cards (months processed on a previous system,
  // e.g. GreytHR). Absent ⇒ include everything.
  const [payrollStatsFrom, setPayrollStatsFrom] = useState(null);

  const load = async () => {
    setLoading(true);
    setRuns([]);
    setLoadError(null);
    try {
      const [runsRes, settingsRes] = await Promise.all([
        getPayrollRuns(orgSlug),
        getPayrollSettings(orgSlug).catch(() => null),
      ]);
      setRuns(runsRes.runs || []);
      setPayrollStatsFrom(settingsRes?.settings?.payrollStatsFrom || null);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load payroll dashboard');
      showToast('Failed to load', 'error');
    }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  if (loadError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm text-red-400">{loadError}</p>
      <button onClick={load} className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200 hover:bg-dark-700">Retry</button>
    </div>
  );

  // India-only gate: statutory payroll (PF/ESI/PT/TDS, Form 16) only exists
  // for India entities today. Gate on COUNTRY, not currency — the backend
  // gates via isIndianCompany(company) (company address country), and an
  // India entity billing in USD must still get payroll while a non-India
  // entity holding INR must not.
  if (currentCompany && companyCountry !== 'IN') {
    return (
      <div className="flex items-center justify-center py-24 px-6">
        <div className="max-w-lg text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 border border-dark-700 flex items-center justify-center mx-auto mb-5">
            <Globe className="w-8 h-8 text-dark-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Payroll is currently available for India entities only</h2>
          <p className="text-sm text-dark-400 leading-relaxed mb-6">
            Statutory payroll (PF, ESI, Professional Tax, TDS and Form 16) is built for Indian
            companies. {currentCompany?.name ? `"${currentCompany.name}"` : 'Your active company'} is
            registered outside India, so payroll runs aren't available here yet.
            Payroll for other countries is on our roadmap.
          </p>
          <p className="text-xs text-dark-500 mb-6">
            In the meantime, Employee records, Timesheets, Attendance and Leave all work for every country.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to={`/org/${orgSlug}/employee/dashboard`} className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-lg text-sm font-medium hover:bg-rivvra-500/20 transition-colors">
              Employee app <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to={`/org/${orgSlug}/timesheet/dashboard`} className="flex items-center gap-1.5 px-4 py-2 bg-dark-800 text-dark-300 border border-dark-700 rounded-lg text-sm font-medium hover:text-white hover:border-dark-500 transition-colors">
              Timesheet app <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Latest run
  const latestRun = runs[0];
  const latestSummary = latestRun?.summary || {};

  // Recent 6 runs for timeline
  const recentRuns = runs.slice(0, 6);

  // FY stats — exclude months processed on a previous system when the org
  // has payrollStatsFrom (e.g. '2026-03') set in payroll settings.
  const statsCutoff = (() => {
    if (!payrollStatsFrom) return null;
    const [y, m] = String(payrollStatsFrom).split('-').map(Number);
    return y && m ? { y, m } : null;
  })();
  const fyRuns = runs.filter(r =>
    r.financialYear === fy &&
    ['processed', 'finalized', 'paid'].includes(r.status) &&
    (!statsCutoff || r.year > statsCutoff.y || (r.year === statsCutoff.y && r.month >= statsCutoff.m))
  );
  const fyTotalNet = fyRuns.reduce((s, r) => s + (r.summary?.totalNet || 0), 0);
  const fyTotalGross = fyRuns.reduce((s, r) => s + (r.summary?.totalGross || 0), 0);
  const fyTotalTds = fyRuns.reduce((s, r) => s + (r.summary?.totalTds || 0), 0);
  const fyTotalPf = fyRuns.reduce((s, r) => s + (r.summary?.totalPf || 0), 0);
  const fyMonthCount = fyRuns.length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Payroll Dashboard</h1>
          <p className="text-sm text-dark-400 mt-1">FY {fy} — {fyMonthCount} month{fyMonthCount !== 1 ? 's' : ''} processed on Rivvra</p>
        </div>
        <button onClick={() => navigate('/payroll/statutory-run')} className="flex items-center gap-2 px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium">
          <Play size={14} /> Run Payroll
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'FY Net Payout', value: fyTotalNet, icon: IndianRupee, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'FY Gross', value: fyTotalGross, icon: TrendingUp, color: 'text-white', bg: 'bg-dark-700' },
          { label: 'FY Total PF', value: fyTotalPf, icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'FY Total TDS', value: fyTotalTds, icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(card => (
          <div key={card.label} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${card.bg}`}><card.icon size={14} className={card.color} /></div>
              <span className="text-xs text-dark-400">{card.label}</span>
            </div>
            <div className={`text-xl font-bold ${card.color}`}>₹{fmt(card.value)}</div>
          </div>
        ))}
      </div>

      {/* Latest Run Status */}
      {latestRun && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-dark-400" />
              <div>
                <h2 className="text-white font-medium">Latest Run: {MONTHS[latestRun.month]} {latestRun.year}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[latestRun.status]}`}>{latestRun.status}</span>
                  {latestRun.payrollLocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400"><Lock size={8} className="inline mr-1" />Locked</span>}
                  {latestRun.payslipReleased && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400"><Eye size={8} className="inline mr-1" />Released</span>}
                </div>
              </div>
            </div>
            <button onClick={() => navigate('/payroll/statutory-run')} className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300">
              View Details <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Employees', value: latestSummary.totalEmployees || 0, prefix: '' },
              { label: 'Net', value: latestSummary.totalNet, prefix: '₹' },
              { label: 'Gross', value: latestSummary.totalGross, prefix: '₹' },
              { label: 'Deductions', value: latestSummary.totalDeductions, prefix: '₹' },
              { label: 'CTC', value: latestSummary.totalCtc || ((latestSummary.totalGross || 0) + (latestSummary.totalEmployerCost || 0)), prefix: '₹' },
            ].map(item => (
              <div key={item.label} className="bg-dark-900/50 rounded-lg p-3">
                <div className="text-[10px] text-dark-500 uppercase tracking-wider mb-1">{item.label}</div>
                <div className="text-sm font-semibold text-white">{item.prefix}{typeof item.value === 'number' && item.prefix ? fmt(item.value) : item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Timeline */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-700">
          <h2 className="text-sm font-medium text-dark-300">Recent Payroll Runs</h2>
        </div>
        {recentRuns.length > 0 ? (
          <div className="divide-y divide-dark-700/50">
            {recentRuns.map(run => (
              <div key={run._id} className="px-5 py-3 flex items-center justify-between hover:bg-dark-750 cursor-pointer" onClick={() => navigate('/payroll/statutory-run')}>
                <div className="flex items-center gap-4">
                  <div className="text-white font-medium text-sm w-32">{MONTHS[run.month]} {run.year}</div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status]}`}>{run.status}</span>
                  <span className="text-xs text-dark-400">{run.summary?.totalEmployees || 0} emp</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-dark-500">Net</div>
                    <div className="text-sm font-medium text-green-400">₹{fmt(run.summary?.totalNet)}</div>
                  </div>
                  <ChevronRight size={14} className="text-dark-500" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-dark-500">No payroll runs yet.</div>
        )}
      </div>
    </div>
  );
}
