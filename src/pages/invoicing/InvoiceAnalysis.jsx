import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  Loader2, ArrowLeft, Search, TrendingUp, Users, Package,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// formatCurrency is imported from utils — it guards against invalid ISO codes
// (a malformed currency on a record would otherwise crash Intl.NumberFormat).

function formatNumber(num) {
  if (num == null) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Build YYYY-MM-DD from LOCAL date parts. toISOString() converts to UTC
// first, which shifts the date a day back for ahead-of-UTC timezones (IST).
function toLocalYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toLocalYMD(from),
    to: toLocalYMD(to),
  };
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function ReportSection({ icon: Icon, title, count, children }) {
  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      <div className="p-5 border-b border-dark-700 flex items-center gap-3">
        <Icon size={18} className="text-blue-400" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {count != null && (
          <span className="text-dark-300 text-sm ml-auto">
            {count} record{count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-dark-500">
      <Icon size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InvoiceAnalysis() {
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

  const fetchReport = () => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    // Reset on company switch so the previous company's chart data doesn't
    // linger if the new fetch returns nothing.
    setData(null);
    invoicingApi
      .getInvoiceAnalysis(orgSlug, { dateFrom: fromDate, dateTo: toDate })
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load invoice analysis'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  // New shape: byPeriod rows each carry their own currency. byCustomer /
  // byProduct are arrays of { currency, rows: [...] } groups. We surface the
  // set of currencies present in any of the three sections so each section
  // renders its own per-currency block.
  const revenueByPeriod = Array.isArray(data?.byPeriod) ? data.byPeriod : [];
  const customerGroups = Array.isArray(data?.byCustomer) ? data.byCustomer : [];
  const productGroups = Array.isArray(data?.byProduct) ? data.byProduct : [];
  const periodCurrencies = Array.from(new Set(revenueByPeriod.map((r) => r.currency || 'INR')));
  const allCurrencies = Array.from(new Set([
    ...periodCurrencies,
    ...customerGroups.map((g) => g.currency),
    ...productGroups.map((g) => g.currency),
  ])).sort((a, b) => (a === 'INR' ? -1 : b === 'INR' ? 1 : a.localeCompare(b)));

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
            <h1 className="text-2xl font-bold text-white">Invoice Analysis</h1>
            <p className="text-dark-300 text-sm mt-1">
              Revenue trends, top customers, and top products
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
              Analyze
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

        {/* Content — every section split per currency to prevent silent
            INR+USD mashups in revenue trends, top-customer rankings, etc. */}
        {!loading && !error && allCurrencies.length === 0 && (
          <ReportSection icon={TrendingUp} title="Revenue by Period">
            <EmptyState icon={TrendingUp} message="No data for the selected period" />
          </ReportSection>
        )}
        {!loading && !error && allCurrencies.map((cur) => {
          const periodRows = revenueByPeriod.filter((r) => (r.currency || 'INR') === cur);
          const customerRows = customerGroups.find((g) => g.currency === cur)?.rows || [];
          const productRows = productGroups.find((g) => g.currency === cur)?.rows || [];
          const totalRev = periodRows.reduce((s, r) => s + (r.revenue || 0), 0);
          const totalCn = periodRows.reduce((s, r) => s + (r.creditNotes || 0), 0);
          const totalNet = periodRows.reduce((s, r) => s + (r.netRevenue ?? (r.revenue || 0) - (r.creditNotes || 0)), 0);
          const totalCount = periodRows.reduce((s, r) => s + (r.invoiceCount || 0), 0);
          return (
            <div key={cur} className="space-y-4">
              <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">{cur}</h2>

              <ReportSection icon={TrendingUp} title="Revenue by Period" count={periodRows.length}>
                {periodRows.length === 0 ? (
                  <EmptyState icon={TrendingUp} message={`No revenue data in ${cur}`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-5 py-3 font-medium">Year</th>
                          <th className="text-left px-5 py-3 font-medium">Month</th>
                          <th className="text-right px-5 py-3 font-medium">Invoice Count</th>
                          <th className="text-right px-5 py-3 font-medium">Revenue</th>
                          <th className="text-right px-5 py-3 font-medium">Credit Notes</th>
                          <th className="text-right px-5 py-3 font-medium">Net Revenue</th>
                          <th className="text-right px-5 py-3 font-medium">Avg Invoice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodRows.map((row, i) => {
                          const avgInvoice = row.invoiceCount > 0 ? (row.revenue || 0) / row.invoiceCount : 0;
                          const cn = row.creditNotes || 0;
                          const net = row.netRevenue ?? ((row.revenue || 0) - cn);
                          return (
                            <tr key={`${cur}-${i}`} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                              <td className="px-5 py-3 text-white">{row.year}</td>
                              <td className="px-5 py-3 text-white">{MONTH_NAMES[row.month - 1] || row.month}</td>
                              <td className="px-5 py-3 text-right text-dark-300">{formatNumber(row.invoiceCount)}</td>
                              <td className="px-5 py-3 text-right text-dark-300">{formatCurrency(row.revenue, cur)}</td>
                              <td className="px-5 py-3 text-right text-purple-400">{cn ? `-${formatCurrency(cn, cur)}` : '—'}</td>
                              <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{formatCurrency(net, cur)}</td>
                              <td className="px-5 py-3 text-right text-blue-400">{formatCurrency(row.avgInvoice ?? avgInvoice, cur)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-dark-800/50 font-semibold">
                          <td className="px-5 py-3 text-white" colSpan={2}>Total</td>
                          <td className="px-5 py-3 text-right text-dark-300">{formatNumber(totalCount)}</td>
                          <td className="px-5 py-3 text-right text-dark-300">{formatCurrency(totalRev, cur)}</td>
                          <td className="px-5 py-3 text-right text-purple-400">{totalCn ? `-${formatCurrency(totalCn, cur)}` : '—'}</td>
                          <td className="px-5 py-3 text-right text-emerald-400">{formatCurrency(totalNet, cur)}</td>
                          <td className="px-5 py-3 text-right text-blue-400">{formatCurrency(totalCount > 0 ? totalRev / totalCount : 0, cur)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </ReportSection>

              <ReportSection icon={Users} title="Top Customers" count={customerRows.length}>
                {customerRows.length === 0 ? (
                  <EmptyState icon={Users} message={`No customer data in ${cur}`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-5 py-3 font-medium w-8">#</th>
                          <th className="text-left px-5 py-3 font-medium">Customer</th>
                          <th className="text-right px-5 py-3 font-medium">Invoices</th>
                          <th className="text-right px-5 py-3 font-medium">Revenue</th>
                          <th className="text-right px-5 py-3 font-medium">Credit Notes</th>
                          <th className="text-right px-5 py-3 font-medium">Net Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRows.map((row, i) => {
                          const cn = row.creditNotes || 0;
                          const net = row.netRevenue ?? ((row.revenue || 0) - cn);
                          return (
                          <tr key={`${cur}-${row.customerId || i}`} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                            <td className="px-5 py-3 text-dark-500 text-xs">{i + 1}</td>
                            <td className="px-5 py-3 text-white font-medium">{row.customerName || '-'}</td>
                            <td className="px-5 py-3 text-right text-dark-300">{formatNumber(row.invoiceCount)}</td>
                            <td className="px-5 py-3 text-right text-dark-300">{formatCurrency(row.revenue, cur)}</td>
                            <td className="px-5 py-3 text-right text-purple-400">{cn ? `-${formatCurrency(cn, cur)}` : '—'}</td>
                            <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{formatCurrency(net, cur)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ReportSection>

              <ReportSection icon={Package} title="Top Products" count={productRows.length}>
                {productRows.length === 0 ? (
                  <EmptyState icon={Package} message={`No product data in ${cur}`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700 text-dark-300">
                          <th className="text-left px-5 py-3 font-medium w-8">#</th>
                          <th className="text-left px-5 py-3 font-medium">Product</th>
                          <th className="text-right px-5 py-3 font-medium">Qty Sold</th>
                          <th className="text-right px-5 py-3 font-medium">Revenue</th>
                          <th className="text-right px-5 py-3 font-medium">Credit Notes</th>
                          <th className="text-right px-5 py-3 font-medium">Net Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productRows.map((row, i) => {
                          const cn = row.creditNotes || 0;
                          const net = row.netRevenue ?? ((row.revenue || 0) - cn);
                          return (
                          <tr key={`${cur}-${row.productId || i}`} className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors">
                            <td className="px-5 py-3 text-dark-500 text-xs">{i + 1}</td>
                            <td className="px-5 py-3 text-white font-medium">{row.productName || '-'}</td>
                            <td className="px-5 py-3 text-right text-dark-300">{formatNumber(row.qtySold)}</td>
                            <td className="px-5 py-3 text-right text-dark-300">{formatCurrency(row.revenue, cur)}</td>
                            <td className="px-5 py-3 text-right text-purple-400">{cn ? `-${formatCurrency(cn, cur)}` : '—'}</td>
                            <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{formatCurrency(net, cur)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ReportSection>
            </div>
          );
        })}
      </div>
    </div>
  );
}
