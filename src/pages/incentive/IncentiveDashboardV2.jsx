// ============================================================================
// IncentiveDashboardV2.jsx — Admin dashboard (totals, trend, leaderboard),
// on ds (phase 7)
// ============================================================================
// Byte-identical copy with only presentation rewritten.
//
// Money on this page now prints through the shared `formatMoney`, taking its
// currency from the ACTIVE COMPANY (phase 13, on request). The local
// `formatINR` it replaces hard-coded INR and pinned maximumFractionDigits to
// 0, so it both mislabelled non-INR companies and dropped paise.
//
// Why the company and not the record: this page shows AGGREGATES, and the
// /incentive/summary payload carries no currency at all — only bare numbers.
// The dashboard is company-scoped, so the active company's currency is the
// only correct source available to it. Per-record screens (RecordsList,
// RecordDetail, MyEarnings) should pass `record.currency` instead, which is
// what utils/formatCurrency's header means by "pass the record's own
// currency field" — see the note in REDESIGN.md.
//
// Two consequences, both intended:
//   • a USD or CAD company no longer sees its incentives labelled with ₹
//   • paise now print when a figure has them, so the number on screen equals
//     the number stored, and the list agrees with RecordDetail (which was
//     already showing 2dp)
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import IncentiveNotificationsBanner from '../../components/incentive/IncentiveNotificationsBanner';
import MonthPicker from '../../components/incentive/MonthPicker';
import {
  TrendingUp, CheckCircle2, Clock, FileText, Users, Hourglass,
  AlertTriangle,
} from 'lucide-react';
import { Button, Chip, EmptyState, Field, Input, Modal, Panel, Spinner, Stat } from '../../components/ds';
import { formatMoney } from '../../utils/formatCurrency';

// Legacy passed Tailwind tint classes; map them to semantic tokens so the
// tiles theme. Unrecognised values fall back to muted ink rather than
// rendering an un-tinted tile.
const STAT_TONES = {
  'bg-emerald-500/10 text-emerald-400': 'var(--brand)',
  'bg-blue-500/10 text-blue-400': 'var(--info)',
  'bg-amber-500/10 text-amber-400': 'var(--warn)',
  'bg-purple-500/10 text-purple-400': 'var(--a-ats)',
  'bg-red-500/10 text-red-400': 'var(--danger)',
};

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <Stat
      label={label}
      value={value}
      note={sub}
      icon={<Icon size={14} />}
      color={STAT_TONES[color] || 'var(--fg-3)'}
    />
  );
}

