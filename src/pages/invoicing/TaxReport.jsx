import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, ArrowLeft, Receipt, Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TaxReport() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { isMobile } = usePlatform();
  const orgSlug = currentOrg?.slug;

  const defaults = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = () => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    invoicingApi
      .getTaxReport(orgSlug, { from: fromDate, to: toDate })
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load tax report'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const summary = data?.summary || {};
  const breakdown = data?.breakdown || [];

  return (
    <div className="min-h-screen bg-dark-900 p-6">
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

        {/* Content */}
        {!loading && !error && (
          <>
            {/* Summary Cards */}
            <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <div className="rounded-xl border p-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <span className="text-xs font-medium opacity-70 uppercase tracking-wider">
                  Tax Collected
                </span>
                <p className="text-2xl font-bold mt-2">
                  {formatCurrency(summary.taxCollected)}
                </p>
              </div>
              <div className="rounded-xl border p-5 bg-red-500/10 text-red-400 border-red-500/20">
                <span className="text-xs font-medium opacity-70 uppercase tracking-wider">
                  Tax Paid
                </span>
                <p className="text-2xl font-bold mt-2">
                  {formatCurrency(summary.taxPaid)}
                </p>
              </div>
              <div className="rounded-xl border p-5 bg-blue-500/10 text-blue-400 border-blue-500/20">
                <span className="text-xs font-medium opacity-70 uppercase tracking-wider">
                  Net Tax
                </span>
                <p className="text-2xl font-bold mt-2">
                  {formatCurrency(summary.netTax)}
                </p>
              </div>
            </div>

            {/* Tax Breakdown Table */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-dark-700 flex items-center gap-3">
                <Receipt size={18} className="text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Tax Breakdown</h2>
              </div>

              {breakdown.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-dark-500">
                  <Receipt size={40} className="mb-3 opacity-40" />
                  <p className="text-sm">No tax data for the selected period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700 text-dark-300">
                        <th className="text-left px-5 py-3 font-medium">Tax Name</th>
                        <th className="text-right px-5 py-3 font-medium">Rate</th>
                        <th className="text-right px-5 py-3 font-medium text-emerald-400">
                          Collected
                        </th>
                        <th className="text-right px-5 py-3 font-medium text-red-400">Paid</th>
                        <th className="text-right px-5 py-3 font-medium text-blue-400">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((row, i) => (
                        <tr
                          key={row.taxId || i}
                          className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                        >
                          <td className="px-5 py-3 text-white font-medium">
                            {row.taxName || '-'}
                          </td>
                          <td className="px-5 py-3 text-right text-dark-300">
                            {row.rate != null ? `${row.rate}%` : '-'}
                          </td>
                          <td className="px-5 py-3 text-right text-emerald-400">
                            {formatCurrency(row.collected)}
                          </td>
                          <td className="px-5 py-3 text-right text-red-400">
                            {formatCurrency(row.paid)}
                          </td>
                          <td className="px-5 py-3 text-right text-blue-400 font-semibold">
                            {formatCurrency(row.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {breakdown.length > 0 && (
                      <tfoot>
                        <tr className="bg-dark-800/50 font-semibold">
                          <td className="px-5 py-3 text-white" colSpan={2}>
                            Total
                          </td>
                          <td className="px-5 py-3 text-right text-emerald-400">
                            {formatCurrency(summary.taxCollected)}
                          </td>
                          <td className="px-5 py-3 text-right text-red-400">
                            {formatCurrency(summary.taxPaid)}
                          </td>
                          <td className="px-5 py-3 text-right text-blue-400">
                            {formatCurrency(summary.netTax)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
