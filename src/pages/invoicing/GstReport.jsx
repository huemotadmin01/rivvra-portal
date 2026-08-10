// ============================================================================
// GstReport.jsx — GST Report for Indian companies (replaces the flat Tax
// Report when the active company bills in INR). Monthly rows with quarter/FY
// rollups: output GST, ITC (books vs 2B-matched), net payable, filing status
// chips (GSTR-1 / GSTR-3B) and admin-recorded filing entries with challan.
// Backend: GET /invoicing/statutory/gst-report, POST/DELETE .../filings.
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import StatutoryFilingModal from '../../components/invoicing/StatutoryFilingModal';
import StatutoryRecordsModal from '../../components/invoicing/StatutoryRecordsModal';
import { TermHint, HowToRead } from '../../components/invoicing/TermHint';
import { Loader2, ArrowLeft, Receipt, Info, Columns3, Download, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GRANULARITIES = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'fy', label: 'Financial Year' },
];

function monthLabel(row) { return `${MONTH_ABBR[row.month - 1]} ${row.year}`; }

export function StatusChip({ status, due, note }) {
  const map = {
    filed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    overdue: 'bg-red-500/10 text-red-400 border-red-500/20',
    none: 'bg-dark-800 text-dark-500 border-dark-700',
  };
  const label = { filed: 'Filed', pending: 'Pending', overdue: 'Overdue', none: '—' }[status] || status;
  const title = note || (due && status !== 'filed' ? `Due ${new Date(due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : undefined);
  return (
    <span title={title} className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-medium ${map[status] || map.none}`}>
      {label}
    </span>
  );
}

