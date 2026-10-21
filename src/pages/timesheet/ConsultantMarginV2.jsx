// ============================================================================
// ConsultantMarginV2.jsx — per consultant, per month: what we invoiced the
// client vs what the person cost in payroll (2026-10-17).
//
// Backend: GET /invoicing/consultant-margin (same visibility as Profitability).
// Revenue = finalized invoice lines that name the consultant, in the invoice's
// service month (the Profitability rule). Cost = the person's payroll-run line.
// 2026-10-21: other currencies are converted to rupees at ECB daily market rates
// (payment date for paid invoices, invoice date otherwise — the Profitability
// rule; owner-set monthly rates are for incentives only). ONE company at a time
// — the company switcher decides. A sister company's figures for the same
// person are shown in the note, never added in (user decision 21 Oct).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { TrendingUp, Link2, Shield } from 'lucide-react';
import { PageHeader, Panel, Select, Chip, EmptyState, PageSpinner, Callout } from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";
const MONTH_LABEL = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function lastMonths(n) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (n - 1), 1));
  const f = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { from: f(start), to: f(end) };
}

const money = (bag) => {
  const entries = Object.entries(bag || {}).filter(([, v]) => Math.abs(v) >= 0.5);
  if (!entries.length) return '—';
  return entries.sort(([a], [b]) => (a === 'INR' ? -1 : b === 'INR' ? 1 : a.localeCompare(b)))
    .map(([cur, v]) => formatCurrency(v, cur)).join(' + ');
};

const shortCo = (name) => String(name || 'the other company').replace(/^Huemot Technology /, '');
const rateLabel = (f) => (f ? `₹${Number(f.rate).toLocaleString('en-IN', { maximumFractionDigits: 4 })}` : '');

function noteText(cell, costCurrency) {
  const base = noteBase(cell, costCurrency);
  // Same person on the other company's books: show its figures, never add them.
  const also = cell.sister && !['invoiced_by_sister', 'paid_by_sister'].includes(cell.note)
    ? `Also on ${shortCo(cell.sister.companyName)}'s books: ${money(cell.sister.revenue)} invoiced${cell.sister.cost ? `, ${formatCurrency(cell.sister.cost, costCurrency)} paid` : ''} (not included)` : '';
  return [base, also].filter(Boolean).join(' · ');
}

function noteBase(cell, costCurrency) {
  const at = cell.fx ? Object.entries(cell.fx).map(([k, f]) => (f?.rate ? `${k} at market rate (~${rateLabel(f)})` : `${k} at market rate`)).join(', ') : '';
  switch (cell.note) {
    case 'combined': return `Includes ${shortCo(cell.sister?.companyName)}: ${money(cell.sister?.external)} invoiced${cell.sister?.cost ? `, ${formatCurrency(cell.sister.cost, costCurrency)} paid` : ''}${at ? ` · ${at}` : ''}${cell.interCompany ? ` · inter-company ${money(cell.interCompany)} left out` : ''}`;
    case 'converted': return `Converted: ${at}${cell.interCompany ? ` · includes ${money(cell.interCompany)} billed to a Huemot company` : ''}`;
    case 'invoiced_by_sister': return `${shortCo(cell.sister?.companyName)} invoiced the client ${money(cell.sister?.revenue)}; this company has no invoice for the month, so no margin here`;
    case 'paid_by_sister': return `Paid by ${shortCo(cell.sister?.companyName)} (${formatCurrency(cell.sister?.cost || 0, costCurrency)}), not this company — no margin here`;
    case 'no_rate': return `No market exchange rate available for ${(cell.missingRates || []).join(', ')}`;
    case 'other_currency': return 'Billed in another currency — no margin without conversion';
    case 'not_invoiced': return 'Paid, but no invoice names this person this month';
    case 'no_client_project': return 'No client project this month';
    case 'not_invoiced_by_agreement': return 'Not invoiced to client (by agreement)';
    case 'no_payroll_cost': return 'Invoiced, but not in this month’s payroll';
    case 'no_payroll_run': return 'No payroll run in Rivvra for this company and month';
    default: return '';
  }
}