export default function IncentiveDashboardV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  // Company-scoped page, company-scoped currency. Falls back to INR only when
  // the company has none set, which preserves the previous behaviour exactly.
  const money = (amount) => formatMoney(amount, currentCompany?.currency || 'INR');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [waiting, setWaiting] = useState({ count: 0, groups: [], otherIssues: null });
  // "Create anyway" — the consultant is on hold and a decision has been made not
  // to wait for payroll that may never come.
  const [createTarget, setCreateTarget] = useState(null);
  const [createSalary, setCreateSalary] = useState('');
  const [creatingKey, setCreatingKey] = useState(null);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [waitingError, setWaitingError] = useState(false);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, month]);

  async function load() {
    setLoading(true);
    setData(null);
    setWaiting({ count: 0, groups: [] });
    setWaitingError(false);
    try {
      // The "waiting on payroll" widget is non-critical — its failure shouldn't
      // blank the whole dashboard. We swallow the rejection here, surface a
      // toast + a stale-data badge, and let the rest of the page render.
      const waitingPromise = incentiveApi
        .getWaitingOnPayroll(orgSlug)
        .then((res) => ({ ok: true, res }))
        .catch((err) => ({ ok: false, err }));

      const [summary, waitingOutcome] = await Promise.all([
        incentiveApi.getSummary(orgSlug, {
          scope: 'admin',
          month: month || undefined,
        }),
        waitingPromise,
      ]);
      setData(summary || null);
      if (waitingOutcome.ok && waitingOutcome.res?.success) {
        setWaiting({
          count: waitingOutcome.res.count || 0,
          groups: waitingOutcome.res.groups || [],
        });
        setWaitingError(false);
      } else if (!waitingOutcome.ok) {
        console.error('Waiting-on-payroll widget failed', waitingOutcome.err);
        setWaitingError(true);
        showToast(
          'Couldn’t load the “waiting on payroll” widget. Other dashboard data is fresh.',
          'warning',
        );
      }
    } catch (e) {
      console.error('Failed to load dashboard', e);
      showToast(e?.message || 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading incentive dashboard…" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const trend = data?.trend || [];
  const leaderboard = data?.leaderboard || [];
  const byClient = data?.byClient || [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.amount || 0));

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incentive Dashboard</h1>
          <p className="text-sm text-dark-400 mt-1">
            Org-wide commission tracking for Recruiters & Account Managers
          </p>
        </div>
        <div className="flex gap-2">
          <MonthPicker
            value={month}
            onChange={setMonth}
            placeholder="Current month"
          />
        </div>
      </div>

      <IncentiveNotificationsBanner />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Paid"
          value={money(stats.paid?.amount)}
          sub={`${stats.paid?.count || 0} records`}
          icon={CheckCircle2}
          color="bg-emerald-950 text-emerald-400"
        />
        <StatCard
          label="Approved (pending payout)"
          value={money(stats.approved?.amount)}
          sub={`${stats.approved?.count || 0} records`}
          icon={Clock}
          color="bg-blue-950 text-blue-400"
        />
        <StatCard
          label="Draft"
          value={money(stats.draft?.amount)}
          sub={`${stats.draft?.count || 0} records`}
          icon={FileText}
          color="bg-dark-800 text-dark-300"
        />
        <StatCard
          label={month ? 'Forecast (this month)' : 'YTD Paid'}
          value={money(month ? stats.forecast?.amount : data?.ytd?.amount)}
          sub={month ? 'Approved + draft for this month' : 'Calendar YTD'}
          icon={TrendingUp}
          color="bg-fuchsia-950 text-fuchsia-400"
        />
      </div>

      <WaitingOnPayrollCard
          money={money}
        count={waiting.count}
        groups={waiting.groups}
        open={waitingOpen}
        onToggle={() => setWaitingOpen((v) => !v)}
        error={waitingError}
        onRetry={load}
        otherIssues={waiting.otherIssues}
        creatingKey={creatingKey}
        onCreateAnyway={(g) => {
          setCreateTarget(g);
          // Default to the salary payroll computed and then withheld. It is
          // knowable, and it keeps the incentive from swinging on whether the
          // consultant was eventually paid. ₹0 stays one keystroke away.
          setCreateSalary(g.heldSalary != null ? String(g.heldSalary) : '');
        }}
      />

      {createTarget && (
        <CreateAnywayModal
          group={createTarget}
          salary={createSalary}
          onSalary={setCreateSalary}
          busy={!!creatingKey}
          money={money}
          onCancel={() => { setCreateTarget(null); setCreateSalary(''); }}
          onConfirm={async () => {
            const g = createTarget;
            const key = `${g.consultantEmployeeId}|${g.serviceMonth}`;
            setCreatingKey(key);
            try {
              await incentiveApi.createWithSalary(orgSlug, {
                invoiceId: (g.invoiceIds || [])[0],
                consultantEmployeeId: g.consultantEmployeeId,
                serviceMonth: g.serviceMonth,
                consultantSalarySnapshot: Number(createSalary),
              });
              showToast('Incentive draft created');
              setCreateTarget(null);
              setCreateSalary('');
              load();
            } catch (err) {
              showToast(err?.message || 'Could not create the draft', 'error');
            } finally {
              setCreatingKey(null);
            }
          }}
        />
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            12-Month Trend (paid + approved)
          </h2>
          {trend.length === 0 ? (
            <p className="text-sm text-dark-400">No data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {trend.map((t) => (
                <div
                  key={t.month}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${t.month}: ${money(t.amount)}`}
                >
                  <div
                    className="w-full bg-fuchsia-600 rounded-t"
                    style={{
                      height: `${((t.amount || 0) / maxTrend) * 100}%`,
                      minHeight: '2px',
                    }}
                  />
                  <span className="text-[10px] text-dark-500 -rotate-45 origin-top-left translate-y-2">
                    {t.month?.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={16} /> Top Earners
          </h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-dark-400">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {leaderboard.slice(0, 8).map((e, i) => (
                <li
                  key={e.employeeId || i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-dark-300">
                    {i + 1}. {e.name || '—'}
                  </span>
                  <span className="font-semibold text-white">
                    {money(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {byClient.length > 0 && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            By Client
          </h2>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-dark-400 text-xs uppercase">
              <tr>
                <th className="text-left px-2 py-1 font-medium">Client</th>
                <th className="text-right px-2 py-1 font-medium">Records</th>
                <th className="text-right px-2 py-1 font-medium">Net Profit</th>
                <th className="text-right px-2 py-1 font-medium">Incentive</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map((c) => (
                <tr key={c.clientName} className="border-t border-dark-800">
                  <td className="px-2 py-2 text-white">{c.clientName}</td>
                  <td className="px-2 py-2 text-right text-dark-300">{c.count}</td>
                  <td className="px-2 py-2 text-right text-dark-300">
                    {money(c.netProfit)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-white">
                    {money(c.incentive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

// `money` is passed in: this component sits at module scope and cannot see
// the page's company-scoped formatter. Threading it keeps one currency
// source for the whole page.
// Creating a draft the salary gate skipped.
//
// The whole point is that the cost basis is a DECISION, not a default, so the
// modal states both readings plainly rather than quietly picking one:
//   • the salary payroll computed and withheld — margin as originally intended,
//     and it does not move if the consultant is eventually paid after all
//   • ₹0 — we are never paying them, so the full invoice is margin and the
//     incentive comes out larger
//
// `valid` is spliced verbatim. `salary !== ''` before Number.isFinite is what
// stops an empty box being read as 0 — the difference between "no decision
// yet" and "we are paying them nothing", which are opposite answers here.
function CreateAnywayModal({ group, salary, onSalary, busy, money, onCancel, onConfirm }) {
  const held = group.heldSalary;
  const n = Number(salary);
  const valid = salary !== '' && Number.isFinite(n) && n >= 0;
  return (
    <Modal
      open
      onClose={busy ? undefined : onCancel}
      size="sm"
      tone="warn"
      icon={<AlertTriangle size={16} />}
      title="Create incentive draft"
      sub={`${group.consultantName || 'Consultant'} · ${group.serviceMonth}${(group.invoiceNumbers || []).length > 0 ? ` · ${group.invoiceNumbers.join(', ')}` : ''}`}
      footer={(
        <>
          <Button variant="ghost" block onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button block onClick={onConfirm} disabled={busy || !valid}>
            {busy ? 'Creating…' : 'Create draft'}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
          This consultant&apos;s salary is on hold, so no draft was created. Choose the
          cost basis to calculate margin from — it decides what the recruiter and
          account manager earn.
        </p>

        <Field label="Consultant cost for this month" htmlFor="inc-cost">
          <Input
            id="inc-cost"
            type="number"
            min="0"
            value={salary}
            onChange={(e) => onSalary(e.target.value)}
            placeholder="0"
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {held != null && (
            <Button variant="secondary" size="sm" onClick={() => onSalary(String(held))}>
              Use held salary ({money ? money(held) : `₹${Math.round(held).toLocaleString('en-IN')}`})
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onSalary('0')}>
            Not paying — ₹0
          </Button>
        </div>

        <p style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
          ₹0 treats the full invoice as margin, so the incentive comes out higher.
          The held figure keeps it as originally intended, and stays correct if
          you end up paying them later.
        </p>
      </div>
    </Modal>
  );
}

function WaitingOnPayrollCard({ count, groups, open, onToggle, error, onRetry, money, onCreateAnyway, creatingKey, otherIssues }) {
  if (error) {
    return (
      <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-900/40 text-red-300">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Waiting-on-payroll widget unavailable
            </p>
            <p className="text-xs text-dark-400 mt-0.5">
              We couldn&apos;t fetch the payroll-wait queue. The rest of the
              dashboard is current.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-xs text-dark-200"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!count) return null;
  return (
    <div className="bg-amber-950/30 border border-amber-900/40 rounded-xl p-5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-900/40 text-amber-300">
            <Hourglass size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Waiting on payroll
              <span className="ml-2 text-2xl font-bold text-amber-300">{count}</span>
            </p>
            <p className="text-xs text-dark-400 mt-0.5">
              Paid invoices waiting for the consultant&apos;s payslip to release.
              Drafts auto-create once payroll is marked paid.
            </p>
          </div>
        </div>
        <span className="text-xs text-amber-300">{open ? 'Hide' : 'Show details'}</span>
      </button>
      {open && groups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-amber-900/40">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-dark-400 text-xs uppercase bg-dark-900/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Consultant</th>
                <th className="text-left px-3 py-2 font-medium">Service Month</th>
                <th className="text-left px-3 py-2 font-medium">Invoices</th>
                <th className="text-right px-3 py-2 font-medium">Value</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-right px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={`${g.consultantEmployeeId}|${g.serviceMonth}`}
                  className="border-t border-amber-900/30"
                >
                  <td className="px-3 py-2 text-white">{g.consultantName || '—'}</td>
                  <td className="px-3 py-2 text-dark-300">{g.serviceMonth}</td>
                  <td className="px-3 py-2 text-dark-300">
                    {(g.invoiceNumbers || []).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-dark-300">
                    {money(g.untaxedInvoicedValue)}
                  </td>
                  <td className="px-3 py-2 text-amber-300">
                    {g.reason === 'salary_hold'
                      ? 'Salary on hold'
                      : 'Payslip not released'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* Only for a hold. "Payslip not released" resolves itself
                        when payroll runs, and overriding it would pre-empt a
                        figure that is about to arrive on its own. */}
                    {(g.reason === 'salary_hold' || g.reason === 'salary_on_hold') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onCreateAnyway(g)}
                        disabled={!!creatingKey}
                        title="Create the incentive draft now, using a cost basis you choose"
                      >
                        {creatingKey === `${g.consultantEmployeeId}|${g.serviceMonth}`
                          ? 'Creating…' : 'Create anyway'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Reasons the ledger sees that the old live scan never could — a line
          with no consultant, unusable service dates. Real, but a different job:
          someone fixes an invoice, nobody picks a salary basis. Kept as a count
          so they cannot bury the rows that need a decision. */}
      {open && otherIssues?.count > 0 && (
        <p style={{ marginTop: 12, font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
          Also {otherIssues.count} invoice line{otherIssues.count === 1 ? '' : 's'} with a data problem
          {Object.entries(otherIssues.byReason || {}).length > 0 && ' — '}
          {Object.entries(otherIssues.byReason || {})
            .map(([reason, n]) => `${n} ${reason.replace(/_/g, ' ')}`)
            .join(', ')}
          . These need the invoice fixed, not a salary decision.
        </p>
      )}
    </div>
  );
}
