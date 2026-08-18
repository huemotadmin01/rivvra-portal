import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getMyTaxReport, getMyTaxAvailableFYs, updateMyTaxRegime } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { BarChart3, ChevronDown, ChevronUp, TrendingDown, TrendingUp, IndianRupee, Calendar, ArrowRightLeft } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Select, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// The employee-facing tax computation: slab breakdown, cess, rebate, YTD TDS and
// the month-by-month cumulative. Every figure comes from the server; this page
// only formats and signs them. So the logic above `return (` is spliced in
// verbatim and every ₹ expression is asserted, including `Row`'s
// `{negative ? '-' : ''}₹{fmt(Math.abs(value || 0))}` sign handling.
//
// Finding carried across unchanged (REDESIGN-QA.md): two statutory figures are
// hardcoded into LABELS that sit directly beside the server-provided VALUE they
// describe — `Less: Standard Deduction (₹75K/₹50K)` next to
// `report.standardDeduction`, and `Cess (4%)` next to `report.cess`. If the
// server's number ever moves, the label keeps its old story.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

export default function MyTaxReportPageV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [fys, setFys] = useState([]);
  const [selectedFY, setSelectedFY] = useState(getCurrentFY());
  const [showDetails, setShowDetails] = useState(true);
  const [showMonthly, setShowMonthly] = useState(false);
  // Why the report can't be shown: 'not_linked' (404), 'not_india'
  // (403 NON_INDIA_COMPANY / 400 no active company) or 'error'. Only 404 used
  // to be handled, so a non-India employee got a toast plus a bare
  // "No tax data available" with no explanation.
  const [blockReason, setBlockReason] = useState(null);
  const [switchingRegime, setSwitchingRegime] = useState(false);

  useEffect(() => {
    (async () => {
      setFys([]);
      try {
        const res = await getMyTaxAvailableFYs(orgSlug);
        setFys(res.financialYears || []);
      } catch (err) { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadReport(); }, [orgSlug, currentCompany?._id, selectedFY]);

  async function loadReport() {
    setLoading(true);
    setReport(null);
    setBlockReason(null);
    try {
      const res = await getMyTaxReport(orgSlug, selectedFY);
      setReport(res.report);
    } catch (err) {
      const st = err.response?.status;
      const code = err.response?.data?.code;
      if (st === 404) {
        setBlockReason('not_linked');
      } else if (st === 403 || code === 'NON_INDIA_COMPANY' || st === 400) {
        setBlockReason('not_india');
      } else {
        setBlockReason('error');
        showToast('Failed to load tax report', 'error');
      }
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchRegime(newRegime) {
    // In-flight guard — a double-click fired two PUTs plus two report reloads.
    if (switchingRegime) return;
    setSwitchingRegime(true);
    try {
      await updateMyTaxRegime(orgSlug, newRegime);
      showToast(`Switched to ${newRegime === 'old' ? 'Old' : 'New'} Regime`);
      await loadReport();
    } catch (err) {
      showToast('Failed to switch regime', 'error');
    } finally {
      setSwitchingRegime(false);
    }
  }

  if (loading) return <PageSpinner label="Loading tax report…" />;

  const sectionHead = (text) => (
    <tr>
      <td colSpan={2} style={{
        paddingTop: 14, paddingBottom: 4,
        font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{text}</td>
    </tr>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} style={{ color: 'var(--brand-ink)' }} /> Income Tax Report</span>}
        sub={<span className="hidden sm:block">Detailed tax computation and TDS breakdown</span>}
        actions={(
          <Select value={selectedFY} onChange={e => setSelectedFY(e.target.value)} aria-label="Financial year" style={{ width: 140 }}>
            {[...new Set([selectedFY, ...fys])].map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
          </Select>
        )}
      />

      {!report ? (
        <Panel>
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="No report to show"
            sub={
              blockReason === 'not_linked'
                ? "Your account isn't linked to an employee record — contact HR."
                : blockReason === 'not_india'
                  ? 'The income tax report (old/new regime, TDS, Section 80C) applies to India-registered companies only. Your active company is outside India.'
                  : blockReason === 'error'
                    ? "We couldn't load your tax report. Please try again."
                    : `No tax data available for FY ${selectedFY}`
            }
            action={blockReason === 'error' ? <Button size="sm" onClick={loadReport}>Retry</Button> : undefined}
          />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <SummaryCard label="Gross Annual Income" value={report.grossAnnualIncome} Icon={TrendingUp} />
            <SummaryCard label="Total Deductions" value={report.totalDeductions} Icon={TrendingDown} color="var(--acc-emerald)" />
            <SummaryCard label="Taxable Income" value={report.taxableIncome} Icon={IndianRupee} />
            <SummaryCard label="Total Tax Liability" value={report.totalTax} Icon={IndianRupee} color="var(--danger)" />
            <SummaryCard label="YTD TDS Paid" value={report.ytdTdsPaid} Icon={Calendar} color="var(--acc-blue)" />
            <SummaryCard label="Remaining Tax" value={report.remainingTax} Icon={IndianRupee} color={report.remainingTax > 0 ? 'var(--acc-amber)' : 'var(--acc-emerald)'} />
          </div>

          {/* Regime + monthly TDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <Panel>
              <div style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>Current Regime</div>
              <div style={{ font: "700 17px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', textTransform: 'capitalize' }}>
                {report.regime} Regime
              </div>
              <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 6 }}>
                Standard Deduction: ₹{fmt(report.standardDeduction)}
              </div>
            </Panel>
            <Panel>
              <div style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>Est. Monthly TDS</div>
              <div style={{ font: "700 17px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                ₹{fmt(report.estimatedMonthlyTds)}
              </div>
              <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 6 }}>
                {report.monthsProcessed} months processed • {report.monthsRemaining} remaining
              </div>
            </Panel>
          </div>

          {/* Regime comparison */}
          {report.comparison && (
            <Panel icon={<ArrowRightLeft size={15} />} title="Regime Comparison">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  ['new', 'New Regime', report.comparison.newRegime],
                  ['old', 'Old Regime', report.comparison.oldRegime],
                ].map(([key, label, side]) => {
                  const better = report.comparison.betterRegime === key;
                  return (
                    <div key={key} style={{
                      padding: 14, borderRadius: 'var(--r-2)',
                      border: `1px solid ${better ? 'var(--brand-line)' : 'var(--line-2)'}`,
                      background: better ? 'var(--brand-soft)' : 'var(--surface-2)',
                    }}>
                      <div style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>{label}</div>
                      <div style={{ font: "700 17px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                        ₹{fmt(side.totalTax)}
                      </div>
                      <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 6 }}>
                        Taxable: ₹{fmt(side.taxableIncome)}
                      </div>
                      {better && (
                        <span style={{ font: "600 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', display: 'inline-block', marginTop: 6 }}>
                          ✓ Better by ₹{fmt(report.comparison.savings)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {report.comparison.betterRegime !== report.regime && report.declarationStatus !== 'approved' && (
                <div style={{ marginTop: 14 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSwitchRegime(report.comparison.betterRegime)}
                    disabled={switchingRegime}
                    iconLeft={<ArrowRightLeft size={14} />}
                  >
                    {switchingRegime ? 'Switching…' : `Switch to ${report.comparison.betterRegime === 'old' ? 'Old' : 'New'} Regime to save ₹${fmt(report.comparison.savings)}`}
                  </Button>
                </div>
              )}
              {report.comparison.betterRegime !== report.regime && report.declarationStatus === 'approved' && (
                <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '14px 0 0' }}>
                  Regime is locked — your declarations were approved by admin. Contact HR to amend.
                </p>
              )}
            </Panel>
          )}

          {/* Detailed computation */}
          <Panel flush>
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)',
              }}
            >
              Detailed Tax Computation
              {showDetails ? <ChevronUp size={16} style={{ color: 'var(--fg-4)' }} /> : <ChevronDown size={16} style={{ color: 'var(--fg-4)' }} />}
            </button>

            {showDetails && (
              <div style={{ borderTop: '1px solid var(--line-2)', padding: '10px 16px 16px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', font: "400 13px/1.4 'Inter', system-ui, sans-serif" }}>
                  <tbody>
                    <Row label="Gross Annual Income" value={report.grossAnnualIncome} />
                    <Row label={`Less: Standard Deduction (${report.regime === 'new' ? '₹75K' : '₹50K'})`} value={-report.standardDeduction} negative />

                    {report.regime === 'old' && report.totalDeductions > 0 && (
                      <>
                        {sectionHead('Deductions')}
                        {report.declarations?.section80CTotal > 0 && <Row label="  Section 80C" value={-report.declarations.section80CTotal} negative sub />}
                        {report.declarations?.section80DTotal > 0 && <Row label="  Section 80D" value={-report.declarations.section80DTotal} negative sub />}
                        {Number(report.declarations?.section80E) > 0 && <Row label="  Section 80E" value={-Number(report.declarations.section80E)} negative sub />}
                        {Number(report.declarations?.section80G) > 0 && <Row label="  Section 80G" value={-Number(report.declarations.section80G)} negative sub />}
                        {Number(report.declarations?.section24b) > 0 && <Row label="  Section 24(b)" value={-Number(report.declarations.section24b)} negative sub />}
                        {report.hraExemption > 0 && <Row label="  HRA Exemption" value={-report.hraExemption} negative sub />}
                      </>
                    )}

                    <Row label="Taxable Income" value={report.taxableIncome} bold />

                    {sectionHead('Tax Slab Breakdown')}
                    {(report.slabBreakdown || []).map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <td style={{ padding: '6px 0', paddingLeft: 16, font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                          {s.range} @ {(s.rate * 100).toFixed(0)}%
                        </td>
                        <td style={{ padding: '6px 0', textAlign: 'right', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                          ₹{fmt(s.tax)}
                        </td>
                      </tr>
                    ))}

                    <Row label="Gross Tax" value={report.grossTax} />
                    {report.surcharge > 0 && <Row label="Surcharge" value={report.surcharge} />}
                    <Row label="Cess (4%)" value={report.cess} />
                    {report.rebate > 0 && <Row label="Less: Rebate u/s 87A" value={-report.rebate} negative />}
                    <Row label="Total Tax Liability" value={report.totalTax} bold highlight />

                    <tr><td colSpan={2} style={{ paddingTop: 12 }} /></tr>
                    <Row label="YTD TDS Paid" value={report.ytdTdsPaid} color="var(--acc-blue)" />
                    <Row label="Remaining Tax" value={report.remainingTax} bold color={report.remainingTax > 0 ? 'var(--acc-amber)' : 'var(--acc-emerald)'} />
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Monthly TDS breakdown */}
          {report.monthlyBreakdown?.length > 0 && (
            <Panel flush>
              <button
                type="button"
                onClick={() => setShowMonthly(!showMonthly)}
                aria-expanded={showMonthly}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                  font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)',
                }}
              >
                Monthly TDS Breakdown
                {showMonthly ? <ChevronUp size={16} style={{ color: 'var(--fg-4)' }} /> : <ChevronDown size={16} style={{ color: 'var(--fg-4)' }} />}
              </button>

              {showMonthly && (
                <div style={{ borderTop: '1px solid var(--line-2)', padding: '10px 16px 16px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', font: "400 13px/1.4 'Inter', system-ui, sans-serif" }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                        {[['Month', 'left'], ['Gross', 'right'], ['TDS', 'right'], ['Cumulative TDS', 'right']].map(([h, align]) => (
                          <th key={h} style={{
                            textAlign: align, paddingBottom: 8,
                            font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let cumTds = 0;
                        return report.monthlyBreakdown.map((m, i) => {
                          cumTds += m.tds || 0;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                              <td style={{ padding: '8px 0', color: 'var(--fg-2)' }}>
                                {MONTH_NAMES[m.month]} {m.year}
                                {m.source === 'imported' && (
                                  <span style={{ marginLeft: 6 }}><Chip tone="info">GreytHR</Chip></span>
                                )}
                              </td>
                              <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(m.gross)}</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(m.tds)}</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--acc-blue)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(cumTds)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

/** Takes `Icon` directly rather than legacy's `icon: Icon` rename. Note this
 *  does NOT silence the spurious `'Icon' is defined but never used` — it is
 *  used, at the `<Icon size={14} />` below, and eslint reports it either way.
 *  Legacy carries the identical error; lint parity is 3+1 on both sides. */
function SummaryCard({ label, value, Icon, color = 'var(--fg)' }) {
  return (
    <Panel>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8,
        font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      }}>
        <Icon size={14} /> {label}
      </div>
      <div style={{ font: "700 19px/1 'Inter', system-ui, sans-serif", color, fontVariantNumeric: 'tabular-nums' }}>
        ₹{fmt(value)}
      </div>
    </Panel>
  );
}

function Row({ label, value, bold, negative, sub, highlight, color }) {
  const absVal = Math.abs(value || 0);
  const textColor = color || (negative ? 'var(--danger)' : 'var(--fg)');
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
        {negative ? '-' : ''}₹{fmt(absVal)}
      </td>
    </tr>
  );
}
