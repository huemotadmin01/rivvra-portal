// ============================================================================
// GstReport.jsx — GST Report for Indian companies (replaces the flat Tax
// Report when the active company bills in INR). Monthly rows with quarter/FY
// rollups: output GST, ITC (books vs 2B-matched), net payable, filing status
// chips (GSTR-1 / GSTR-3B) and admin-recorded filing entries with challan.
// Backend: GET /invoicing/statutory/gst-report, POST/DELETE .../filings.
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import StatutoryFilingModal from '../../components/invoicing/StatutoryFilingModal';
import { Loader2, ArrowLeft, Receipt, Info, Columns3 } from 'lucide-react';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GRANULARITIES = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'fy', label: 'Financial Year' },
];

function monthLabel(row) { return `${MONTH_ABBR[row.month - 1]} ${row.year}`; }

export function StatusChip({ status, due }) {
  const map = {
    filed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    overdue: 'bg-red-500/10 text-red-400 border-red-500/20',
    none: 'bg-dark-800 text-dark-500 border-dark-700',
  };
  const label = { filed: 'Filed', pending: 'Pending', overdue: 'Overdue', none: '—' }[status] || status;
  const title = due && status !== 'filed' ? `Due ${new Date(due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : undefined;
  return (
    <span title={title} className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-medium ${map[status] || map.none}`}>
      {label}
    </span>
  );
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

  const load = useCallback(() => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    invoicingApi.getGstReport(orgSlug, { fy: fy || undefined, granularity })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load GST report'))
      .finally(() => setLoading(false));
  }, [orgSlug, fy, granularity, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  const months = data?.months || [];
  const quarters = data?.quarters || [];
  const totals = data?.totals || {};
  const rows = granularity === 'month' ? months : granularity === 'quarter' ? quarters : [];

  const openFiling = (kind, row) => {
    if (!isAdmin) return;
    setFilingModal({
      kind, year: row.year, month: row.month,
      existing: kind === 'gstr1' ? row.gstr1 : row.gstr3b,
      suggestedAmount: kind === 'gstr3b' ? Math.max(0, row.netPayable) : null,
      periodLabel: monthLabel(row),
    });
  };

  const numCls = 'px-4 py-3 text-right tabular-nums';

  return (
    <div className="min-h-screen bg-dark-900 p-6">
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
            <div className="flex rounded-lg border border-dark-700 overflow-hidden">
              {GRANULARITIES.map((g) => (
                <button key={g.key} onClick={() => setGranularity(g.key)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${granularity === g.key ? 'bg-blue-600 text-white' : 'bg-dark-850 text-dark-300 hover:text-white'}`}>
                  {g.label}
                </button>
              ))}
            </div>
            <select value={fy || data?.fy || ''} onChange={(e) => setFy(e.target.value)}
              className="px-3 py-2 bg-dark-850 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
              {(data?.fyOptions || (data?.fy ? [data.fy] : [])).map((o) => <option key={o} value={o}>FY {o}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">{error}</div>}
        {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}

        {!loading && !error && data && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi label="Output GST" amount={totals.outputTax} tone="green" hint={`on ${formatCurrency(totals.taxableTurnover, 'INR')} taxable`} />
              <Kpi label="ITC (books)" amount={totals.itcBooks} tone="blue" />
              <Kpi label="ITC matched in 2B" amount={totals.itc2b} tone="blue" hint="from GST 2B Recon" />
              <Kpi label="Net payable" amount={totals.netPayable} tone={totals.netPayable > 0 ? 'amber' : 'green'} />
              <Kpi label="Paid (3B challans)" amount={totals.amountPaid} tone={totals.amountPaid >= totals.netPayable ? 'green' : 'red'} />
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
                      <th className={`${numCls} font-medium`}>Taxable T/O</th>
                      <th className={`${numCls} font-medium`}>Exports (0%)</th>
                      <th className={`${numCls} font-medium text-emerald-400`}>Output GST</th>
                      {showSplit && granularity === 'month' && <>
                        <th className={`${numCls} font-medium text-dark-400`}>CGST</th>
                        <th className={`${numCls} font-medium text-dark-400`}>SGST</th>
                        <th className={`${numCls} font-medium text-dark-400`}>IGST</th>
                      </>}
                      <th className={`${numCls} font-medium text-blue-400`}>ITC (books)</th>
                      <th className={`${numCls} font-medium text-blue-400`}>ITC (2B)</th>
                      <th className={`${numCls} font-medium text-amber-400`}>Net payable</th>
                      <th className={`${numCls} font-medium`}>Paid</th>
                      {granularity === 'month' && <>
                        <th className="text-center px-4 py-3 font-medium">GSTR-1</th>
                        <th className="text-center px-4 py-3 font-medium">GSTR-3B</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {(granularity === 'fy' ? [{ ...totals, label: `FY ${data.fy}` }] : rows).map((row, i) => (
                      <tr key={row.key || row.label || i} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{row.label || monthLabel(row)}</td>
                        <td className={`${numCls} text-dark-200`}>{formatCurrency(row.taxableTurnover, 'INR')}</td>
                        <td className={`${numCls} text-dark-400`}>{formatCurrency(row.exportsTurnover, 'INR')}</td>
                        <td className={`${numCls} text-emerald-400`}>{formatCurrency(row.outputTax, 'INR')}</td>
                        {showSplit && granularity === 'month' && <>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.cgst || 0, 'INR')}</td>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.sgst || 0, 'INR')}</td>
                          <td className={`${numCls} text-dark-400`}>{formatCurrency(row.outputSplit?.igst || 0, 'INR')}</td>
                        </>}
                        <td className={`${numCls} text-blue-400`}>{formatCurrency(row.itcBooks, 'INR')}</td>
                        <td className={`${numCls} ${row.itc2b < row.itcBooks ? 'text-amber-400' : 'text-blue-400'}`}>{formatCurrency(row.itc2b, 'INR')}</td>
                        <td className={`${numCls} font-semibold ${row.netPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(row.netPayable, 'INR')}</td>
                        <td className={`${numCls} text-dark-200`}>{row.amountPaid != null ? formatCurrency(row.amountPaid, 'INR') : '—'}</td>
                        {granularity === 'month' && <>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => openFiling('gstr1', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                              <StatusChip status={row.gstr1Status} due={row.gstr1Due} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => openFiling('gstr3b', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                              <StatusChip status={row.gstr3bStatus} due={row.gstr3bDue} />
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
                        {granularity === 'month' && <td colSpan={2} />}
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
      </div>
    </div>
  );
}
