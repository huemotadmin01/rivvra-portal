import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import { getPayrollRuns, getPayrollSettings } from '../../utils/payrollApi';
import { formatMoney } from '../../utils/formatCurrency';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  IndianRupee, TrendingUp, Shield, FileText,
  Play, Lock, Eye, ChevronRight, Calendar, Globe, ArrowRight,
} from 'lucide-react';
import { Button, Chip, EmptyState, PageHeader, Panel, Spinner, Stat } from '../../components/ds';

/* ============================================================================
 * PayrollDashboardPageV2 — payroll dashboard on ds (phase 7)
 * ============================================================================
 * A byte-identical copy of PayrollDashboardPage.jsx with only presentation
 * rewritten. NOTHING that produces a number was touched:
 *
 *   - every rupee figure still goes through the shared `formatMoney`, with
 *     the same argument, so grouping and paise cannot drift;
 *   - `fmtCount` stays the non-money formatter for headcount;
 *   - the FY reducers (fyTotalNet/Gross/Tds/Pf) and the `payrollStatsFrom`
 *     cutoff that excludes months processed on a previous system are
 *     character-for-character unchanged;
 *   - the India gate still tests `companyCountry !== 'IN'`, not currency —
 *     an India entity billing USD must still get payroll, and an entity
 *     outside India holding INR must not.
 *
 * The "People in run" label is left exactly as written. It counts every ROW
 * in the run — contractors paid through timesheets show ₹0, and anyone on
 * salary hold is included — so it is deliberately not called a paid
 * headcount. July 2026 read 68 rows against 30 people actually paid.
 *
 * Money parity was proven, not assumed: scripts/money-parity.js captured every
 * rendered currency string from the legacy page and from this one against the
 * same data and diffed them in order.
 * ========================================================================== */

const FONT = "'Inter', system-ui, sans-serif";
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Non-money counts only (employee headcount). Every rupee figure on this page
// goes through the shared formatMoney so paise appear consistently or not at all.
const fmtCount = (n) => Number(n || 0).toLocaleString('en-IN');

// Tone by meaning. `finalized` has no dedicated token, so it shares `info`
// with `processed` — the Chip label still distinguishes them, and inventing a
// sixth accent for one status would be worse than reusing one.
const STATUS_COLORS = {
  draft: 'neutral',
  processing: 'warn',
  processed: 'info',
  finalized: 'info',
  paid: 'brand',
};

const STATUS_LABELS = {
  draft: 'Draft',
  processing: 'Processing',
  processed: 'Processed',
  finalized: 'Finalized',
  paid: 'Paid',
};

