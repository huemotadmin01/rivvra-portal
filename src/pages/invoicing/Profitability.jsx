// ============================================================================
// Profitability.jsx — Net Profit dashboard (org owner / super-admin only)
// ============================================================================
// GST-excluded operating profit per internal company, accrual basis, bucketed
// by month / quarter / FY. Payroll = full employer CTC (India only). Per-company
// native currency with no FX — a mixed-currency company renders one P&L block
// per currency. Backend: GET /invoicing/profitability (+ /records, /adjustments).
// Visibility is enforced server-side too; this page guards the UI as well.
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  Loader2, ArrowLeft, Lock, Info, X, TrendingUp, TrendingDown, SlidersHorizontal,
} from 'lucide-react';

const GRANULARITIES = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'fy', label: 'Financial Year' },
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Drillable component buckets and how they read on screen.
const BUCKETS = [
  { key: 'revenue', label: 'Revenue', sign: 1, drill: true },
  { key: 'creditNotes', label: 'Credit Notes', sign: -1, drill: true },
  { key: 'vendorBills', label: 'Vendor Bills', sign: -1, drill: true },
  { key: 'employeeBills', label: 'Employee Bills', sign: -1, drill: true },
  { key: 'payrollCtc', label: 'Payroll (CTC)', sign: -1, drill: true },
  { key: 'otherExpenses', label: 'Other Exp.', sign: -1, drill: false },
];

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 shadow-2xl">
      <p className="text-[11px] text-dark-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {formatCurrency(v, currency)}
      </p>
    </div>
  );
}

function KpiCard({ label, amount, currency, tone }) {
  const toneMap = {
    profit: amount >= 0
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : 'bg-red-500/10 text-red-400 border-red-500/20',
    revenue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cost: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <div className={`rounded-xl border p-5 ${toneMap[tone] || toneMap.revenue}`}>
      <span className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</span>
      <p className="text-2xl font-bold mt-2">{formatCurrency(amount, currency)}</p>
    </div>
  );
}

