import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, ArrowLeft, Receipt, Search } from 'lucide-react';
import GstReport from './GstReport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build YYYY-MM-DD from LOCAL date parts. toISOString() converts to UTC
// first, which shifts the date a day back for ahead-of-UTC timezones (IST).
function toLocalYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toLocalYMD(from),
    to: toLocalYMD(to),
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

// Indian (INR) companies get the statutory GST Report on this route; other
// companies keep the generic collected-vs-paid tax report below. Separate
// components so switching companies remounts cleanly (no conditional hooks).
export default function TaxReportSwitch() {
  const { currentCompany } = useCompany();
  if (currentCompany?.currency === 'INR') return <GstReport />;
  return <LegacyTaxReport />;
}

function LegacyTaxReport() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { isMobile } = usePlatform();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;

  const defaults = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Drop stale responses on rapid Generate clicks / date edits mid-flight.
  const seqRef = useRef(0);
  const fetchReport = () => {
    if (!orgSlug) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    // Reset on company switch so the previous company's tax totals don't
    // linger if the new fetch returns nothing.
    setData(null);
    invoicingApi
      .getTaxReport(orgSlug, { from: fromDate, to: toDate })
      .then((res) => { if (seq === seqRef.current) setData(res); })
      .catch((err) => { if (seq === seqRef.current) setError(err.message || 'Failed to load tax report'); })
      .finally(() => { if (seq === seqRef.current) setLoading(false); });
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  const summaryByCurrency = Array.isArray(data?.summary?.byCurrency) ? data.summary.byCurrency : [];
  const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];

  return (
    <div className="min-h-screen bg-dark-900 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Tax Report</h1>
            <p className="text-dark-300 text-sm mt-1">
              Tax collected vs tax paid for the selected period
            </p>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row items-end'} gap-4`}>
            <div className="flex-1">
              <label className="block text-dark-300 text-xs font-medium mb-1.5 uppercase tracking-wider">
                From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-dark-300 text-xs font-medium mb-1.5 uppercase tracking-wider">
                To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Generate
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        )}

        {/* Content — one block per currency. INR + USD GST/sales tax are
            never the same liability, so we never sum them into a single row. */}
        {!loading && !error && summaryByCurrency.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-dark-500">
            <Receipt size={48} className="mb-3 opacity-40" />
            <p className="text-base font-medium text-dark-400">No tax data for the selected period</p>
          </div>
        )}
        {!loading && !error && summaryByCurrency.map((sumRow) => {
          const rows = breakdown.filter((b) => b.currency === sumRow.currency);
          return (
            <div key={sumRow.currency} className="space-y-4">
              <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
                {sumRow.currency}
              </h2>
              <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <div className="rounded-xl border p-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  <span className="text-xs font-medium uppercase tracking-wider">Tax Collected</span>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(sumRow.taxCollected, sumRow.currency)}</p>
                </div>
                <div className="rounded-xl border p-5 bg-red-500/10 text-red-400 border-red-500/20">
                  <span className="text-xs font-medium uppercase tracking-wider">Tax Paid</span>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(sumRow.taxPaid, sumRow.currency)}</p>
                </div>
                <div className="rounded-xl border p-5 bg-blue-500/10 text-blue-400 border-blue-500/20">
                  <span className="text-xs font-medium uppercase tracking-wider">Net Tax</span>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(sumRow.netTax, sumRow.currency)}</p>
                </div>
              </div>

              <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-dark-700 flex items-center gap-3">
                  <Receipt size={18} className="text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Tax Breakdown</h3>
                </div>
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-dark-500">
                    <Receipt size={36} className="mb-3 opacity-40" />
                    <p className="text-sm">No per-tax detail in {sumRow.currency}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-5 py-3 font-medium">Tax Name</th>
                          <th className="text-right px-5 py-3 font-medium">Rate</th>
                          <th className="text-right px-5 py-3 font-medium text-emerald-400">Collected</th>
                          <th className="text-right px-5 py-3 font-medium text-red-400">Paid</th>
                          <th className="text-right px-5 py-3 font-medium text-blue-400">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={`${row.taxId || 'x'}-${sumRow.currency}-${i}`} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                            <td className="px-5 py-3 text-white font-medium">{row.taxName || '-'}</td>
                            <td className="px-5 py-3 text-right text-dark-300">{row.rate != null ? `${row.rate}%` : '-'}</td>
                            <td className="px-5 py-3 text-right text-emerald-400">{formatCurrency(row.collected, sumRow.currency)}</td>
                            <td className="px-5 py-3 text-right text-red-400">{formatCurrency(row.paid, sumRow.currency)}</td>
                            <td className="px-5 py-3 text-right text-blue-400 font-semibold">{formatCurrency(row.net, sumRow.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-dark-800/50 font-semibold">
                          <td className="px-5 py-3 text-white" colSpan={2}>Total</td>
                          <td className="px-5 py-3 text-right text-emerald-400">{formatCurrency(sumRow.taxCollected, sumRow.currency)}</td>
                          <td className="px-5 py-3 text-right text-red-400">{formatCurrency(sumRow.taxPaid, sumRow.currency)}</td>
                          <td className="px-5 py-3 text-right text-blue-400">{formatCurrency(sumRow.netTax, sumRow.currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
