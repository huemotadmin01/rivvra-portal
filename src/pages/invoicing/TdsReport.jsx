// ============================================================================
// TdsReport.jsx — TDS Report for Indian companies. Three flows in one page:
//   1. Vendor TDS we deducted on bills (26Q) — monthly + section×quarter
//   2. Salary TDS from payroll runs (24Q) — monthly deposit liability
//   3. TDS customers deducted on OUR invoices (26AS receivable side)
// Deposit entries (challan) recorded per month for 26Q / 24Q streams.
// Backend: GET /invoicing/statutory/tds-report, POST/DELETE .../filings.
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import StatutoryFilingModal from '../../components/invoicing/StatutoryFilingModal';
import StatutoryRecordsModal from '../../components/invoicing/StatutoryRecordsModal';
import { StatusChip } from './GstReport';
import { Loader2, ArrowLeft, Percent, Info, Download } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (row) => `${MONTH_ABBR[row.month - 1]} ${row.year}`;

function Kpi({ label, amount, tone, hint }) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.blue}`}>
      <span className="text-[11px] font-medium opacity-70 uppercase tracking-wider">{label}</span>
      <p className="text-xl font-bold mt-1.5">{formatCurrency(amount, 'INR')}</p>
      {hint && <p className="text-[11px] opacity-60 mt-1">{hint}</p>}
    </div>
  );
}

export default function TdsReport() {
  const navigate = useNavigate();
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('invoicing') === 'admin';

  const [fy, setFy] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filingModal, setFilingModal] = useState(null);
  const [exporting, setExporting] = useState(null); // 'tds26q' | 'tds24q'
  const [drill, setDrill] = useState(null); // { bucket, monthKey, title, subtitle }
  const { showToast } = useToast();

  const DRILL_TITLES = { vendor: 'Vendor TDS — bills (26Q)', salary: 'Salary TDS — employees (24Q)', customer: 'TDS deducted by customers' };
  const openDrill = (bucket, row) => setDrill({
    bucket, monthKey: row.key, title: DRILL_TITLES[bucket], subtitle: `${monthLabel(row)} · INR`,
  });
  const drillCls = 'underline decoration-dotted decoration-dark-500 underline-offset-4 hover:decoration-current cursor-pointer';

  const exportCsv = async (kind) => {
    setExporting(kind);
    try {
      await invoicingApi.downloadStatutoryCsv(orgSlug, kind, { fy: fy || data?.fy || '' }, `${kind.toUpperCase()}.csv`);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };
  const exportMonthCsv = async (row) => {
    setExporting(row.key);
    try {
      await invoicingApi.downloadStatutoryCsv(orgSlug, 'tdsmonth', { month: row.key }, `TDS_${row.key}.csv`);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };
  // Zero amounts render as plain text — an underlined ₹0.00 opening an empty
  // modal is noise, especially on future months.
  const drillAmount = (value, bucket, row, cls) => (
    value > 0
      ? <button className={`${drillCls} ${cls}`} onClick={() => openDrill(bucket, row)}>{formatCurrency(value, 'INR')}</button>
      : <span className={cls}>{formatCurrency(value, 'INR')}</span>
  );

  // Drop stale responses when FY changes mid-flight (throttled cluster makes
  // the out-of-order window seconds long).
  const seqRef = useRef(0);
  const load = useCallback(() => {
    if (!orgSlug) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    invoicingApi.getTdsReport(orgSlug, { fy: fy || undefined })
      .then((res) => { if (seq === seqRef.current) setData(res.data); })
      .catch((err) => { if (seq === seqRef.current) setError(err.message || 'Failed to load TDS report'); })
      .finally(() => { if (seq === seqRef.current) setLoading(false); });
  }, [orgSlug, fy, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  const months = data?.months || [];
  const sections = data?.sections || [];
  const customerRecords = data?.customerRecords || [];
  const totals = data?.totals || {};

  const openDeposit = (kind, row) => {
    if (!isAdmin) return;
    setFilingModal({
      kind, year: row.year, month: row.month,
      existing: kind === 'tds26q' ? row.deposit26q : row.deposit24q,
      suggestedAmount: kind === 'tds26q' ? row.vendorTds : row.salaryTds,
      periodLabel: monthLabel(row),
    });
  };

  const numCls = 'px-4 py-3 text-right tabular-nums';

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-300 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold text-white">TDS Report</h1>
            <p className="text-dark-300 text-sm mt-1">
              Deducted, deposited and receivable TDS for {data?.company?.name || currentCompany?.name || 'this company'}
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              <select value={fy || data.fy || ''} onChange={(e) => setFy(e.target.value)}
                className="px-3 py-2 bg-dark-850 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
                {(data.fyOptions || (data.fy ? [data.fy] : [])).map((o) => <option key={o} value={o}>FY {o}</option>)}
              </select>
              <button onClick={() => exportCsv('tds26q')} disabled={!!exporting}
                title="Vendor TDS deductee rows for the FY, with a Quarter column"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50 text-xs transition-colors">
                {exporting === 'tds26q' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 26Q CSV
              </button>
              <button onClick={() => exportCsv('tds24q')} disabled={!!exporting}
                title="Employee-wise salary TDS for the FY, with a Quarter column"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dark-700 text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50 text-xs transition-colors">
                {exporting === 'tds24q' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 24Q CSV
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button onClick={load} className="px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-sm shrink-0">Retry</button>
          </div>
        )}
        {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}

        {!loading && !error && data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi label="Vendor TDS (26Q)" amount={totals.vendorTds} tone="blue" hint="deducted on vendor bills" />
              <Kpi label="Salary TDS (24Q)" amount={totals.salaryTds} tone="purple" hint="from payroll runs" />
              <Kpi label="Deposit due" amount={totals.depositDue} tone="amber" hint="26Q + 24Q" />
              <Kpi label="Deposited" amount={totals.deposited} tone={totals.deposited >= totals.depositDue ? 'green' : 'amber'} hint="recorded challans" />
              <Kpi label="Customer-deducted TDS" amount={totals.customerTds} tone="green" hint="receivable — check 26AS" />
            </div>

            {/* Monthly deposit table */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-dark-700 flex items-center gap-3">
                <Percent size={18} className="text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Monthly TDS deposits</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-dark-700 text-dark-300">
                      <th className="text-left px-4 py-3 font-medium">Month</th>
                      <th className={`${numCls} font-medium text-blue-400`}>Vendor TDS</th>
                      <th className="text-center px-4 py-3 font-medium">26Q deposit</th>
                      <th className={`${numCls} font-medium text-purple-400`}>Salary TDS</th>
                      <th className="text-center px-4 py-3 font-medium">24Q deposit</th>
                      <th className={`${numCls} font-medium text-amber-400`}>Total due</th>
                      <th className={`${numCls} font-medium text-emerald-400`}>Customer TDS</th>
                      <th className="text-center px-4 py-3 font-medium" title="Download this month's TDS working (all flows)">CSV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((row) => (
                      <tr key={row.key} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{monthLabel(row)} <span className="text-dark-500 text-xs">Q{row.quarter}</span></td>
                        <td className={`${numCls} text-blue-400`}>
                          {drillAmount(row.vendorTds, 'vendor', row, '')}
                          <span className="text-dark-500 text-xs ml-1">({row.vendorBills})</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openDeposit('tds26q', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                            <StatusChip status={row.deposit26qStatus} due={row.depositDueDate} />
                          </button>
                        </td>
                        <td className={`${numCls} text-purple-400`}>
                          {drillAmount(row.salaryTds, 'salary', row, '')}
                          <span className="text-dark-500 text-xs ml-1">({row.salaryEmployees})</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openDeposit('tds24q', row)} disabled={!isAdmin} className={isAdmin ? 'cursor-pointer' : 'cursor-default'}>
                            <StatusChip status={row.deposit24qStatus} due={row.depositDueDate} />
                          </button>
                        </td>
                        <td className={`${numCls} font-semibold text-amber-400`}>{formatCurrency(row.depositDue, 'INR')}</td>
                        <td className={`${numCls} text-emerald-400`}>
                          {drillAmount(row.customerTds, 'customer', row, '')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => exportMonthCsv(row)} disabled={exporting === row.key}
                            title={`Download ${monthLabel(row)}'s TDS working — vendor, salary and customer flows`}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-50 transition-colors">
                            {exporting === row.key ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-dark-800/50 font-semibold">
                      <td className="px-4 py-3 text-white">Total</td>
                      <td className={`${numCls} text-blue-400`}>{formatCurrency(totals.vendorTds, 'INR')}</td>
                      <td />
                      <td className={`${numCls} text-purple-400`}>{formatCurrency(totals.salaryTds, 'INR')}</td>
                      <td />
                      <td className={`${numCls} text-amber-400`}>{formatCurrency(totals.depositDue, 'INR')}</td>
                      <td className={`${numCls} text-emerald-400`}>{formatCurrency(totals.customerTds, 'INR')}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Section-wise 26Q */}
              <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-dark-700">
                  <h3 className="text-lg font-semibold text-white">Vendor TDS by section (26Q)</h3>
                  <p className="text-dark-400 text-xs mt-0.5">Fiscal quarters — what goes in each quarterly 26Q return</p>
                </div>
                {sections.length === 0 ? (
                  <div className="py-10 text-center text-dark-500 text-sm">No vendor TDS in this FY</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-4 py-3 font-medium">Section</th>
                          {[1, 2, 3, 4].map((q) => <th key={q} className={`${numCls} font-medium`}>Q{q}</th>)}
                          <th className={`${numCls} font-medium`}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((s) => (
                          <tr key={s.section} className="border-b border-dark-700/50">
                            <td className="px-4 py-3 text-white font-medium">{s.section}<span className="text-dark-500 text-xs ml-1">({s.count})</span></td>
                            {[1, 2, 3, 4].map((q) => <td key={q} className={`${numCls} text-dark-200`}>{formatCurrency(s.quarters[q] || 0, 'INR')}</td>)}
                            <td className={`${numCls} font-semibold text-white`}>{formatCurrency(s.total, 'INR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Customer-deducted TDS records */}
              <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-dark-700">
                  <h3 className="text-lg font-semibold text-white">TDS deducted by customers</h3>
                  <p className="text-dark-400 text-xs mt-0.5">
                    Withheld from our invoice payments — reconcile against Form 26AS
                    {data.customerTruncated ? ' · showing first 200; use the CSV exports for the full list' : ''}
                  </p>
                </div>
                {customerRecords.length === 0 ? (
                  <div className="py-10 text-center text-dark-500 text-sm">No customer TDS recorded in this FY</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead className="sticky top-0 bg-dark-850">
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-4 py-3 font-medium">Date</th>
                          <th className="text-left px-4 py-3 font-medium">Invoice</th>
                          <th className="text-left px-4 py-3 font-medium">Customer</th>
                          <th className={`${numCls} font-medium`}>TDS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRecords.map((r, i) => (
                          <tr key={i} className="border-b border-dark-700/50">
                            <td className="px-4 py-3 text-dark-300">{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                            <td className="px-4 py-3 text-white">{r.invoiceNumber}</td>
                            <td className="px-4 py-3 text-dark-200 max-w-[180px] truncate">{r.customer}</td>
                            <td className={`${numCls} text-emerald-400`}>{formatCurrency(r.amount, 'INR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 text-dark-400 text-xs">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p>
                Vendor TDS comes from finalized vendor bills (by bill date, section-wise). Salary TDS reads finalized
                payroll runs. Deposits are due by the 7th of the following month
                {isAdmin ? ' — click a deposit chip to record the challan.' : '.'}
                {' '}Customer-deducted TDS is captured when an inbound payment is marked as TDS.
              </p>
            </div>
          </>
        )}

        {filingModal && (
          <StatutoryFilingModal orgSlug={orgSlug} {...filingModal} onClose={() => setFilingModal(null)} onSaved={load} />
        )}
        {drill && (
          <StatutoryRecordsModal orgSlug={orgSlug} report="tds" {...drill} onClose={() => setDrill(null)} />
        )}
      </div>
    </div>
  );
}
