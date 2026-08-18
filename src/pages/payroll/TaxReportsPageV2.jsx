import { Fragment, useState, useEffect, useRef } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { usePeriod } from '../../context/PeriodContext';
import { getStatutoryConfigs, getEmployeeTaxReport } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import {
  BarChart3, Search, ChevronDown, ChevronUp, Loader2, AlertTriangle, RefreshCw,
  TrendingUp, TrendingDown, IndianRupee, Calendar, ArrowRightLeft,
} from 'lucide-react';
import {
  PageHeader, Panel, Button, Input, Modal, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Admin tax reports — the per-employee twin of MyTaxReportPage (#79). Every
// figure comes from the server; this page only formats and signs them, so
// everything above `return (` is spliced in verbatim, including the request
// ticket that stops a stale fetch writing another employee's numbers into the
// shared slot.
//
// NOTE FOR THE ESS TWIN: this page has ALREADY fixed both findings raised
// against MyTaxReportPage in #79. Its standard-deduction row carries no
// "(₹75K/₹50K)" caption and its cess row carries no "(4%)", each with a comment
// explaining that the figure is FY-configurable and a hardcoded caption could
// disagree with the number in the next column. Those comments are carried
// across unchanged — they are the worked answer for fixing the ESS page.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Legacy's per-card Tailwind inks, as tokens. Same hues, same meanings. */
const INK = {
  plain: 'var(--fg)',
  good: 'var(--acc-emerald)',
  bad: 'var(--danger)',
  paid: 'var(--acc-blue)',
  due: 'var(--acc-amber)',
};

function TaxRow({ label, value, bold, negative, sub, highlight, color }) {
  const absVal = Math.abs(value || 0);
  const textColor = color || (negative ? INK.bad : INK.plain);
  return (
    <tr style={{ borderBottom: '1px solid var(--line-2)', background: highlight ? 'var(--surface-2)' : 'transparent' }}>
      <td style={{
        padding: '8px 0',
        paddingLeft: sub ? 24 : 0,
        font: sub ? "400 11.5px/1.3 'Inter', system-ui, sans-serif" : "400 13px/1.4 'Inter', system-ui, sans-serif",
        fontWeight: bold ? 600 : 400,
        color: sub ? 'var(--fg-4)' : bold ? 'var(--fg)' : 'var(--fg-3)',
      }}>{label}</td>
      <td style={{
        padding: '8px 0', textAlign: 'right', color: textColor,
        fontWeight: bold ? 700 : 500, fontVariantNumeric: 'tabular-nums',
      }}>
        {negative ? '-' : ''}{formatMoney(absVal)}
      </td>
    </tr>
  );
}

/** Compact figure tile, used by the expanded row and the full-report dialog. */
function SummaryCard({ label, value, color, Icon }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', padding: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {Icon && <Icon size={12} />} {label}
      </div>
      <div style={{ font: "700 15px/1.2 'Inter', system-ui, sans-serif", color, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(value)}
      </div>
    </div>
  );
}

export default function TaxReportsPageV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { fyApi: fy } = usePeriod();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [taxReport, setTaxReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [fullReportEmp, setFullReportEmp] = useState(null);
  // A failed load used to fall through to the same "No employees found." as a
  // genuinely empty company, so an admin could not tell an outage from an empty
  // list. Tracked separately for the list and for the expanded row.
  const [loadError, setLoadError] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // `taxReport` is a single shared slot. Rapidly expanding two rows fired two
  // overlapping fetches and whichever resolved last won — employee A's numbers
  // could land under employee B. Every fetch takes a ticket; only the newest
  // one is allowed to write state.
  const reqIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setEmployees([]);
      setExpandedEmp(null);
      setTaxReport(null);
      setLoadError(false);
      try {
        const res = await getStatutoryConfigs(orgSlug);
        setEmployees((res.data || []).map(d => d.employee));
      } catch {
        setLoadError(true);
        showToast('Failed to load employees', 'error');
      }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, reloadKey]);

  /** Fetch a report into the shared slot, discarding any stale response. */
  const fetchReport = async (empId) => {
    const reqId = ++reqIdRef.current;
    setReportLoading(true);
    setTaxReport(null);
    setReportError(false);
    try {
      const res = await getEmployeeTaxReport(orgSlug, empId, fy);
      if (reqIdRef.current !== reqId) return; // superseded — do not write
      setTaxReport(res.report);
    } catch {
      if (reqIdRef.current !== reqId) return;
      setTaxReport(null);
      setReportError(true);
    } finally {
      if (reqIdRef.current === reqId) setReportLoading(false);
    }
  };

  const toggleReport = async (empId) => {
    if (expandedEmp === empId) {
      reqIdRef.current++; // invalidate any in-flight fetch for this row
      setExpandedEmp(null);
      setTaxReport(null);
      setReportLoading(false);
      setReportError(false);
      return;
    }
    setExpandedEmp(empId);
    await fetchReport(empId);
  };

  // Re-fetch report when FY changes (if an employee is expanded)
  useEffect(() => {
    if (!expandedEmp) return;
    fetchReport(expandedEmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const confirmedEmployees = employees.filter(e => e.employmentType === 'confirmed' && e.status !== 'separated');
  const filtered = confirmedEmployees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.fullName || e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q);
  });

  if (loading) return <PageSpinner label="Loading tax reports…" />;

  const th = { padding: '10px 12px', textAlign: 'right', font: "500 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' };
  const num = { padding: '10px 12px', textAlign: 'right', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", fontVariantNumeric: 'tabular-nums' };

  /** Card set shared by the expanded row and the dialog; labels differ slightly
   *  between the two in legacy, so each caller passes its own. */
  const cardsFor = (r, long) => [
    { label: long ? 'Gross Annual Income' : 'Gross Annual', value: r.grossAnnualIncome, color: INK.plain, Icon: TrendingUp },
    { label: 'Total Deductions', value: r.totalDeductions, color: INK.good, Icon: TrendingDown },
    { label: 'Taxable Income', value: r.taxableIncome, color: INK.plain, Icon: IndianRupee },
    { label: long ? 'Total Tax Liability' : 'Total Tax', value: r.totalTax, color: INK.bad, Icon: IndianRupee },
    { label: 'YTD TDS Paid', value: r.ytdTdsPaid, color: INK.paid, Icon: Calendar },
    { label: 'Remaining Tax', value: r.remainingTax, color: r.remainingTax > 0 ? INK.due : INK.good, Icon: IndianRupee },
  ];

  const regimeAndTds = (r, big) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', padding: 12 }}>
        <div style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {big ? 'Current Regime' : 'Regime'}
        </div>
        <div style={{ font: `700 ${big ? 17 : 14}px/1.2 'Inter', system-ui, sans-serif`, color: 'var(--fg)', marginTop: 4, textTransform: 'capitalize' }}>
          {r.regime} Regime
        </div>
        <div style={{ font: "400 10.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
          {big ? 'Standard Deduction: ' : 'Std Deduction: '}{formatMoney(r.standardDeduction)}
        </div>
      </div>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', padding: 12 }}>
        <div style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Est. Monthly TDS</div>
        <div style={{ font: `700 ${big ? 17 : 14}px/1.2 'Inter', system-ui, sans-serif`, color: 'var(--fg)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(r.estimatedMonthlyTds)}
        </div>
        <div style={{ font: "400 10.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
          {r.monthsProcessed}{big ? ' months processed' : ' processed'} • {r.monthsRemaining} remaining
        </div>
      </div>
      {!big && r.comparison && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', padding: 12 }}>
          <div style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Regime Comparison</div>
          <div style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginTop: 5 }}>
            Old: {formatMoney(r.comparison.oldRegime.totalTax)} | New: {formatMoney(r.comparison.newRegime.totalTax)}
          </div>
          <div style={{ font: "500 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', marginTop: 3 }}>
            {r.comparison.betterRegime === 'old' ? 'Old' : 'New'} saves {formatMoney(r.comparison.savings)}
          </div>
        </div>
      )}
    </div>
  );

  /**
   * The two monthly tables are NOT the same table. The compact one in the
   * expanded row has three columns; the one in the full report adds a running
   * `cumTds` column, which is a figure the payload does not carry — it only
   * exists because this component accumulates it. `cumulative` keeps that
   * column, and its accumulator, exclusive to the full report.
   */
  const monthlyTable = (r, cumulative) => {
    let cumTds = 0;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: cumulative ? 440 : 360, borderCollapse: 'collapse', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
              {[['Month', 'left'], ['Gross', 'right'], ['TDS', 'right'], ...(cumulative ? [['Cumulative TDS', 'right']] : [])].map(([h, a]) => (
                <th key={h} style={{ textAlign: a, padding: '6px 12px', font: "500 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.monthlyBreakdown.map((m, i) => {
              cumTds += m.tds || 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--fg-3)' }}>
                    {MONTH_NAMES[m.month]} {m.year}
                    {/* The report sets `source: 'imported'` (payroll.js ~4547);
                        the originating system isn't carried through, so this
                        said "GreytHR" on faith. Say what we actually know. */}
                    {m.source === 'imported' && (
                      <span
                        style={{ marginLeft: 6, font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}
                        title="Carried over from imported payslip data, not processed in a Rivvra payroll run"
                      >
                        Imported
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(m.gross)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: INK.bad, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(m.tds)}</td>
                  {cumulative && (
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: INK.paid, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cumTds)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} style={{ color: 'var(--brand-ink)' }} /> Tax Reports</span>}
        sub={`Income tax summary & detailed computation per employee — FY ${fy}`}
        actions={(
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
            <Input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..." aria-label="Search employee" style={{ paddingLeft: 30 }} />
          </div>
        )}
      />

      <Panel flush>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Employee</th>
                <th style={th}>Gross Annual</th>
                <th style={th}>Total Tax</th>
                <th style={th}>YTD TDS</th>
                <th style={th}>Remaining</th>
                <th style={{ width: 32, padding: '10px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const empId = emp._id.toString();
                const isExpanded = expandedEmp === empId;
                const r = isExpanded ? taxReport : null;
                return (
                  <Fragment key={empId}>
                    <tr
                      onClick={() => toggleReport(empId)}
                      style={{
                        borderBottom: '1px solid var(--line-2)', cursor: 'pointer',
                        background: isExpanded ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ font: "600 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                          {emp.fullName || emp.name || emp.email}
                        </div>
                        <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{emp.email}</div>
                      </td>
                      <td style={{ ...num, color: 'var(--fg-2)' }}>{r ? formatMoney(r.grossAnnualIncome) : '—'}</td>
                      <td style={{ ...num, color: INK.bad }}>{r ? formatMoney(r.totalTax) : '—'}</td>
                      <td style={{ ...num, color: INK.paid }}>{r ? formatMoney(r.ytdTdsPaid) : '—'}</td>
                      <td style={num}>
                        {r ? (
                          <span style={{ color: r.remainingTax > 0 ? INK.due : INK.good }}>{formatMoney(r.remainingTax)}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {isExpanded
                          ? <ChevronUp size={14} style={{ color: 'var(--fg-4)' }} />
                          : <ChevronDown size={14} style={{ color: 'var(--fg-4)' }} />}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--line-2)' }}>
                          <div style={{ background: 'var(--bg)', padding: 18 }}>
                            {reportLoading ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '22px 0', font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                                <Loader2 size={16} className="animate-spin" /> Loading tax report...
                              </div>
                            ) : reportError ? (
                              <div style={{ padding: '22px 0', textAlign: 'center' }}>
                                <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, font: "400 13px/1 'Inter', system-ui, sans-serif", color: INK.bad, margin: 0 }}>
                                  <AlertTriangle size={14} /> Couldn’t load this tax report.
                                </p>
                                <div style={{ marginTop: 10 }}>
                                  <Button variant="ghost" size="sm" iconLeft={<RefreshCw size={12} />}
                                    onClick={(e) => { e.stopPropagation(); fetchReport(empId); }}>
                                    Retry
                                  </Button>
                                </div>
                              </div>
                            ) : !taxReport ? (
                              <div style={{ textAlign: 'center', padding: '22px 0' }}>
                                <p style={{ font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>No tax data for FY {fy}.</p>
                                <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
                                  Nothing has been processed for this employee in this financial year yet.
                                </p>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                                  {cardsFor(taxReport, false).map(c => (
                                    <SummaryCard key={c.label} label={c.label} value={c.value} color={c.color} />
                                  ))}
                                </div>

                                {regimeAndTds(taxReport, false)}

                                {taxReport.monthlyBreakdown?.length > 0 && (
                                  <Panel flush>
                                    <div style={{ padding: '10px 12px', font: "600 12px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', borderBottom: '1px solid var(--line-2)' }}>
                                      Monthly Breakdown
                                    </div>
                                    {monthlyTable(taxReport)}
                                  </Panel>
                                )}

                                <div>
                                  <Button size="sm" variant="secondary" iconLeft={<BarChart3 size={14} />}
                                    onClick={(e) => { e.stopPropagation(); setFullReportEmp(emp); }}>
                                    View Full Tax Report
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Three distinct states, kept distinct: the request failed, the company
            genuinely has no confirmed employees, or the search matched none.
            Collapsing them is what the legacy page was fixed for. */}
        {filtered.length === 0 && (
          loadError ? (
            <EmptyState
              icon={<AlertTriangle size={22} />}
              title="Couldn’t load employees."
              actions={<Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} />} onClick={() => setReloadKey(k => k + 1)}>Retry</Button>}
            >
              {"This is not an empty company — the request failed."}
            </EmptyState>
          ) : confirmedEmployees.length === 0 ? (
            <EmptyState title="No confirmed employees in this company yet." />
          ) : (
            <EmptyState
              title={`No employees match “${search}”.`}
              actions={<Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
            />
          )
        )}
      </Panel>

      {/* ── Full tax report ── */}
      <Modal
        open={!!(fullReportEmp && taxReport)}
        onClose={() => setFullReportEmp(null)}
        size="lg"
        icon={<BarChart3 size={18} />}
        title="Income Tax Report"
        sub={fullReportEmp ? `${fullReportEmp.fullName || fullReportEmp.name || fullReportEmp.email} — FY ${fy}` : undefined}
      >
        {fullReportEmp && taxReport && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {cardsFor(taxReport, true).map(c => (
                <SummaryCard key={c.label} label={c.label} value={c.value} color={c.color} Icon={c.Icon} />
              ))}
            </div>

            {regimeAndTds(taxReport, true)}

            {taxReport.comparison && (
              <Panel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 12 }}>
                  <ArrowRightLeft size={14} /> Regime Comparison
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  {[
                    ['new', 'New Regime', taxReport.comparison.newRegime],
                    ['old', 'Old Regime', taxReport.comparison.oldRegime],
                  ].map(([key, label, side]) => {
                    const better = taxReport.comparison.betterRegime === key;
                    return (
                      <div key={key} style={{
                        padding: 12, borderRadius: 'var(--r-2)',
                        border: `1px solid ${better ? 'var(--brand-line)' : 'var(--line-2)'}`,
                        background: better ? 'var(--brand-soft)' : 'var(--surface-2)',
                      }}>
                        <div style={{ font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</div>
                        <div style={{ font: "700 17px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(side.totalTax)}
                        </div>
                        <div style={{ font: "400 10.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
                          Taxable: {formatMoney(side.taxableIncome)}
                        </div>
                        {/* Legacy set this line in green ON a green wash — an
                            accent ink on a tint of itself, the pairing that
                            fails contrast every time it appears. The tint and
                            border already say "better"; the text stays --fg. */}
                        {better && (
                          <span style={{ display: 'inline-block', marginTop: 5, font: "500 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                            ✓ Better by {formatMoney(taxReport.comparison.savings)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* Detailed computation */}
            <Panel flush>
              <div style={{ padding: '12px 14px', font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', borderBottom: '1px solid var(--line-2)' }}>
                Detailed Tax Computation
              </div>
              <div style={{ padding: '4px 14px 14px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', font: "400 13px/1.4 'Inter', system-ui, sans-serif" }}>
                  <tbody>
                    <TaxRow label="Gross Annual Income" value={taxReport.grossAnnualIncome} />
                    {/* The label used to hardcode "₹75K / ₹50K" from the
                        regime, but the standard deduction is an FY-configurable
                        amount (fyStatutoryConfig) — so the caption could
                        disagree with the figure in the very next column. The
                        real amount is already shown; don't restate it wrongly. */}
                    <TaxRow label="Less: Standard Deduction" value={-taxReport.standardDeduction} negative />

                    {taxReport.regime === 'old' && taxReport.totalDeductions > 0 && (
                      <>
                        <tr><td colSpan={2} style={{ paddingTop: 14, paddingBottom: 4, font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Deductions</td></tr>
                        {taxReport.declarations?.section80CTotal > 0 && <TaxRow label="  Section 80C" value={-taxReport.declarations.section80CTotal} negative sub />}
                        {taxReport.declarations?.section80DTotal > 0 && <TaxRow label="  Section 80D" value={-taxReport.declarations.section80DTotal} negative sub />}
                        {Number(taxReport.declarations?.section80E) > 0 && <TaxRow label="  Section 80E" value={-Number(taxReport.declarations.section80E)} negative sub />}
                        {Number(taxReport.declarations?.section80G) > 0 && <TaxRow label="  Section 80G" value={-Number(taxReport.declarations.section80G)} negative sub />}
                        {Number(taxReport.declarations?.section24b) > 0 && <TaxRow label="  Section 24(b)" value={-Number(taxReport.declarations.section24b)} negative sub />}
                        {taxReport.hraExemption > 0 && <TaxRow label="  HRA Exemption" value={-taxReport.hraExemption} negative sub />}
                      </>
                    )}

                    <TaxRow label="Taxable Income" value={taxReport.taxableIncome} bold />

                    <tr><td colSpan={2} style={{ paddingTop: 16, paddingBottom: 4, font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tax Slab Breakdown</td></tr>
                    {(taxReport.slabBreakdown || []).map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <td style={{ padding: '6px 0', paddingLeft: 16, font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                          {s.range} @ {(s.rate * 100).toFixed(0)}%
                        </td>
                        <td style={{ padding: '6px 0', textAlign: 'right', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(s.tax)}
                        </td>
                      </tr>
                    ))}

                    <TaxRow label="Gross Tax" value={taxReport.grossTax} />
                    {taxReport.surcharge > 0 && <TaxRow label="Surcharge" value={taxReport.surcharge} />}
                    {/* `cessRate` is per-FY configurable and is NOT part of the
                        tax-report payload, so "(4%)" was an assumption. */}
                    <TaxRow label="Health & Education Cess" value={taxReport.cess} />
                    {taxReport.rebate > 0 && <TaxRow label="Less: Rebate u/s 87A" value={-taxReport.rebate} negative />}
                    <TaxRow label="Total Tax Liability" value={taxReport.totalTax} bold highlight />

                    <tr><td colSpan={2} style={{ paddingTop: 12 }} /></tr>
                    <TaxRow label="YTD TDS Paid" value={taxReport.ytdTdsPaid} color={INK.paid} />
                    <TaxRow label="Remaining Tax" value={taxReport.remainingTax} bold color={taxReport.remainingTax > 0 ? INK.due : INK.good} />
                  </tbody>
                </table>
              </div>
            </Panel>

            {taxReport.monthlyBreakdown?.length > 0 && (
              <Panel flush>
                <div style={{ padding: '12px 14px', font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', borderBottom: '1px solid var(--line-2)' }}>
                  Monthly TDS Breakdown
                </div>
                {monthlyTable(taxReport, true)}
              </Panel>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
