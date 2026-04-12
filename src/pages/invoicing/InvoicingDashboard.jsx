import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  FileText, Banknote, Clock, AlertTriangle, ArrowRight,
  Loader2, TrendingUp, CreditCard, Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({ label, value, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const iconBg = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function RevenueChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-dark-500 text-sm">
        No revenue data yet
      </div>
    );
  }

  const maxAmount = Math.max(...data.map(d => d.amount || 0), 1);

  return (
    <div className="flex items-end gap-2 h-48">
      {data.map((d, i) => {
        const heightPct = Math.max(((d.amount || 0) / maxAmount) * 100, 2);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-dark-400 font-medium">
              {formatCurrency(d.amount)}
            </span>
            <div className="w-full flex items-end justify-center" style={{ height: '140px' }}>
              <div
                className="w-full max-w-[40px] bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-md transition-all duration-500"
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="text-[10px] text-dark-500">{d.label || d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-dark-700 text-dark-300',
    sent: 'bg-blue-500/10 text-blue-400',
    paid: 'bg-emerald-500/10 text-emerald-400',
    overdue: 'bg-red-500/10 text-red-400',
    partial: 'bg-amber-500/10 text-amber-400',
    cancelled: 'bg-dark-800 text-dark-500',
  };
  const key = (status || '').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || styles.draft}`}>
      {status || 'Draft'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InvoicingDashboard() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    invoicingApi
      .getDashboard(orgSlug)
      .then(res => {
        if (res.success !== false) setData(res);
      })
      .catch(() => showToast('Failed to load invoicing dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="bg-dark-900 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-dark-900 min-h-screen flex items-center justify-center">
        <p className="text-dark-500 text-sm">Unable to load dashboard data.</p>
      </div>
    );
  }

  const kpi = data.kpis || data.kpi || {};
  const recentInvoices = data.recentInvoices || [];
  const recentPayments = data.recentPayments || [];
  const monthlyRevenueRaw = data.monthlyRevenue || [];

  // Map backend shape { _id: { year, month }, total, count } to chart shape { amount, label }
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyRevenue = monthlyRevenueRaw.map(d => ({
    amount: d.amount ?? d.total ?? 0,
    label: d.label || (d._id ? `${MONTH_SHORT[(d._id.month || 1) - 1]} ${d._id.year}` : d.month || ''),
  }));

  return (
    <div className="bg-dark-900 min-h-screen">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Invoicing Dashboard</h1>
            <p className="text-xs text-dark-400 mt-0.5">Overview of your invoicing activity</p>
          </div>
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices/new'))}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <FileText size={14} />
            New Invoice
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Total Invoiced"
            value={formatCurrency(kpi.totalInvoiced || 0)}
            icon={FileText}
            color="blue"
          />
          <KPICard
            label="Collected"
            value={formatCurrency(kpi.totalCollected || kpi.collected || 0)}
            icon={Banknote}
            color="green"
          />
          <KPICard
            label="Outstanding"
            value={formatCurrency(kpi.totalOutstanding || kpi.outstanding || 0)}
            icon={Clock}
            color="amber"
          />
          <KPICard
            label="Overdue"
            value={formatCurrency(kpi.totalOverdue || kpi.overdue || 0)}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* Charts & Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Revenue Chart */}
          <div className="lg:col-span-2 bg-dark-850 border border-dark-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-dark-200">Monthly Revenue</h3>
              </div>
            </div>
            <RevenueChart data={monthlyRevenue} />
          </div>

          {/* Recent Payments */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-dark-200">Recent Payments</h3>
              </div>
              <button
                onClick={() => navigate(orgPath('/invoicing/payments'))}
                className="text-xs text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1"
              >
                View All <ArrowRight size={12} />
              </button>
            </div>

            {recentPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-dark-500">
                <CreditCard size={24} className="mb-2 opacity-40" />
                <p className="text-xs">No payments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.slice(0, 5).map(p => (
                  <div
                    key={p._id}
                    className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{p.customerName || p.invoiceNumber || 'Payment'}</p>
                      <p className="text-[10px] text-dark-500">{formatDate(p.date || p.createdAt)}</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-400 whitespace-nowrap ml-3">
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices Table */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-dark-200">Recent Invoices</h3>
            </div>
            <button
              onClick={() => navigate(orgPath('/invoicing/invoices'))}
              className="text-xs text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1"
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-dark-500">
              <FileText size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No invoices yet</p>
              <p className="text-xs mt-1 opacity-60">Create your first invoice to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800 rounded-tl-lg">Number</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Customer</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Date</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800">Total</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-dark-400 uppercase tracking-wider bg-dark-800 rounded-tr-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.slice(0, 5).map(inv => (
                    <tr
                      key={inv._id}
                      onClick={() => navigate(orgPath(`/invoicing/invoices/${inv._id}`))}
                      className="border-b border-dark-700/50 last:border-0 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-white font-medium">{inv.number || inv.invoiceNumber || '-'}</td>
                      <td className="py-2.5 px-3 text-dark-300">{inv.contactName || inv.customerName || '-'}</td>
                      <td className="py-2.5 px-3 text-dark-400">{formatDate(inv.date || inv.createdAt)}</td>
                      <td className="py-2.5 px-3 text-white text-right font-medium">{formatCurrency(inv.total)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
