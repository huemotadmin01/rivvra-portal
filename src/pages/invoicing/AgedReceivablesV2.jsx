// ============================================================================
// AgedReceivablesV2.jsx — Aged AR on ds (phase 14, invoicing money pass)
// ============================================================================
// Copied from AgedReceivables.jsx. This is a money surface, so the rule for
// this pass is narrower than the usual migration: NOTHING above `return (`
// changed. The fetch, the per-currency grouping, the customer projection and
// the descending-by-total sort are byte-identical to the legacy file — verified
// by diff, not by eye. Only presentation moved to ds.
//
// The aging buckets keep their semantic colours (current → 90+ reads as a
// severity ramp, and that ramp IS the report). They now come from the status
// tokens rather than raw Tailwind, so they survive the light theme.
//
// The totals row uses the ds `DataTable` `totals` prop added in this phase —
// keyed by column key, so a column reorder can't slide a total under the wrong
// header. Every remaining invoicing report needs the same primitive.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { ArrowLeft, Users } from 'lucide-react';
import {
  Button, DataTable, EmptyState, PageHeader, PageSpinner, Panel,
} from '../../components/ds';

// The aging ramp. `tint` is the card background, `ink` the figure — both from
// status tokens so the ramp holds in both themes. 61-90 and 90+ deliberately
// share the danger tone, exactly as the legacy page did (both were red-400).
const BUCKETS = [
  { key: 'current',    label: 'Current',    col: 'Current', tone: 'ok'   },
  { key: 'days1to30',  label: '1-30 Days',  col: '1-30',    tone: 'warn' },
  { key: 'days31to60', label: '31-60 Days', col: '31-60',   tone: 'attn' },
  { key: 'days61to90', label: '61-90 Days', col: '61-90',   tone: 'bad'  },
  { key: 'days90plus', label: '90+ Days',   col: '90+',     tone: 'bad'  },
];

// Ink is the *-ink alias (which the light theme darkens for AA on a tint),
// tint the *-soft fill. The card border reuses the same soft tint at full
// strength rather than inventing a -line token per tone.
const TONE = {
  ok:   { ink: 'var(--brand-ink)', tint: 'var(--brand-soft)',  line: 'var(--brand-line)' },
  warn: { ink: 'var(--warn-ink)',  tint: 'var(--warn-soft)',   line: 'var(--warn-soft)' },
  attn: { ink: 'var(--attn-ink)',  tint: 'var(--attn-soft)',   line: 'var(--attn-soft)' },
  bad:  { ink: 'var(--danger)',    tint: 'var(--danger-soft)', line: 'var(--danger-glow)' },
  info: { ink: 'var(--info)',      tint: 'var(--info-soft)',   line: 'var(--info-soft)' },
};

function AgingCard({ label, amount, tone, currency }) {
  const t = TONE[tone] || TONE.info;
  return (
    <div
      style={{
        borderRadius: 'var(--r-3, 14px)', padding: 20,
        background: t.tint, border: `1px solid ${t.line}`, color: t.ink,
      }}
    >
      <span style={{ font: 'var(--t-micro)', letterSpacing: 'var(--tr-label)', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
      <p style={{ font: '700 24px/1.2 var(--font)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        {formatCurrency(amount, currency)}
      </p>
    </div>
  );
}

// One full aging block (summary cards + customer breakdown table) for a
// single currency. The page renders one block per currency, so an INR-heavy
// AR ledger and a USD-heavy ledger live side-by-side without ever being
// summed into a misleading single total.
function CurrencyBlock({ currency, summary, customers, isMobile }) {
  const money = (v) => formatCurrency(v, currency);

  const columns = [
    { key: 'customerName', header: 'Customer Name', wrap: true,
      render: (r) => r.customerName || '-' },
    ...BUCKETS.map((b) => ({
      key: b.key,
      header: b.col,
      align: 'right',
      render: (r) => <span style={{ color: TONE[b.tone].ink }}>{money(r[b.key])}</span>,
    })),
    { key: 'total', header: 'Total', align: 'right',
      render: (r) => <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{money(r.total)}</span> },
  ];

  const totals = {
    customerName: 'Total',
    ...Object.fromEntries(BUCKETS.map((b) => [
      b.key, <span style={{ color: TONE[b.tone].ink }}>{money(summary[b.key])}</span>,
    ])),
    total: money(summary.total),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ font: 'var(--t-micro)', letterSpacing: 'var(--tr-label)', textTransform: 'uppercase', color: 'var(--fg-2)', fontWeight: 600 }}>
        {currency}
      </h2>

      {/* auto-fit + minmax(0,…) rather than a fixed 6 columns: a lakh-scale
            figure at 24px is wider than a sixth of the container, and `1fr`
            floors at the content width, so fixed columns pushed the 90+ and
            Total cards off-screen. Wrapping to a second row is the correct
            failure here — a clipped money figure is not. */}
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {BUCKETS.map((b) => (
          <AgingCard key={b.key} label={b.label} amount={summary[b.key]} tone={b.tone} currency={currency} />
        ))}
        <AgingCard label="Total" amount={summary.total} tone="info" currency={currency} />
      </div>

      <Panel
        flush
        icon={<Users size={18} />}
        title="Customer Breakdown"
        actions={
          <span style={{ font: 'var(--t-small)', color: 'var(--fg-3)' }}>
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </span>
        }
      >
        <DataTable
          columns={columns}
          rows={customers}
          /* The row index is part of the key on purpose. This report can
             legitimately return TWO rows for the same customerId: invoices
             carry a denormalised counterparty name and the aggregation
             groups by name as well as id, so a renamed counterparty
             splits into two rows sharing one id. Keying on id alone
             collided, and React warns that duplicate keys may omit or
             duplicate children.

             Observed live on staging: customer 69e3e771f6e20f6d943fb5b8
             rendered as both "…Fufec" (₹790,634.50) and "…Fufeco"
             (₹637,757.76) — one counterparty, ₹14.28L split in two.

             This makes the RENDER correct. It deliberately does NOT
             merge the rows: that would change a money figure, and the
             split is real data. See REDESIGN.md. */
          rowKey={(row, i) => `${row.customerId || 'x'}-${currency}-${i}`}
          totals={customers.length > 0 ? totals : null}
          resizable={false}
          stickyHeader={false}
          empty={
            <EmptyState
              compact
              icon={<Users size={20} />}
              title={`No outstanding receivables in ${currency}`}
            />
          }
        />
      </Panel>
    </div>
  );
}

export default function AgedReceivablesV2() {
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

  if (loading) return <PageSpinner />;

  if (error) {
    return (
      <EmptyState
        tone="danger"
        title="Couldn't load aged receivables"
        actions={<Button onClick={() => navigate(-1)}>Go back</Button>}
      >
        {error}
      </EmptyState>
    );
  }

  const summaryByCurrency = Array.isArray(data?.summary?.byCurrency) ? data.summary.byCurrency : [];
  const allCustomers = Array.isArray(data?.byCustomer) ? data.byCustomer : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Aged Receivables"
        sub="Outstanding customer invoices grouped by aging period"
        actions={
          <Button variant="ghost" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={16} />
          </Button>
        }
      />

      {summaryByCurrency.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No outstanding receivables" />
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
  );
}