// One P&L block for a single currency: KPIs + net-profit chart + breakdown table.
function CurrencyBlock({ currency, series, total, onDrill }) {
  const netRevenue = total.revenue - total.creditNotes;
  const totalCosts = total.vendorBills + total.employeeBills + total.payrollCtc + total.otherExpenses;
  const chartData = series.map((s) => {
    const c = s.byCurrency.find((x) => x.currency === currency) || {};
    return { name: s.label, net: c.netProfit || 0 };
  });

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">{currency}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Net Profit" amount={total.netProfit} currency={currency} tone="profit" />
        <KpiCard label="Revenue (net of credit notes)" amount={netRevenue} currency={currency} tone="revenue" />
        <KpiCard label="Total Costs" amount={totalCosts} currency={currency} tone="cost" />
      </div>

      {/* Net profit trend */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Net Profit by period</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={48}
              tickFormatter={(v) => Intl.NumberFormat('en', { notation: 'compact' }).format(v)} />
            <ReferenceLine y={0} stroke="#374151" />
            <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="net" radius={[6, 6, 0, 0]} maxBarSize={42}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown table */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-dark-300 border-b border-dark-700">
              <th className="px-4 py-3 font-medium sticky left-0 bg-dark-850">Period</th>
              {BUCKETS.map((b) => (
                <th key={b.key} className="px-4 py-3 font-medium text-right whitespace-nowrap">{b.label}</th>
              ))}
              <th className="px-4 py-3 font-medium text-right">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const c = s.byCurrency.find((x) => x.currency === currency) || {};
              return (
                <tr key={s.period} className="border-b border-dark-700/50 hover:bg-dark-800/40 transition-colors">
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap sticky left-0 bg-dark-850">{s.label}</td>
                  {BUCKETS.map((b) => {
                    const val = c[b.key] || 0;
                    const display = formatCurrency(val, currency);
                    return (
                      <td key={b.key} className="px-4 py-3 text-right whitespace-nowrap">
                        {b.drill && val !== 0 ? (
                          <button
                            onClick={() => onDrill({ period: s.period, label: s.label, bucket: b.key, bucketLabel: b.label, currency })}
                            className="text-dark-200 hover:text-rivvra-400 hover:underline underline-offset-2"
                          >
                            {b.sign < 0 ? `(${display})` : display}
                          </button>
                        ) : (
                          <span className="text-dark-400">{b.sign < 0 && val !== 0 ? `(${display})` : display}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${(c.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(c.netProfit || 0, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-dark-800/60 font-semibold">
              <td className="px-4 py-3 text-white sticky left-0 bg-dark-800/60">Total</td>
              {BUCKETS.map((b) => (
                <td key={b.key} className="px-4 py-3 text-right text-dark-200 whitespace-nowrap">
                  {b.sign < 0 && (total[b.key] || 0) !== 0
                    ? `(${formatCurrency(total[b.key] || 0, currency)})`
                    : formatCurrency(total[b.key] || 0, currency)}
                </td>
              ))}
              <td className={`px-4 py-3 text-right ${total.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(total.netProfit, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Drill-down: the records behind one cell.
function DrillModal({ orgSlug, ctx, granularity, fy, onClose }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    invoicingApi.getProfitabilityRecords(orgSlug, {
      granularity, fy, period: ctx.period, bucket: ctx.bucket, currency: ctx.currency,
    })
      .then((res) => { if (alive) setRecords(res.data?.records || []); })
      .catch((err) => { if (alive) setError(err.message || 'Failed to load records'); });
    return () => { alive = false; };
  }, [orgSlug, granularity, fy, ctx.period, ctx.bucket, ctx.currency]);

  const sum = (records || []).reduce((a, r) => a + (r.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold text-white">{ctx.bucketLabel}</h3>
            <p className="text-xs text-dark-400 mt-0.5">{ctx.label} · {ctx.currency}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && <div className="p-5 text-red-400 text-sm">{error}</div>}
          {!error && records === null && (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-rivvra-400 animate-spin" /></div>
          )}
          {records && records.length === 0 && <div className="p-8 text-center text-dark-500 text-sm">No records</div>}
          {records && records.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-dark-700/50">
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{r.label}</p>
                      {r.sublabel && <p className="text-xs text-dark-400">{r.sublabel}</p>}
                    </td>
                    <td className="px-5 py-3 text-right text-dark-400 whitespace-nowrap">
                      {r.date ? new Date(r.date).toLocaleDateString() : ''}
                    </td>
                    <td className="px-5 py-3 text-right text-dark-200 font-medium whitespace-nowrap">
                      {formatCurrency(r.amount, r.currency || ctx.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-4 border-t border-dark-700 flex justify-between text-sm">
          <span className="text-dark-400">{records?.length || 0} record{(records?.length || 0) !== 1 ? 's' : ''}</span>
          <span className="text-white font-semibold">{formatCurrency(sum, ctx.currency)}</span>
        </div>
      </div>
    </div>
  );
}

// Manual "other expenses" editor — one amount per month for the primary currency.
function AdjustmentsModal({ orgSlug, fy, currency, months, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoicingApi.getProfitAdjustments(orgSlug, { fy })
      .then((res) => {
        const map = {};
        (res.data || []).forEach((r) => {
          if (r.currency === currency) map[`${r.year}-${r.month}`] = String(r.amount);
        });
        setValues(map);
      })
      .finally(() => setLoading(false));
  }, [orgSlug, fy, currency]);

  const save = async () => {
    setSaving(true);
    try {
      for (const mo of months) {
        const k = `${mo.year}-${mo.month}`;
        const raw = values[k];
        if (raw === undefined || raw === '') continue;
        const amount = Number(raw);
        if (!Number.isFinite(amount)) continue;
        await invoicingApi.saveProfitAdjustment(orgSlug, { year: mo.year, month: mo.month, currency, amount, note: '' });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold text-white">Other expenses ({currency})</h3>
            <p className="text-xs text-dark-400 mt-0.5">Manual monthly costs not entered as bills (SaaS, bank fees, taxes paid…)</p>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-rivvra-400 animate-spin" /></div>
          ) : months.map((mo) => {
            const k = `${mo.year}-${mo.month}`;
            return (
              <div key={k} className="flex items-center gap-3">
                <label className="text-sm text-dark-300 w-28">{MONTH_ABBR[mo.month - 1]} {mo.year}</label>
                <input
                  type="number"
                  value={values[k] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  placeholder="0"
                  className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 outline-none"
                />
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-dark-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-dark-300 hover:text-white text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-rivvra-500 text-dark-950 font-medium text-sm hover:bg-rivvra-400 disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Profitability() {
  const navigate = useNavigate();
  const { currentOrg, isOrgOwner } = useOrg();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;
  const allowed = isOrgOwner || user?.superAdmin;

  const [granularity, setGranularity] = useState('month');
  const [fy, setFy] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drill, setDrill] = useState(null);
  const [showAdj, setShowAdj] = useState(false);

  const load = useCallback(() => {
    if (!orgSlug || !allowed) return;
    setLoading(true);
    setError(null);
    invoicingApi.getProfitability(orgSlug, { granularity, fy: fy || undefined })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load profitability'))
      .finally(() => setLoading(false));
  }, [orgSlug, allowed, granularity, fy, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Owner access only</h1>
          <p className="text-dark-400 text-sm mt-2">Net profit is restricted to the organization owner.</p>
        </div>
      </div>
    );
  }

  // FY months (for the adjustments editor): derive from the current FY series'
  // month labels when available, else fall back to a 12-month window.
  const fyMonths = (() => {
    if (!data) return [];
    const startYear = parseInt(String(data.fy).slice(0, 4), 10);
    const fiscal = data.company?.fyType === 'fiscal';
    const out = [];
    let y = startYear, m = fiscal ? 4 : 1;
    for (let i = 0; i < 12; i++) {
      out.push({ year: y, month: m });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return out;
  })();

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-300 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Profitability</h1>
              <p className="text-dark-300 text-sm mt-0.5">
                Net profit (GST-excluded, accrual) for {data?.company?.name || currentCompany?.name || 'this company'}
              </p>
              <p className="text-dark-500 text-xs mt-1 max-w-2xl">
                Revenue is GST-excluded and recognised by <span className="text-dark-300">service period</span> (each line's
                service month), not invoice date — so totals won't match the Customer Invoices list, which is by invoice
                date and GST-inclusive.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAdj(true)}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-200 hover:text-white text-sm"
          >
            <SlidersHorizontal size={15} /> Other expenses
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-dark-850 border border-dark-700 rounded-lg p-1">
            {GRANULARITIES.map((g) => (
              <button key={g.key} onClick={() => setGranularity(g.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${granularity === g.key ? 'bg-rivvra-500 text-dark-950' : 'text-dark-300 hover:text-white'}`}>
                {g.label}
              </button>
            ))}
          </div>
          {data?.fyOptions?.length > 0 && (
            <select value={fy || data.fy} onChange={(e) => setFy(e.target.value)}
              className="bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 outline-none">
              {data.fyOptions.map((f) => (
                <option key={f} value={f}>{data.company?.fyType === 'fiscal' ? `FY ${f}` : f}</option>
              ))}
            </select>
          )}
        </div>

        {/* Non-India banner */}
        {data && data.company && !data.company.payrollIncluded && (
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-blue-300 text-sm">
            <Info size={18} className="flex-shrink-0 mt-0.5" />
            <span>This company is outside India, so payroll/labor cost is not included in net profit. Figures reflect revenue, vendor &amp; employee bills, and any manual other-expenses only.</span>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-rivvra-400 animate-spin" /></div>
        )}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">{error}</div>
        )}

        {!loading && !error && data && (
          data.totals?.length > 0 ? (
            <div className="space-y-10">
              {data.currencies.map((cur) => (
                <CurrencyBlock
                  key={cur}
                  currency={cur}
                  series={data.series}
                  total={data.totals.find((t) => t.currency === cur) || {}}
                  onDrill={setDrill}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-dark-500">
              <TrendingDown size={48} className="mb-3 opacity-40" />
              <p className="text-base font-medium text-dark-400">No finalized activity for this period</p>
            </div>
          )
        )}
      </div>

      {drill && (
        <DrillModal orgSlug={orgSlug} ctx={drill} granularity={granularity} fy={fy || data?.fy} onClose={() => setDrill(null)} />
      )}
      {showAdj && data && (
        <AdjustmentsModal
          orgSlug={orgSlug}
          fy={fy || data.fy}
          currency={data.primaryCurrency}
          months={fyMonths}
          onClose={() => setShowAdj(false)}
          onSaved={() => { setShowAdj(false); load(); }}
        />
      )}
    </div>
  );
}
