// ============================================================================
// IncentiveDashboard.jsx — Admin dashboard (totals, trend, leaderboard)
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
  Loader2, TrendingUp, CheckCircle2, Clock, FileText, Users, Hourglass,
  AlertTriangle,
} from 'lucide-react';

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-dark-900 rounded-xl p-5 border border-dark-800">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-dark-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function IncentiveDashboard() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [waiting, setWaiting] = useState({ count: 0, groups: [], otherIssues: null });
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [waitingError, setWaitingError] = useState(false);
  // "Create anyway" — the consultant is on hold and a decision has been made not
  // to wait for payroll that may never come.
  const [createTarget, setCreateTarget] = useState(null);
  const [createSalary, setCreateSalary] = useState('');
  const [creatingKey, setCreatingKey] = useState(null);

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
          otherIssues: waitingOutcome.res.otherIssues || null,
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
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
          value={formatINR(stats.paid?.amount)}
          sub={`${stats.paid?.count || 0} records`}
          icon={CheckCircle2}
          color="bg-emerald-950 text-emerald-400"
        />
        <StatCard
          label="Approved (pending payout)"
          value={formatINR(stats.approved?.amount)}
          sub={`${stats.approved?.count || 0} records`}
          icon={Clock}
          color="bg-blue-950 text-blue-400"
        />
        <StatCard
          label="Draft"
          value={formatINR(stats.draft?.amount)}
          sub={`${stats.draft?.count || 0} records`}
          icon={FileText}
          color="bg-dark-800 text-dark-300"
        />
        <StatCard
          label={month ? 'Forecast (this month)' : 'YTD Paid'}
          value={formatINR(month ? stats.forecast?.amount : data?.ytd?.amount)}
          sub={month ? 'Approved + draft for this month' : 'Calendar YTD'}
          icon={TrendingUp}
          color="bg-fuchsia-950 text-fuchsia-400"
        />
      </div>

      <WaitingOnPayrollCard
        count={waiting.count}
        groups={waiting.groups}
        otherIssues={waiting.otherIssues}
        open={waitingOpen}
        onToggle={() => setWaitingOpen((v) => !v)}
        error={waitingError}
        onRetry={load}
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
                  title={`${t.month}: ${formatINR(t.amount)}`}
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
                    {formatINR(e.amount)}
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
                    {formatINR(c.netProfit)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-white">
                    {formatINR(c.incentive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {/* Data problems the ledger now sees but this widget never could: a line
          with no consultant, unusable service dates. Real, but a different job
          — kept as a count so they cannot bury the rows needing a decision. */}
      {open && otherIssues?.count > 0 && (
        <p className="mt-3 text-xs text-dark-400">
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

function WaitingOnPayrollCard({ count, groups, open, onToggle, error, onRetry, onCreateAnyway, creatingKey, otherIssues }) {
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
                <th className="text-right px-3 py-2 font-medium"></th>
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
                    {formatINR(g.untaxedInvoicedValue)}
                  </td>
                  <td className="px-3 py-2 text-amber-300">
                    {g.reason === 'salary_hold' || g.reason === 'salary_on_hold'
                      ? 'Salary on hold'
                      : 'Payslip not released'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* Only for a hold. "Payslip not released" resolves itself
                        when payroll runs, and overriding it would pre-empt a
                        figure that is about to arrive on its own. */}
                    {(g.reason === 'salary_hold' || g.reason === 'salary_on_hold') && (
                      <button
                        type="button"
                        onClick={() => onCreateAnyway(g)}
                        disabled={!!creatingKey}
                        className="px-2.5 py-1 rounded-lg text-xs border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                        title="Create the incentive draft now, using a cost basis you choose"
                      >
                        {creatingKey === `${g.consultantEmployeeId}|${g.serviceMonth}`
                          ? 'Creating…' : 'Create anyway'}
                      </button>
                    )}
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

// Creating a draft the salary gate skipped.
//
// The whole point is that the cost basis is a DECISION, not a default, so the
// modal states both readings plainly rather than quietly picking one:
//   • the salary payroll computed and withheld — margin as originally intended,
//     and it does not move if the consultant is eventually paid after all
//   • ₹0 — we are never paying them, so the full invoice is margin and the
//     incentive comes out larger
function CreateAnywayModal({ group, salary, onSalary, busy, onCancel, onConfirm }) {
  const held = group.heldSalary;
  const n = Number(salary);
  const valid = salary !== '' && Number.isFinite(n) && n >= 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !busy && onCancel()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white">Create incentive draft</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              {group.consultantName || 'Consultant'} · {group.serviceMonth}
              {(group.invoiceNumbers || []).length > 0 && ` · ${group.invoiceNumbers.join(', ')}`}
            </p>
          </div>

          <p className="text-sm text-dark-300">
            This consultant&apos;s salary is on hold, so no draft was created. Choose the
            cost basis to calculate margin from — it decides what the recruiter and
            account manager earn.
          </p>

          <div>
            <label className="block text-xs text-dark-400 mb-1">Consultant cost for this month</label>
            <input
              type="number"
              min="0"
              value={salary}
              onChange={(e) => onSalary(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm"
              placeholder="0"
            />
            <div className="flex gap-2 mt-2">
              {held != null && (
                <button type="button" onClick={() => onSalary(String(held))}
                  className="px-2 py-1 rounded-lg text-[11px] border border-dark-600 text-dark-300 hover:bg-dark-700">
                  Use held salary (₹{Math.round(held).toLocaleString('en-IN')})
                </button>
              )}
              <button type="button" onClick={() => onSalary('0')}
                className="px-2 py-1 rounded-lg text-[11px] border border-dark-600 text-dark-300 hover:bg-dark-700">
                Not paying — ₹0
              </button>
            </div>
            <p className="text-[11px] text-dark-500 mt-2">
              ₹0 treats the full invoice as margin, so the incentive comes out higher.
              The held figure keeps it as originally intended, and stays correct if
              you end up paying them later.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={onCancel} disabled={busy}
              className="flex-1 px-3 py-2 border border-dark-600 rounded-lg text-sm text-dark-300 hover:bg-dark-700 disabled:opacity-50">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={busy || !valid}
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-rivvra-600 text-white hover:bg-rivvra-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
