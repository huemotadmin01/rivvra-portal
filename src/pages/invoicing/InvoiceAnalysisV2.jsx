// ============================================================================
// InvoiceAnalysisV2.jsx — Invoice analysis on ds (phase 14, money pass)
// ============================================================================
// Copied from InvoiceAnalysis.jsx. Money-pass rule: nothing that produces a
// number moved. `formatNumber`, `toLocalYMD`, `getDefaultDateRange`, the fetch,
// the currency-set derivation and — most importantly — every per-row and
// per-total arithmetic expression are byte-identical to the legacy file:
//
//   avgInvoice   = invoiceCount > 0 ? revenue / invoiceCount : 0
//   cn           = creditNotes || 0
//   net          = netRevenue ?? (revenue - cn)
//   totalRev / totalCn / totalNet / totalCount  (four reduces)
//   footer avg   = totalCount > 0 ? totalRev / totalCount : 0
//
// The `??` in `netRevenue ?? (...)` matters and is preserved exactly: `||`
// would recompute the fallback for a legitimate net revenue of 0.
//
// `toLocalYMD` is likewise untouched — it builds YYYY-MM-DD from LOCAL parts
// because toISOString() shifts the date back a day for IST, which would
// silently move the report window.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  ArrowLeft, Search, TrendingUp, Users, Package,
} from 'lucide-react';
import {
  Button, DataTable, EmptyState, Field, Input, PageHeader, PageSpinner, Panel, Spinner,
} from '../../components/ds';

// ---------------------------------------------------------------------------
// Helpers — unchanged from the legacy page
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

// Credit notes render as a negative, or an em-dash when there are none — the
// legacy `cn ? \`-${...}\` : '—'` shape, kept so a zero stays an em-dash
// rather than becoming "-₹0.00".
const creditNote = (cn, cur) => (cn ? `-${formatCurrency(cn, cur)}` : '—');

