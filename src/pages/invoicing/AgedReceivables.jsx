import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, ArrowLeft, Users } from 'lucide-react';

function AgingCard({ label, amount, color, currency }) {
  const colorMap = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color] || colorMap.blue}`}>
      <span className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</span>
      <p className="text-2xl font-bold mt-2">{formatCurrency(amount, currency)}</p>
    </div>
  );
}

// One full aging block (summary cards + customer breakdown table) for a
// single currency. The page renders one block per currency, so an INR-heavy
// AR ledger and a USD-heavy ledger live side-by-side without ever being
// summed into a misleading single total.
function CurrencyBlock({ currency, summary, customers, isMobile }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">
        {currency}
      </h2>
      <div className={`grid gap-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-3 lg:grid-cols-6'}`}>
        <AgingCard label="Current" amount={summary.current} color="green" currency={currency} />
        <AgingCard label="1-30 Days" amount={summary.days1to30} color="amber" currency={currency} />
        <AgingCard label="31-60 Days" amount={summary.days31to60} color="orange" currency={currency} />
        <AgingCard label="61-90 Days" amount={summary.days61to90} color="red" currency={currency} />
        <AgingCard label="90+ Days" amount={summary.days90plus} color="red" currency={currency} />
        <AgingCard label="Total" amount={summary.total} color="blue" currency={currency} />
      </div>

      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-dark-700 flex items-center gap-3">
          <Users size={18} className="text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Customer Breakdown</h3>
          <span className="text-dark-300 text-sm ml-auto">
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dark-500">
            <Users size={36} className="mb-3 opacity-40" />
            <p className="text-sm">No outstanding receivables in {currency}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-300">
                  <th className="text-left px-5 py-3 font-medium">Customer Name</th>
                  <th className="text-right px-5 py-3 font-medium text-emerald-400">Current</th>
                  <th className="text-right px-5 py-3 font-medium text-amber-400">1-30</th>
                  <th className="text-right px-5 py-3 font-medium text-orange-400">31-60</th>
                  <th className="text-right px-5 py-3 font-medium text-red-400">61-90</th>
                  <th className="text-right px-5 py-3 font-medium text-red-400">90+</th>
                  <th className="text-right px-5 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row, i) => (
                  <tr
                    key={`${row.customerId || i}-${currency}`}
                    className="border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors"
                  >
                    <td className="px-5 py-3 text-white font-medium">{row.customerName || '-'}</td>
                    <td className="px-5 py-3 text-right text-emerald-400">{formatCurrency(row.current, currency)}</td>
                    <td className="px-5 py-3 text-right text-amber-400">{formatCurrency(row.days1to30, currency)}</td>
                    <td className="px-5 py-3 text-right text-orange-400">{formatCurrency(row.days31to60, currency)}</td>
                    <td className="px-5 py-3 text-right text-red-400">{formatCurrency(row.days61to90, currency)}</td>
                    <td className="px-5 py-3 text-right text-red-400">{formatCurrency(row.days90plus, currency)}</td>
                    <td className="px-5 py-3 text-right text-white font-semibold">{formatCurrency(row.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-dark-800/50 font-semibold">
                  <td className="px-5 py-3 text-white">Total</td>
                  <td className="px-5 py-3 text-right text-emerald-400">{formatCurrency(summary.current, currency)}</td>
                  <td className="px-5 py-3 text-right text-amber-400">{formatCurrency(summary.days1to30, currency)}</td>
                  <td className="px-5 py-3 text-right text-orange-400">{formatCurrency(summary.days31to60, currency)}</td>
                  <td className="px-5 py-3 text-right text-red-400">{formatCurrency(summary.days61to90, currency)}</td>
                  <td className="px-5 py-3 text-right text-red-400">{formatCurrency(summary.days90plus, currency)}</td>
                  <td className="px-5 py-3 text-right text-white">{formatCurrency(summary.total, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgedReceivables() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { isMobile } = usePlatform();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    setError(null);
    setData(null);
    invoicingApi
      .getAgedReceivables(orgSlug)
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load aged receivables'))
      .finally(() => setLoading(false));
  }, [orgSlug, currentCompany?._id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dark-900 p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
            {error}
          </div>
        </div>
      </div>
    );
  }

  const summaryByCurrency = Array.isArray(data?.summary?.byCurrency) ? data.summary.byCurrency : [];
  const allCustomers = Array.isArray(data?.byCustomer) ? data.byCustomer : [];

  return (
    <div className="min-h-screen bg-dark-900 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-dark-850 border border-dark-700 text-dark-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Aged Receivables</h1>
            <p className="text-dark-300 text-sm mt-1">
              Outstanding customer invoices grouped by aging period
            </p>
          </div>
        </div>

        {summaryByCurrency.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-dark-500">
            <Users size={48} className="mb-3 opacity-40" />
            <p className="text-base font-medium text-dark-400">No outstanding receivables</p>
          </div>
        ) : (
          summaryByCurrency.map((sumRow) => {
            const customersInCurrency = allCustomers
              .map((c) => {
                const block = (c.byCurrency || []).find((b) => b.currency === sumRow.currency);
                return block
                  ? { customerId: c.customerId, customerName: c.customerName, ...block }
                  : null;
              })
              .filter(Boolean)
              .sort((a, b) => (b.total || 0) - (a.total || 0));
            return (
              <CurrencyBlock
                key={sumRow.currency}
                currency={sumRow.currency}
                summary={sumRow}
                customers={customersInCurrency}
                isMobile={isMobile}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
