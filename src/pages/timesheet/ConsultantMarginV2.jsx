// ============================================================================
// ConsultantMarginV2.jsx — per consultant, per month: what we invoiced the
// client vs what the person cost in payroll (2026-10-17).
//
// Backend: GET /invoicing/consultant-margin (same visibility as Profitability).
// Revenue = finalized invoice lines that name the consultant, in the invoice's
// service month (the Profitability rule). Cost = the person's payroll-run line.
// No currency conversion: rupees and dollars are shown separately and a margin
// is only computed when everything for that month is in rupees. Huemot Inc
// invoices some people whom Pvt Ltd pays — those rows show the other company's
// figures beside this company's, never added in.
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

function noteText(cell, costCurrency) {
  switch (cell.note) {
    case 'other_currency': return 'Billed in another currency — no margin without conversion';
    case 'not_invoiced': return 'Paid, but no invoice names this person this month';
    case 'no_payroll_cost': return 'Invoiced, but not in this month’s payroll';
    case 'no_payroll_run': return 'No payroll run in Rivvra for this company and month';
    case 'invoiced_by_sister': return `Invoiced by ${cell.sister?.companyName || 'the other company'}: ${money(cell.sister?.revenue)}`;
    case 'paid_by_sister': return `Paid by ${cell.sister?.companyName || 'the other company'}: ${formatCurrency(cell.sister?.cost || 0, costCurrency)}`;
    default: return cell.sister ? `Also: ${cell.sister.companyName} ${money(cell.sister.revenue)}${cell.sister.cost ? `, paid ${formatCurrency(cell.sister.cost, costCurrency)}` : ''}` : '';
  }
}

const th = { padding: '9px 12px', font: `600 11px/1.3 ${FONT}`, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', font: `450 13px/1.45 ${FONT}`, color: 'var(--fg-2)', borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
const num = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

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
    const inv = (r) => (r.cell.revenue?.[cur] || 0) + (r.cell.revenue?.USD || 0) * 1000; // rank only, never displayed
    if (sortBy === 'margin') return list.sort((a, b) => (a.cell.marginPct ?? 1e9) - (b.cell.marginPct ?? 1e9));
    if (sortBy === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => inv(b) - inv(a));
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
        sub={`What we invoiced for each person against what they cost in payroll. Rupees and dollars are kept separate — nothing is converted. ${data?.companyName ? `Company: ${data.companyName}.` : ''}`}
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
                  <div style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 4 }}>Invoiced {money(t.revenue)}</div>
                  <div style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>{noPayroll ? 'No payroll in Rivvra' : `Payroll ${formatCurrency(t.cost, cur)}`}</div>
                  {!noPayroll && <div style={{ font: `600 11.5px/1.5 ${FONT}`, color: t.margin >= 0 ? 'var(--brand-ink, var(--brand))' : 'var(--danger)' }}>Rupee margin {formatCurrency(t.margin, cur)}</div>}
                </button>
              );
            })}
          </div>

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
                      <th style={{ ...th, textAlign: 'right' }}>Invoiced</th>
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
                          <td style={num}>{money(c.revenue)}</td>
                          <td style={num}>{c.cost ? formatCurrency(c.cost, cur) : '—'}</td>
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
                        <td style={{ ...td, font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)' }}>Margin total covers rupee-billed people and paid-but-not-invoiced months only</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-4)', margin: '12px 2px 0' }}>
            Invoiced = finalized invoices (credit notes subtract), counted in the month the work was done, the same rule as Profitability. Payroll cost = the person’s line in that month’s payroll run: gross pay for consultants, full cost-to-company for employees.
          </p>
        </>
      )}
    </div>
  );
}
