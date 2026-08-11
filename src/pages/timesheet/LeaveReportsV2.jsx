import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { getLeaveReportSummary, getLeaveReportUtilization, exportLeaveReport } from '../../utils/timesheetApi';
import { Download, Loader2, Users, TrendingUp } from 'lucide-react';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Stat , InlineSelect } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const leaveTypeLabels = {
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  comp_off: 'Comp Off',
  lop: 'LOP',
};

const ITEMS_PER_PAGE = 15;
const SUMMARY_TYPES = ['sick_leave', 'casual_leave', 'comp_off'];

/* v2 Leave Reports (Slice 3 Wave A) — same data as LeaveReports.jsx.
   The two-row grouped header collapses to one "used / avail" cell per
   leave type; the utilization bars keep their CSS-bar rendering on
   tokens. */
export default function LeaveReportsV2() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [utilizationData, setUtilizationData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(`${currentFYStart}-${currentFYStart + 1}`);
  const [utilYear, setUtilYear] = useState(now.getFullYear());

  const loadSummary = async () => {
    setLoading(true);
    setSummaryData(null);
    try {
      const res = await getLeaveReportSummary({ financialYear: fy });
      setSummaryData(res);
    } catch {
      showToast('Failed to load summary', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUtilization = async () => {
    setLoading(true);
    setUtilizationData(null);
    try {
      const res = await getLeaveReportUtilization({ year: utilYear });
      setUtilizationData(res);
    } catch {
      showToast('Failed to load utilization', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'summary') loadSummary();
    else loadUtilization();
  }, [tab, fy, utilYear, currentCompany?._id]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportLeaveReport({ financialYear: fy });
      const blob = res.data || res;
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `leave-report-${fy}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Report exported', 'success');
    } catch {
      showToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  const filteredSummary = (summaryData?.summary || []).filter(row =>
    !search ||
    row.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    row.employeeCode?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredSummary.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedSummary = filteredSummary.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const filteredAgg = filteredSummary.reduce((acc, s) => {
    Object.entries(s.balances || {}).forEach(([type, bal]) => {
      if (!acc[type]) acc[type] = { used: 0, available: 0 };
      acc[type].used += bal.used || 0;
      acc[type].available += bal.available || 0;
    });
    return acc;
  }, {});

  const columns = [
    {
      key: 'employee', header: 'Employee', width: 220,
      render: (r) => (
        <span style={{ minWidth: 0, display: 'block' }}>
          <span style={{ display: 'block', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.employeeName}</span>
          <span style={{ display: 'block', font: '450 11px/1.3 var(--font)', color: 'var(--fg-4)' }}>{r.employeeCode}</span>
        </span>
      ),
    },
    { key: 'employmentType', header: 'Type', muted: true, width: 130 },
    ...SUMMARY_TYPES.map(type => ({
      key: type, header: `${leaveTypeLabels[type]} (used / avail)`, align: 'center', width: 160,
      render: (r) => {
        const bal = r.balances?.[type];
        if (!bal) return null;
        return (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--fg-3)' }}>{bal.used ?? '–'}</span>
            <span style={{ color: 'var(--fg-faint)' }}> / </span>
            <span style={{ fontWeight: 550, color: (bal.available || 0) <= 0 ? 'var(--danger)' : 'var(--brand)' }}>{bal.available ?? '–'}</span>
          </span>
        );
      },
    })),
  ];

  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    borderRadius: 'var(--r-2)', font: '550 12.5px/1 var(--font)',
    background: on ? 'var(--surface-4)' : 'var(--surface-2)',
    color: on ? 'var(--fg)' : 'var(--fg-4)',
    boxShadow: 'inset 0 0 0 1px var(--line)',
    transition: 'background var(--d-1) var(--e-out), color var(--d-1) var(--e-out)',
  });

  const card = { background: 'var(--surface-1)', borderRadius: 'var(--r-3)', boxShadow: 'inset 0 0 0 1px var(--line)', padding: 16 };

  return (
    <div>
      <PageHeaderV2
        title="Leave Reports"
        sub="Analyze leave balances and utilization across your organization."
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {tab === 'summary' ? (
              <>
                <InlineSelect value={fy} onChange={e => { setFy(e.target.value); setPage(1); }}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const y = currentFYStart - 2 + i;
                    return <option key={y} value={`${y}-${y + 1}`}>FY {y}-{y + 1}</option>;
                  })}
                </InlineSelect>
                <Button variant="secondary" size="sm" disabled={exporting} onClick={handleExport}
                  iconLeft={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
                  Export CSV
                </Button>
              </>
            ) : (
              <InlineSelect value={utilYear} onChange={e => setUtilYear(parseInt(e.target.value))}>
                {Array.from({ length: 3 }, (_, i) => {
                  const y = now.getFullYear() - 1 + i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </InlineSelect>
            )}
            <button type="button" style={tabBtn(tab === 'summary')} onClick={() => { setTab('summary'); setSearch(''); setPage(1); }}>
              <Users size={14} /> Balance Summary
            </button>
            <button type="button" style={tabBtn(tab === 'utilization')} onClick={() => { setTab('utilization'); setSearch(''); setPage(1); }}>
              <TrendingUp size={14} /> Utilization Trends
            </button>
          </div>
        )}
      />

      {tab === 'summary' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Stat label="Total Employees" value={filteredSummary.length} />
            {Object.entries(filteredAgg).slice(0, 3).map(([type, agg]) => (
              <Stat key={type} label={leaveTypeLabels[type] || type} value={agg.used} note="days used" />
            ))}
          </div>

          <FilterBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search by employee name or code…"
            resultCount={filteredSummary.length}
            noun="employee"
            filters={[]}
            style={{ marginBottom: 14 }}
          />

          <DataTable
            columns={columns}
            rows={paginatedSummary}
            rowKey={(r, i) => r.employeeCode || i}
            loading={loading}
            resizable={false}
            empty={(
              <EmptyState icon={<Users size={22} />} title={search ? 'No employees match your search' : 'No leave data'} compact>
                {search ? 'Try a different name or code.' : 'No leave data found for this financial year.'}
              </EmptyState>
            )}
          />
          {filteredSummary.length > 0 && (
            <Pagination page={safePage} pageSize={ITEMS_PER_PAGE} total={filteredSummary.length} onPageChange={setPage} noun="employee" />
          )}
        </>
      ) : loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ ...card, height: 90, opacity: 0.5 }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Stat label="Total Requests" value={utilizationData?.totalRequests || 0} />
            <Stat label="Total Days" value={utilizationData?.totalDays || 0} />
            {Object.entries(utilizationData?.byType || {}).slice(0, 2).map(([type, days]) => (
              <Stat key={type} label={leaveTypeLabels[type] || type} value={days} note="days" />
            ))}
          </div>

          <div style={card}>
            <h3 style={{ font: '600 13px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 14 }}>Monthly Leave Distribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(utilizationData?.monthly || []).map(m => {
                const maxDays = Math.max(...(utilizationData?.monthly || []).map(x => x.totalDays), 1);
                const pct = (m.totalDays / maxDays) * 100;
                return (
                  <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ font: '450 12px/1 var(--font)', color: 'var(--fg-4)', width: 30, flexShrink: 0 }}>{monthNames[m.month - 1]}</span>
                    <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 999, height: 20, overflow: 'hidden' }}>
                      <div style={{
                        background: 'var(--brand)', height: '100%', borderRadius: 999,
                        width: `${Math.max(pct, m.totalDays > 0 ? 8 : 0)}%`,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                        transition: 'width var(--d-3) var(--e-out)',
                      }}>
                        {m.totalDays > 0 && <span style={{ font: '600 10px/1 var(--font)', color: 'var(--brand-fg)' }}>{m.totalDays}d</span>}
                      </div>
                    </div>
                    <span style={{ font: '450 12px/1 var(--font)', color: 'var(--fg-4)', width: 48, textAlign: 'right', flexShrink: 0 }}>{m.count} req</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ font: '600 13px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 12 }}>By Leave Type</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {Object.entries(utilizationData?.byType || {}).map(([type, days]) => (
                <div key={type} style={{ textAlign: 'center' }}>
                  <p style={{ font: '700 18px/1.2 var(--font)', color: 'var(--fg)' }}>{days}</p>
                  <p style={{ font: '450 12px/1.4 var(--font)', color: 'var(--fg-4)' }}>{leaveTypeLabels[type] || type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