// Tooltip text for a chip backed by the GST portal's public filing data.
function gstnNote(gstnRow) {
  if (!gstnRow?.dof) return undefined;
  const d = new Date(gstnRow.dof).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Filed per GSTN on ${d}${gstnRow.arn ? ` · ARN ${gstnRow.arn}` : ''} — click to add challan details`;
}

function Kpi({ label, amount, tone = 'blue', hint }) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <span className="text-[11px] font-medium opacity-70 uppercase tracking-wider">{label}</span>
      <p className="text-xl font-bold mt-1.5">{formatCurrency(amount, 'INR')}</p>
      {hint && <p className="text-[11px] opacity-60 mt-1">{hint}</p>}
    </div>
  );
}

export default function GstReport() {
  const navigate = useNavigate();
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('invoicing') === 'admin';

  const [granularity, setGranularity] = useState('month');
  const [fy, setFy] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSplit, setShowSplit] = useState(false);
  const [filingModal, setFilingModal] = useState(null); // { kind, year, month, existing, suggestedAmount }
  const [exportingKey, setExportingKey] = useState(null); // month key being exported
  const [drill, setDrill] = useState(null); // { bucket, monthKey, title, subtitle }
  const { showToast } = useToast();

  const DRILL_TITLES = {
    output: 'Output GST — taxed sales', exports: 'Exports / zero-rated turnover',
    itc: 'ITC (books) — vendor bills', itc2b: 'ITC matched in 2B',
    itcgap: 'Booked but not matched in 2B',
    itcunbooked: 'In 2B but not in your books',
  };
  const openDrill = (bucket, row) => setDrill({
    bucket, monthKey: row.key,
    title: DRILL_TITLES[bucket], subtitle: `${monthLabel(row)} · INR`,
  });
  // Drillable amount cell: underlines on hover, keyboard-accessible.
  const drillCls = 'underline decoration-dotted decoration-dark-500 underline-offset-4 hover:decoration-current cursor-pointer';

  const exportGstr1 = async (row) => {
    const key = row.key;
    setExportingKey(key);
    try {
      await invoicingApi.downloadStatutoryCsv(orgSlug, 'gstr1', { month: key }, `GSTR1_${key}.csv`);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setExportingKey(null);
    }
  };

  // Drop stale responses: switching granularity/FY mid-flight must not let an
  // older (slower) request's data render under the newer selection.
  const seqRef = useRef(0);
  const [syncing, setSyncing] = useState(false);
  const lastLoadedAtRef = useRef(0);
  const load = useCallback((refreshGstn = false, { silent = false } = {}) => {
    if (!orgSlug) return;
    const seq = ++seqRef.current;
    lastLoadedAtRef.current = Date.now();
    if (refreshGstn) setSyncing(true); else if (!silent) setLoading(true);
    setError(null);
    invoicingApi.getGstReport(orgSlug, { fy: fy || undefined, granularity, ...(refreshGstn ? { refreshGstn: 1 } : {}) })
      .then((res) => { if (seq === seqRef.current) setData(res.data); })
      .catch((err) => { if (seq === seqRef.current && !silent) setError(err.message || 'Failed to load GST report'); })
      .finally(() => { if (seq === seqRef.current) { setLoading(false); setSyncing(false); } });
  }, [orgSlug, fy, granularity, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  // The figures change as bills/payments are booked in other tabs, so refetch
  // (silently — no spinner over the current numbers) when this tab regains
  // focus. Throttled: rapid alt-tabbing must not stack report recomputes on
  // the shared cluster.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadedAtRef.current < 15000) return;
      load(false, { silent: true });
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const months = data?.months || [];
  const quarters = data?.quarters || [];
  const totals = data?.totals || {};
  const rows = granularity === 'month' ? months : granularity === 'quarter' ? quarters : [];

  const openFiling = (kind, row) => {
    if (!isAdmin) return;
    const gstnRow = kind === 'gstr1' ? row.gstr1Gstn : row.gstr3bGstn;
    setFilingModal({
      kind, year: row.year, month: row.month,
      existing: kind === 'gstr1' ? row.gstr1 : row.gstr3b,
      suggestedAmount: kind === 'gstr3b' ? Math.max(0, row.netPayable) : null,
      initialDate: gstnRow?.dof || null, // GSTN's date of filing pre-fills the form
      periodLabel: monthLabel(row),
    });
  };

  const numCls = 'px-4 py-3 text-right tabular-nums';

  return (
    <div className="min-h-screen bg-dark-900 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-300 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold text-white">GST Report</h1>
            <p className="text-dark-300 text-sm mt-1">
              Output GST, input credit and filing status for {data?.company?.name || currentCompany?.name || 'this company'}
              {data?.company?.gstin ? ` · GSTIN ${data.company.gstin}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data?.gstn?.enabled && (
              <button onClick={() => load(true)} disabled={syncing || loading}
                title={data.gstn.fetchedAt
                  ? `${data.gstn.stale ? 'GSTN unreachable — showing cached status from ' : 'Filing status from GSTN as of '}${new Date(data.gstn.fetchedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : 'Fetch GSTR-1/3B filing status from the GST portal'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50 text-xs transition-colors">
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync GSTN
              </button>
            )}
            <div className="flex rounded-lg border border-dark-700 overflow-hidden">
              {GRANULARITIES.map((g) => (
                <button key={g.key} onClick={() => setGranularity(g.key)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${granularity === g.key ? 'bg-blue-600 text-white' : 'bg-dark-850 text-dark-300 hover:text-white'}`}>
                  {g.label}
                </button>
              ))}
            </div>
            {data && (
              <select value={fy || data.fy || ''} onChange={(e) => setFy(e.target.value)}
                className="px-3 py-2 bg-dark-850 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
                {(data.fyOptions || (data.fy ? [data.fy] : [])).map((o) => <option key={o} value={o}>FY {o}</option>)}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button onClick={() => load()} className="px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-sm shrink-0">Retry</button>
          </div>
        )}
        {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}

        {!loading && !error && data && (
          <>
            <HowToRead storageKey="gst-report">
              <p>
                Every month the GST cycle is: <span className="text-white">collect → claim credit → pay the difference</span>.
                You collect GST from customers on sales (<span className="text-emerald-400">Output GST</span>). The GST you
                yourself paid on vendor bills becomes credit (<span className="text-blue-400">ITC — Input Tax Credit</span>)
                that reduces your bill. What's left (<span className="text-amber-400">Net payable</span> = Output GST − ITC)
                is paid to the government with the monthly <span className="text-white">GSTR-3B</span> return; sales are
                separately reported in <span className="text-white">GSTR-1</span>.
              </p>
              <p>
                ITC appears twice because there are two versions of the truth: <span className="text-blue-400">ITC (books)</span> is
                what <em>your</em> records say, while <span className="text-blue-400">ITC (2B)</span> is what your vendors have
                actually confirmed by filing their own returns (the GSTR-2B statement). Only confirmed credit is safe to
                claim — an amber ⚠ means some of your booked credit isn't confirmed yet. A cyan
                "<span className="text-cyan-400">unbooked</span>" line is the opposite: vendors reported credit you haven't
                entered a bill for — book those bills to claim it (the "after booking" figure shows your payable once you do).
              </p>
              <p className="text-dark-400">
                Tap the <HelpCircle size={11} className="inline align-[-1px]" /> next to any column for its definition.
                Amounts are clickable and open the underlying invoices. Status chips show each month's filings — admins
                click them to record a filing with challan details.
              </p>
            </HowToRead>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi label="Output GST" amount={totals.outputTax} tone="green" hint={`collected on ${formatCurrency(totals.taxableTurnover, 'INR')} of sales`} />
              <Kpi label="ITC (books)" amount={totals.itcBooks} tone="blue" hint="credit from GST paid on vendor bills" />
              <Kpi label="ITC matched in 2B" amount={totals.itc2b} tone="blue" hint="confirmed by vendors' filings" />
              <Kpi label="Net payable" amount={totals.netPayable} tone={totals.netPayable > 0 ? 'amber' : 'green'} hint="Output GST − ITC (books)" />
              <Kpi label="Paid (3B challans)" amount={totals.amountPaid} tone={totals.amountPaid >= totals.netPayable ? 'green' : 'red'} hint="tax actually paid to GSTN" />
            </div>

            {/* Period table */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-dark-700 flex items-center gap-3">
                <Receipt size={18} className="text-blue-400" />
                <h3 className="text-lg font-semibold text-white flex-1">
                  {granularity === 'fy' ? `FY ${data.fy}` : granularity === 'quarter' ? 'Quarterly' : 'Monthly'} summary
                </h3>
                {granularity === 'month' && (
                  <button onClick={() => setShowSplit((s) => !s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${showSplit ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-dark-700 text-dark-300 hover:text-white'}`}>
                    <Columns3 size={14} /> CGST/SGST/IGST
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-dark-700 text-dark-300">
                      <th className="text-left px-4 py-3 font-medium">Period</th>
                      <th className={`${numCls} font-medium`}>
                        <TermHint label="Taxable T/O">Taxable turnover — the sales value (before tax) you charged GST on this period. INR invoices only.</TermHint>
                      </th>
                      <th className={`${numCls} font-medium`}>
                        <TermHint label="Exports (0%)">Zero-rated sales: exports and foreign-currency invoices. No GST is charged on these, so they add turnover but no Output GST.</TermHint>
                      </th>
                      <th className={`${numCls} font-medium text-emerald-400`}>
                        <TermHint label="Output GST">GST you collected from customers on sales. You hold this for the government until you file GSTR-3B.</TermHint>
                      </th>
                      {showSplit && granularity === 'month' && <>
                        <th className={`${numCls} font-medium text-dark-400`}>
                          <TermHint label="CGST">Central GST — half of the tax on sales within your own state.</TermHint>
                        </th>
                        <th className={`${numCls} font-medium text-dark-400`}>
                          <TermHint label="SGST">State GST — the other half of the tax on within-state sales.</TermHint>
                        </th>
                        <th className={`${numCls} font-medium text-dark-400`}>
                          <TermHint label="IGST">Integrated GST — the full tax on sales to other states.</TermHint>
                        </th>
                      </>}
                      <th className={`${numCls} font-medium text-blue-400`}>
                        <TermHint label="ITC (books)">Input Tax Credit per your own records — GST you paid on vendor bills. It reduces what you owe.</TermHint>
                      </th>
                      <th className={`${numCls} font-medium text-blue-400`}>
                        <TermHint label="ITC (2B)">The portion of your credit that vendors have confirmed by filing their returns — it appears in your GSTR-2B statement. Only confirmed credit is safe to claim. Kept current by the GST 2B Recon page.</TermHint>
                      </th>
                      <th className={`${numCls} font-medium text-amber-400`}>
                        <TermHint label="Net payable">Output GST minus ITC (books) — the tax this month owes the government via GSTR-3B.</TermHint>
                      </th>
                      <th className={`${numCls} font-medium`}>
                        <TermHint label="Paid">Tax actually paid — the GSTR-3B challan amounts recorded against this month.</TermHint>
                      </th>
                      {granularity === 'month' && <>
                        <th className="text-center px-4 py-3 font-medium">
                          <TermHint label="GSTR-1">Monthly return listing your sales invoices. Due the 11th of the following month.</TermHint>
                        </th>
                        <th className="text-center px-4 py-3 font-medium">
                          <TermHint label="GSTR-3B">Monthly summary return where the tax is actually paid. Due the 20th of the following month.</TermHint>
                        </th>
                        <th className="text-center px-4 py-3 font-medium" title="Download GSTR-1 CSV">CSV</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {(granularity === 'fy' ? [{ ...totals, label: `FY ${data.fy}` }] : rows).map((row, i) => (
                      <tr key={row.key || row.label || i} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{row.label || monthLabel(row)}</td>
                        <td className={`${numCls} text-dark-200`}>{formatCurrency(row.taxableTurnover, 'INR')}</td>
                        <td className={`${numCls} text-dark-400`}>
                          {row.key
                            ? <button className={drillCls} title="View export invoices" onClick={() => openDrill('exports', row)}>{formatCurrency(row.exportsTurnover, 'INR')}</button>
                            : formatCurrency(row.exportsTurnover, 'INR')}
                        </td>
                        <td className={`${numCls} text-emerald-400`}>
                          {row.key
                            ? <button className={drillCls} title="View taxed sales invoices" onClick={() => openDrill('output', row)}>{formatCurrency(row.outputTax, 'INR')}</button>
                            : formatCurrency(row.outputTax, 'INR')}
                        </td>
                        {showSplit && granularity === 'month' && <>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.cgst || 0, 'INR')}</td>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.sgst || 0, 'INR')}</td>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.igst || 0, 'INR')}</td>
                        </>}
                        <td className={`${numCls} text-blue-400`}>
                          {row.key
                            ? <button className={drillCls} title="View vendor bills with GST" onClick={() => openDrill('itc', row)}>{formatCurrency(row.itcBooks, 'INR')}</button>
                            : formatCurrency(row.itcBooks, 'INR')}
                        </td>
                        <td className={`${numCls} ${row.itc2b < row.itcBooks ? 'text-amber-400' : 'text-blue-400'}`}>
                          {row.key
                            ? <button className={drillCls} title="View 2B-matched bills" onClick={() => openDrill('itc2b', row)}>{formatCurrency(row.itc2b, 'INR')}</button>
                            : formatCurrency(row.itc2b, 'INR')}
                          {row.key && row.itcGap > 0.005 && (
                            <button onClick={() => openDrill('itcgap', row)}
                              title={`${formatCurrency(row.itcGap, 'INR')} of booked ITC not yet matched in 2B — view which bills and why`}
                              className="ml-1.5 text-amber-400 hover:text-amber-300 align-middle transition-colors">
                              <AlertTriangle size={12} />
                            </button>
                          )}
                          {row.key && row.itcUnbooked > 0 && (
                            <button onClick={() => openDrill('itcunbooked', row)}
                              title={`${formatCurrency(row.itcUnbooked, 'INR')} of credit is in your 2B but has no bill in the books — book those bills to claim it`}
                              className="block w-full text-right text-[10px] text-cyan-400 hover:text-cyan-300 mt-0.5 transition-colors">
                              +{formatCurrency(row.itcUnbooked, 'INR')} unbooked
                            </button>
                          )}
                        </td>
                        <td className={`${numCls} font-semibold ${row.netPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {formatCurrency(row.netPayable, 'INR')}
                          {row.key && row.itcUnbooked > 0 && (
                            <button onClick={() => openDrill('itcunbooked', row)}
                              title={`Projected 3B payable = Output GST ${formatCurrency(row.outputTax, 'INR')} − (2B-verified ITC ${formatCurrency(row.itc2b, 'INR')} + unbooked 2B credit ${formatCurrency(row.itcUnbooked, 'INR')}) once those bills are booked — click to view them`}
                              className="block w-full text-right text-[10px] font-normal text-cyan-400 hover:text-cyan-300 mt-0.5 transition-colors">
                              {formatCurrency(row.outputTax - (row.itc2b + row.itcUnbooked), 'INR')} after booking
                            </button>
                          )}
                        </td>
                        <td className={`${numCls} text-dark-200`}>{row.amountPaid != null ? formatCurrency(row.amountPaid, 'INR') : '—'}</td>
                        {granularity === 'month' && <>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => openFiling('gstr1', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                              <StatusChip status={row.gstr1Status} due={row.gstr1Due} note={gstnNote(row.gstr1Gstn)} />
                              {row.gstr1Source === 'gstn' && <div className="text-[9px] text-cyan-500/80 mt-0.5">via GSTN</div>}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => openFiling('gstr3b', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                              <StatusChip status={row.gstr3bStatus} due={row.gstr3bDue} note={gstnNote(row.gstr3bGstn)} />
                              {row.gstr3bSource === 'gstn' && <div className="text-[9px] text-cyan-500/80 mt-0.5">via GSTN</div>}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => exportGstr1(row)} disabled={exportingKey === row.key}
                              title={`Download GSTR-1 CSV for ${monthLabel(row)}`}
                              className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-50 transition-colors">
                              {exportingKey === row.key ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                          </td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                  {granularity !== 'fy' && (
                    <tfoot>
                      <tr className="bg-dark-800/50 font-semibold">
                        <td className="px-4 py-3 text-white">Total</td>
                        <td className={numCls + ' text-dark-200'}>{formatCurrency(totals.taxableTurnover, 'INR')}</td>
                        <td className={numCls + ' text-dark-400'}>{formatCurrency(totals.exportsTurnover, 'INR')}</td>
                        <td className={numCls + ' text-emerald-400'}>{formatCurrency(totals.outputTax, 'INR')}</td>
                        {showSplit && granularity === 'month' && <td colSpan={3} />}
                        <td className={numCls + ' text-blue-400'}>{formatCurrency(totals.itcBooks, 'INR')}</td>
                        <td className={numCls + ' text-blue-400'}>{formatCurrency(totals.itc2b, 'INR')}</td>
                        <td className={numCls + ' text-amber-400'}>{formatCurrency(totals.netPayable, 'INR')}</td>
                        <td className={numCls + ' text-dark-200'}>{formatCurrency(totals.amountPaid, 'INR')}</td>
                        {granularity === 'month' && <td colSpan={3} />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="flex items-start gap-2 text-dark-400 text-xs">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p>
                Output GST and ITC are computed from finalized INR documents by document date (GST tax-period rule).
                Exports show zero-rated / foreign-currency turnover converted at reference rates. ITC (2B) reflects
                matched + probable bills from the GST 2B Recon — run the recon monthly to keep it current.
                {isAdmin ? ' Click a status chip to record a filing with challan details.' : ''}
                {data.missingRates?.length ? ` Missing FX rates: ${data.missingRates.join(', ')}.` : ''}
              </p>
            </div>
          </>
        )}

        {filingModal && (
          <StatutoryFilingModal
            orgSlug={orgSlug}
            {...filingModal}
            onClose={() => setFilingModal(null)}
            onSaved={load}
          />
        )}
        {drill && (
          <StatutoryRecordsModal orgSlug={orgSlug} report="gst" {...drill} onClose={() => setDrill(null)} />
        )}
      </div>
    </div>
  );
}