const th = { padding: '9px 12px', font: `600 11px/1.3 ${FONT}`, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', font: `450 13px/1.45 ${FONT}`, color: 'var(--fg-2)', borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
const num = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const sub = { font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 };

// Read-only: which market rate converted this month's foreign-currency invoices.
function RateBar({ month, rates }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-3, 14px)', background: 'var(--surface)', marginBottom: 14 }}>
      <div style={{ font: `600 12.5px/1.4 ${FONT}`, color: 'var(--fg)' }}>Exchange rates · {MONTH_LABEL(month)}</div>
      <div style={{ font: `450 12.5px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>
        {Object.entries(rates).map(([from, f]) => (f ? `1 ${from} ≈ ${rateLabel(f)} (ECB monthly average)` : `No market rate for ${from}`)).join(' · ')}
      </div>
      <div style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>
        Each invoice converts at the daily rate on its payment date (or invoice date if unpaid) — the same rule as Profitability.
      </div>
    </div>
  );
}

export default function ConsultantMarginV2() {
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;
  const [span, setSpan] = useState(6);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(null);
  const [sortBy, setSortBy] = useState('invoiced');

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    // No synchronous setState here (react-hooks/set-state-in-effect): the
    // previous figures stay on screen until the new ones arrive.
    invoicingApi.getConsultantMargin(orgSlug, lastMonths(span))
      .then((r) => {
        if (cancelled) return;
        if (!r?.success) throw new Error(r?.error || 'Failed to load');
        setError(null); setForbidden(false);
        setData(r);
        setMonth((m) => (m && r.months.includes(m) ? m : r.months[r.months.length - 1]));
      })
      .catch((e) => {
        if (cancelled) return;
        if (e?.status === 403 || /access/i.test(e?.message || '')) setForbidden(true);
        else setError(e?.message || 'Failed to load consultant margin');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug, span, currentCompany?._id]);

  const cur = data?.costCurrency || 'INR';
  const rows = useMemo(() => {
    if (!data || !month) return [];
    const list = data.rows.filter((r) => r.months[month]).map((r) => ({ ...r, cell: r.months[month] }));
    if (sortBy === 'margin') return list.sort((a, b) => (a.cell.marginPct ?? 1e9) - (b.cell.marginPct ?? 1e9));
    if (sortBy === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    // Rupee value first (converted where a rate exists), then anything still
    // unconverted by its own amount, then people with no invoice.
    const group = (r) => (r.cell.revenueConverted != null || r.cell.revenue?.[cur] ? 0 : Object.keys(r.cell.revenue || {}).length ? 1 : 2);
    const amount = (r) => (group(r) === 0 ? (r.cell.revenueConverted ?? r.cell.revenue[cur]) : group(r) === 1 ? Math.max(...Object.values(r.cell.revenue)) : r.cell.cost || 0);
    return list.sort((a, b) => group(a) - group(b) || amount(b) - amount(a));
  }, [data, month, sortBy, cur]);

  if (forbidden) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 760 }}>
        <EmptyState icon={<Shield size={22} />} tone="warn" title="No access to margins">
          Consultant margin shows billing and pay side by side, so it follows the Profitability rule: the org owner, or someone the owner has given Profitability access.
        </EmptyState>
      </div>
    );
  }
  if (loading && !data) return <PageSpinner label="Working out margins…" />;

  const totals = data?.monthTotals?.[month];
  const unlinked = data?.unlinked?.[month];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1200 }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} style={{ color: 'var(--brand)' }} />Consultant Margin</span>}
        sub={`What we invoiced for each person against what they cost in payroll, in rupees. Dollars are converted at daily market rates. One company at a time — switch company to see the other. ${data?.companyName ? `Company: ${data.companyName}.` : ''}`}
        actions={(
          <Select value={span} onChange={(e) => setSpan(Number(e.target.value))} aria-label="Period" style={{ width: 'auto' }}>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </Select>
        )}
        style={{ marginBottom: 14 }}
      />
      {error && <Callout tone="danger" style={{ marginBottom: 14 }}>{error}</Callout>}

      {data && (
        <>
          {/* Month strip — click to see that month's people */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
            {data.months.map((m) => {
              const t = data.monthTotals[m];
              const active = m === month;
              const noPayroll = !data.payrollMonths.includes(m);
              return (
                <button key={m} type="button" onClick={() => setMonth(m)}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r-3, 14px)', cursor: 'pointer',
                    background: active ? 'var(--brand-soft, var(--surface-2))' : 'var(--surface)', border: `1px solid ${active ? 'var(--brand)' : 'var(--line)'}` }}>
                  <div style={{ font: `600 12px/1.3 ${FONT}`, color: 'var(--fg)' }}>{MONTH_LABEL(m)}</div>
                  <div style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 4 }}>Invoiced by this company {money(t.revenue)}</div>
                  <div style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>{noPayroll ? 'No payroll in Rivvra' : `Payroll ${formatCurrency(t.cost, cur)}`}</div>
                  {!noPayroll && <div style={{ font: `600 11.5px/1.5 ${FONT}`, color: t.margin >= 0 ? 'var(--brand-ink, var(--brand))' : 'var(--danger)' }}>Margin {formatCurrency(t.margin, cur)}{t.marginRevenue ? ` (${((t.margin / t.marginRevenue) * 100).toFixed(1)}%)` : ''}</div>}
                  {!noPayroll && t.marginRevenue > 0 && <div style={{ font: `450 11px/1.45 ${FONT}`, color: 'var(--fg-4)' }}>on {formatCurrency(t.marginRevenue, cur)} invoiced</div>}
                </button>
              );
            })}
          </div>

          {month && Object.keys(data.monthRates?.[month] || {}).length > 0 && (
            <RateBar month={month} rates={data.monthRates[month]} />
          )}

          <Panel flush title={`${month ? MONTH_LABEL(month) : ''} — ${rows.length} people`}
            actions={(
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort" style={{ width: 'auto', height: 30 }}>
                <option value="invoiced">Sort: invoiced</option>
                <option value="margin">Sort: lowest margin first</option>
                <option value="name">Sort: name</option>
              </Select>
            )}>
            {rows.length === 0 ? (
              <div style={{ padding: 18 }}><EmptyState title="Nothing for this month">No invoice names a consultant and nobody on a client assignment was paid.</EmptyState></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={th}>Person</th>
                      <th style={{ ...th, textAlign: 'right' }}>Invoiced (before GST)</th>
                      <th style={{ ...th, textAlign: 'right' }}>Payroll cost</th>
                      <th style={{ ...th, textAlign: 'right' }}>Margin</th>
                      <th style={{ ...th, textAlign: 'right' }}>Margin %</th>
                      <th style={th}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = r.cell;
                      const pct = c.marginPct;
                      return (
                        <tr key={r.employeeId}>
                          <td style={td}>
                            <div style={{ color: 'var(--fg)', fontWeight: 550 }}>{r.name}</div>
                            <div style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>{r.clients.slice(0, 2).join(', ')}{r.clients.length > 2 ? ` +${r.clients.length - 2}` : ''}</div>
                            {r.sister && (
                              <span title={`Same person in ${r.sister.companyName}: ${r.sister.names.join(', ')}`} style={{ display: 'inline-block', marginTop: 4 }}>
                                <Chip tone="info"><Link2 size={10} /> {r.sister.companyName.replace(/^Huemot Technology /, '')}</Chip>
                              </span>
                            )}
                          </td>
                          <td style={num}>
                            {money(c.revenue)}
                            {c.note === 'combined' && Object.keys(c.sister?.external || {}).length > 0 && <div style={sub}>+ {shortCo(c.sister.companyName)} {money(c.sister.external)}</div>}
                            {c.interCompany && c.note === 'combined' && <div style={sub}>− inter-company {money(c.interCompany)}</div>}
                            {c.revenueConverted != null && (c.fx || c.note === 'combined') && <div style={{ ...sub, color: 'var(--fg-2)', fontWeight: 550 }}>= {formatCurrency(c.revenueConverted, cur)}</div>}
                          </td>
                          <td style={num}>
                            {c.cost ? formatCurrency(c.cost, cur) : '—'}
                            {c.costRecovered?.amount > 0 && (
                              <div style={sub} title={(c.costRecovered.labels || []).join('\n')}>after {formatCurrency(c.costRecovered.amount, cur)} recovered</div>
                            )}
                            {c.note === 'combined' && c.sister?.cost > 0 && <div style={sub}>+ {shortCo(c.sister.companyName)} {formatCurrency(c.sister.cost, cur)}</div>}
                          </td>
                          <td style={{ ...num, color: c.margin == null ? 'var(--fg-4)' : c.margin < 0 ? 'var(--danger)' : 'var(--fg)' }}>{c.margin == null ? '—' : formatCurrency(c.margin, cur)}</td>
                          <td style={{ ...num, color: pct == null ? 'var(--fg-4)' : pct < 15 ? 'var(--danger)' : pct < 30 ? 'var(--warn)' : 'var(--fg)', fontWeight: pct == null ? 400 : 600 }}>{pct == null ? '—' : `${pct.toFixed(1)}%`}</td>
                          <td style={{ ...td, font: `450 12px/1.45 ${FONT}`, color: c.note === 'not_invoiced' ? 'var(--danger)' : 'var(--fg-3)', maxWidth: 280 }}>{noteText(c, cur)}</td>
                        </tr>
                      );
                    })}
                    {unlinked && Object.keys(unlinked).length > 0 && (
                      <tr>
                        <td style={{ ...td, fontStyle: 'italic' }}>Invoice lines that name no consultant</td>
                        <td style={num}>{money(unlinked)}</td>
                        <td style={num}>—</td><td style={num}>—</td><td style={num}>—</td>
                        <td style={{ ...td, font: `450 12px/1.45 ${FONT}`, color: 'var(--fg-3)' }}>Add the consultant on these invoice lines to see their margin</td>
                      </tr>
                    )}
                    {totals && (
                      <tr>
                        <td style={{ ...td, fontWeight: 650, color: 'var(--fg)' }}>Total</td>
                        <td style={{ ...num, fontWeight: 650, color: 'var(--fg)' }}>{money(totals.revenue)}</td>
                        <td style={{ ...num, fontWeight: 650, color: 'var(--fg)' }}>{formatCurrency(totals.cost, cur)}</td>
                        <td style={{ ...num, fontWeight: 650, color: totals.margin < 0 ? 'var(--danger)' : 'var(--fg)' }}>{formatCurrency(totals.margin, cur)}</td>
                        <td style={num}></td>
                        <td style={{ ...td, font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)' }}>{totals.marginRevenue ? `Margin on ${formatCurrency(totals.marginRevenue, cur)} invoiced against ${formatCurrency(totals.marginCost, cur)} cost, where both are known — this company only, converted at market rates` : 'Margin total covers people whose invoice and pay are both known'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-4)', margin: '12px 2px 0' }}>
            Invoiced = finalized invoices before GST (credit notes subtract), counted in the month the work was done, the same rule as Profitability. Payroll cost = the person’s line in that month’s payroll run: gross pay including bonuses, allowances and incentives, plus employer PF/ESI where the company pays it on top, minus money recovered from the person that month (overpayment, salary or incentive recoveries — not repayments of advances or expenses).
          </p>
        </>
      )}
    </div>
  );
}