const NUM = { align: 'right', muted: true };
const MONEY_TONE = {
  cn:  'var(--a-ats)',    // purple-400 in the legacy palette
  net: 'var(--brand-ink)',
  avg: 'var(--info)',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InvoiceAnalysisV2() {
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

  // -------------------------------------------------------------------------
  // Column sets. Built per currency because every money cell needs it.
  // -------------------------------------------------------------------------
  const periodColumns = (cur) => [
    { key: 'year', header: 'Year', width: 80, render: (r) => <span style={{ color: 'var(--fg)' }}>{r.year}</span> },
    { key: 'month', header: 'Month', width: 90, render: (r) => <span style={{ color: 'var(--fg)' }}>{MONTH_NAMES[r.month - 1] || r.month}</span> },
    { key: 'invoiceCount', header: 'Invoice Count', ...NUM, render: (r) => formatNumber(r.invoiceCount) },
    { key: 'revenue', header: 'Revenue', ...NUM, render: (r) => formatCurrency(r.revenue, cur) },
    { key: 'creditNotes', header: 'Credit Notes', align: 'right',
      render: (r) => <span style={{ color: MONEY_TONE.cn }}>{creditNote(r.creditNotes || 0, cur)}</span> },
    { key: 'netRevenue', header: 'Net Revenue', align: 'right',
      render: (r) => {
        const cn = r.creditNotes || 0;
        const net = r.netRevenue ?? ((r.revenue || 0) - cn);
        return <span style={{ color: MONEY_TONE.net, fontWeight: 600 }}>{formatCurrency(net, cur)}</span>;
      } },
    { key: 'avgInvoice', header: 'Avg Invoice', align: 'right',
      render: (r) => {
        const avgInvoice = r.invoiceCount > 0 ? (r.revenue || 0) / r.invoiceCount : 0;
        return <span style={{ color: MONEY_TONE.avg }}>{formatCurrency(r.avgInvoice ?? avgInvoice, cur)}</span>;
      } },
  ];

  // Top Customers and Top Products differ only in the entity column and the
  // count column, so they share one builder — the money columns are identical
  // and must stay that way.
  const rankedColumns = (cur, entityKey, entityHeader, countKey, countHeader) => [
    { key: '_rank', header: '#', width: 44, muted: true, render: (_r, i) => i + 1 },
    { key: entityKey, header: entityHeader, wrap: true,
      render: (r) => <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{r[entityKey] || '-'}</span> },
    { key: countKey, header: countHeader, ...NUM, render: (r) => formatNumber(r[countKey]) },
    { key: 'revenue', header: 'Revenue', ...NUM, render: (r) => formatCurrency(r.revenue, cur) },
    { key: 'creditNotes', header: 'Credit Notes', align: 'right',
      render: (r) => <span style={{ color: MONEY_TONE.cn }}>{creditNote(r.creditNotes || 0, cur)}</span> },
    { key: 'netRevenue', header: 'Net Revenue', align: 'right',
      render: (r) => {
        const cn = r.creditNotes || 0;
        const net = r.netRevenue ?? ((r.revenue || 0) - cn);
        return <span style={{ color: MONEY_TONE.net, fontWeight: 600 }}>{formatCurrency(net, cur)}</span>;
      } },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Invoice Analysis"
        sub="Revenue trends, top customers, and top products"
        actions={
          <Button variant="ghost" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={16} />
          </Button>
        }
      />

      {/* Date range filter */}
      <Panel>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', gap: 16 }}>
          <Field label="From" style={{ flex: 1 }}>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" style={{ flex: 1 }}>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Button onClick={fetchReport} disabled={loading} iconLeft={loading ? <Spinner size={15} /> : <Search size={15} />}>
            Analyze
          </Button>
        </div>
      </Panel>

      {error && (
        <EmptyState tone="danger" title="Couldn't load invoice analysis">{error}</EmptyState>
      )}

      {/* Content — every section split per currency to prevent silent
          INR+USD mashups in revenue trends, top-customer rankings, etc. */}
      {loading && <PageSpinner minHeight="40vh" />}

      {!error && !loading && allCurrencies.length === 0 && (
        <Panel icon={<TrendingUp size={18} />} title="Revenue by Period" flush>
          <EmptyState compact icon={<TrendingUp size={20} />} title="No data for the selected period" />
        </Panel>
      )}

      {!error && !loading && allCurrencies.map((cur) => {
        const periodRows = revenueByPeriod.filter((r) => (r.currency || 'INR') === cur);
        const customerRows = customerGroups.find((g) => g.currency === cur)?.rows || [];
        const productRows = productGroups.find((g) => g.currency === cur)?.rows || [];
        const totalRev = periodRows.reduce((s, r) => s + (r.revenue || 0), 0);
        const totalCn = periodRows.reduce((s, r) => s + (r.creditNotes || 0), 0);
        const totalNet = periodRows.reduce((s, r) => s + (r.netRevenue ?? (r.revenue || 0) - (r.creditNotes || 0)), 0);
        const totalCount = periodRows.reduce((s, r) => s + (r.invoiceCount || 0), 0);

        return (
          <div key={cur} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ font: 'var(--t-micro)', letterSpacing: 'var(--tr-label)', textTransform: 'uppercase', color: 'var(--fg-2)', fontWeight: 600 }}>
              {cur}
            </h2>

            <Panel
              flush
              icon={<TrendingUp size={18} />}
              title="Revenue by Period"
              actions={<Count n={periodRows.length} />}
            >
              <DataTable
                columns={periodColumns(cur)}
                rows={periodRows}
                rowKey={(_r, i) => `${cur}-${i}`}
                resizable={false}
                stickyHeader={false}
                totals={periodRows.length > 0 ? {
                  year: 'Total',
                  invoiceCount: formatNumber(totalCount),
                  revenue: formatCurrency(totalRev, cur),
                  creditNotes: <span style={{ color: MONEY_TONE.cn }}>{creditNote(totalCn, cur)}</span>,
                  netRevenue: <span style={{ color: MONEY_TONE.net }}>{formatCurrency(totalNet, cur)}</span>,
                  avgInvoice: <span style={{ color: MONEY_TONE.avg }}>{formatCurrency(totalCount > 0 ? totalRev / totalCount : 0, cur)}</span>,
                } : null}
                empty={<EmptyState compact icon={<TrendingUp size={20} />} title={`No revenue data in ${cur}`} />}
              />
            </Panel>

            <Panel
              flush
              icon={<Users size={18} />}
              title="Top Customers"
              actions={<Count n={customerRows.length} />}
            >
              <DataTable
                columns={rankedColumns(cur, 'customerName', 'Customer', 'invoiceCount', 'Invoices')}
                rows={customerRows}
                rowKey={(row, i) => `${cur}-${row.customerId || i}`}
                resizable={false}
                stickyHeader={false}
                empty={<EmptyState compact icon={<Users size={20} />} title={`No customer data in ${cur}`} />}
              />
            </Panel>

            <Panel
              flush
              icon={<Package size={18} />}
              title="Top Products"
              actions={<Count n={productRows.length} />}
            >
              <DataTable
                columns={rankedColumns(cur, 'productName', 'Product', 'qtySold', 'Qty Sold')}
                rows={productRows}
                rowKey={(row, i) => `${cur}-${row.productId || i}`}
                resizable={false}
                stickyHeader={false}
                empty={<EmptyState compact icon={<Package size={20} />} title={`No product data in ${cur}`} />}
              />
            </Panel>
          </div>
        );
      })}
    </div>
  );
}

// Record count in a panel header.
function Count({ n }) {
  return (
    <span style={{ font: 'var(--t-small)', color: 'var(--fg-3)' }}>
      {n} record{n !== 1 ? 's' : ''}
    </span>
  );
}