export default function PayrollDashboardPageV2() {
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

  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
      <Spinner label="Loading payroll runs for this company…" />
    </div>
  );

  if (loadError) return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 620 }}>
      <EmptyState tone="danger" title="Couldn't load the payroll dashboard"
        actions={<Button variant="secondary" onClick={load}>Retry</Button>}>
        {loadError}
      </EmptyState>
    </div>
  );

  // India-only gate: statutory payroll (PF/ESI/PT/TDS, Form 16) only exists
  // for India entities today. Gate on COUNTRY, not currency — the backend
  // gates via isIndianCompany(company) (company address country), and an
  // India entity billing in USD must still get payroll while a non-India
  // entity holding INR must not.
  if (currentCompany && companyCountry !== 'IN') {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 640, margin: '0 auto' }}>
        <EmptyState
          icon={<Globe size={22} />}
          title="Payroll is currently available for India entities only"
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link to={`/org/${orgSlug}/employee/dashboard`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary" iconRight={<ArrowRight size={14} />}>Employee app</Button>
              </Link>
              <Link to={`/org/${orgSlug}/timesheet/dashboard`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary" iconRight={<ArrowRight size={14} />}>Timesheet app</Button>
              </Link>
            </div>
          }
        >
          Statutory payroll (PF, ESI, Professional Tax, TDS and Form 16) is built for Indian
          companies. {currentCompany?.name ? `"${currentCompany.name}"` : 'Your active company'} is
          registered outside India, so payroll runs aren't available here yet.
          Payroll for other countries is on our roadmap.
          {' '}In the meantime, Employee records, Timesheets, Attendance and Leave all work for every country.
        </EmptyState>
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
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Payroll Dashboard"
        sub={`FY ${fy} — ${fyMonthCount} month${fyMonthCount !== 1 ? 's' : ''} processed on Rivvra`}
        actions={
          <Button iconLeft={<Play size={15} />} onClick={() => navigate('/payroll/statutory-run')}>
            Run Payroll
          </Button>
        }
      />

      {/* Summary Cards — every value still rendered by formatMoney, unchanged. */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {[
          { label: 'Net paid to employees', hint: 'Take-home after all deductions', value: fyTotalNet, icon: IndianRupee, color: 'var(--brand)' },
          { label: 'Gross salary', hint: 'Before deductions', value: fyTotalGross, icon: TrendingUp, color: 'var(--fg-3)' },
          { label: 'Provident Fund (PF)', hint: 'Employee contribution deducted', value: fyTotalPf, icon: Shield, color: 'var(--info)' },
          { label: 'Tax deducted (TDS)', hint: 'Income tax withheld', value: fyTotalTds, icon: FileText, color: 'var(--warn)' },
        ].map(card => (
          <Stat
            key={card.label}
            label={card.label}
            value={formatMoney(card.value)}
            note={`${card.hint} · this FY`}
            icon={<card.icon size={14} />}
            color={card.color}
          />
        ))}
      </div>

      {/* Latest Run Status */}
      {latestRun && (
        <Panel
          icon={<Calendar size={14} />}
          title={`Latest Run: ${MONTHS[latestRun.month]} ${latestRun.year}`}
          actions={
            <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}
              onClick={() => navigate('/payroll/statutory-run')}>
              View Details
            </Button>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            <Chip tone={STATUS_COLORS[latestRun.status] || 'neutral'}>
              {STATUS_LABELS[latestRun.status] || latestRun.status}
            </Chip>
            {latestRun.payrollLocked && <Chip tone="danger"><Lock size={10} /> Locked</Chip>}
            {latestRun.payslipReleased && <Chip tone="brand"><Eye size={10} /> Released</Chip>}
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {[
              // summary.totalEmployees is items.length — every ROW in the run,
              // including contractors (whose pay comes through timesheets and
              // shows ₹0 here) and anyone on salary hold. It is NOT a paid
              // headcount: July 2026 reads 68 while 30 people were actually
              // paid. Labelled for what it counts.
              {
                label: 'People in run',
                value: fmtCount(latestSummary.totalEmployees || 0),
                hint: 'All rows processed — includes contractors and any on hold',
              },
              { label: 'Net payout', value: formatMoney(latestSummary.totalNet) },
              { label: 'Gross salary', value: formatMoney(latestSummary.totalGross) },
              { label: 'Total deductions', value: formatMoney(latestSummary.totalDeductions) },
              { label: 'Cost to company', value: formatMoney(latestSummary.totalCtc || ((latestSummary.totalGross || 0) + (latestSummary.totalEmployerCost || 0))) },
            ].map(item => (
              <div key={item.label} title={item.hint || undefined} style={{
                padding: 12, borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
              }}>
                <div style={{
                  font: `600 9.5px/1.3 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.07em',
                  color: 'var(--fg-4)', marginBottom: 6,
                }}>
                  {item.label}
                </div>
                <div style={{
                  font: `600 14px/1.35 ${FONT}`, color: 'var(--fg)', textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
                }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Run Timeline */}
      <Panel
        flush
        title="Recent Payroll Runs"
        actions={
          <span style={{
            font: `600 9.5px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.07em',
            color: 'var(--fg-4)',
          }}>
            Net payout
          </span>
        }
      >
        {recentRuns.length > 0 ? (
          <div>
            {recentRuns.map((run, i) => (
              <button
                key={run._id}
                type="button"
                onClick={() => navigate('/payroll/statutory-run')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', width: 122, flexShrink: 0 }}>
                    {MONTHS[run.month]} {run.year}
                  </span>
                  <Chip tone={STATUS_COLORS[run.status] || 'neutral'}>
                    {STATUS_LABELS[run.status] || run.status}
                  </Chip>
                  <span
                    title="Rows processed in this run — includes contractors and anyone on salary hold, so it is not a paid headcount"
                    style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}
                  >
                    {fmtCount(run.summary?.totalEmployees || 0)} in run
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{
                    font: `550 13px/1.4 ${FONT}`, color: 'var(--brand-ink)',
                    fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                  }}>
                    {formatMoney(run.summary?.totalNet)}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--fg-4)' }} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <EmptyState compact title="No payroll runs yet">
              Once you process a month, it appears here with its status and net payout.
              Use “Run Payroll” above to start the first one.
            </EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}
