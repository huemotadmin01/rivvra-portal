import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { usePeriod } from '../../context/PeriodContext';
import { useCompany } from '../../context/CompanyContext';
import { getAllLeaveBalances } from '../../utils/timesheetApi';
import { useToast } from '../../context/ToastContext';
import { CalendarDays, ChevronDown, ChevronUp, History } from 'lucide-react';
import { DataTable, FilterBar, EmptyState, Button, Chip, InlineSelect } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });

/* v2 Leave Balances (Slice 3 Wave A) — same data + expansion behaviour as
   LeaveBalances.jsx; dynamic per-leave-type columns rendered through
   DataTable's children slot (expansion needs a second <tr>). */
export default function LeaveBalancesV2() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const { fy } = usePeriod();
  const [search, setSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [orgSlug, currentCompany?._id, fy, statusFilter]);

  async function loadData() {
    setLoading(true);
    setData([]);
    setLeaveTypes([]);
    setExpandedEmp(null);
    try {
      const res = await getAllLeaveBalances({ financialYear: fy, status: statusFilter });
      setData(res.balances || []);
      const types = res.leaveTypes || [];
      if (types.length > 0) {
        setLeaveTypes(types);
      } else if (res.balances?.length > 0) {
        const first = res.balances.find(b => b.balances && Object.keys(b.balances).length > 0);
        if (first) {
          setLeaveTypes(Object.keys(first.balances).filter(k => k !== 'lop').map(k => ({
            code: k,
            name: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          })));
        }
      }
    } catch (err) {
      showToast('Failed to load leave balances', 'error');
    } finally {
      setLoading(false);
    }
  }

  const departments = [...new Set(data.map(d => d.departmentName || d.department || '').filter(Boolean))].sort();

  const filtered = data.filter(b => {
    if (search) {
      const q = search.toLowerCase();
      if (!(b.employeeName || '').toLowerCase().includes(q) && !(b.email || '').toLowerCase().includes(q)) return false;
    }
    if (deptFilter && (b.departmentName || b.department || '') !== deptFilter) return false;
    return true;
  });

  const visibleTypes = leaveTypes.filter(t => t.code !== 'lop');
  const columns = [
    { key: 'employee', header: 'Employee', width: 240 },
    { key: 'department', header: 'Department', width: 150 },
    ...visibleTypes.map(lt => ({ key: lt.code, header: lt.name, align: 'center', width: 110 })),
    { key: 'lop', header: 'LOP', align: 'center', width: 70 },
    { key: 'chev', header: '', width: 40 },
  ];

  const cellPad = '11px 14px';
  const td = (extra = {}) => ({
    padding: cellPad, font: '450 13px/1.45 var(--font)', color: 'var(--fg-2)',
    borderBottom: '1px solid var(--line)', verticalAlign: 'middle', ...extra,
  });

  const detailRow = (label, value, color = 'var(--fg-2)') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', font: '450 12px/1.5 var(--font)' }}>
      <span style={{ color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );

  return (
    <div>
      <PageHeaderV2
        title="Leave Balances"
        sub={`${filtered.length} employees · FY ${fy}`}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee…"
        resultCount={filtered.length}
        noun="employee"
        filters={[]}
        left={(
          <>
            <InlineSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="active">Active</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
              <option value="all">All Statuses</option>
            </InlineSelect>
            {departments.length > 1 && (
              <InlineSelect value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </InlineSelect>
            )}
          </>
        )}
        style={{ marginBottom: 14 }}
      />

      <DataTable
        columns={columns}
        rows={[]}
        loading={loading}
        resizable={false}
        empty={(
          <EmptyState icon={<CalendarDays size={22} />} title={search ? 'No employees match your search' : 'No leave balance data'}>
            {search ? 'Try a different name or email.' : `No leave balance data for FY ${fy}.`}
          </EmptyState>
        )}
      >
        {!loading && filtered.length > 0 ? filtered.map(item => {
          const empId = item.employeeId;
          const balances = item.balances || {};
          const isExpanded = expandedEmp === empId;
          const rows = [
            <tr
              key={empId}
              onClick={() => setExpandedEmp(isExpanded ? null : empId)}
              style={{ cursor: 'pointer', background: isExpanded ? 'var(--surface-2)' : 'transparent', transition: 'background 110ms var(--e-out)' }}
              onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={td()}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 550, fontSize: 12.5 }}>{item.employeeName}</span>
                  {item.employeeStatus && item.employeeStatus !== 'active' && (
                    <Chip tone={item.employeeStatus === 'terminated' ? 'danger' : 'warn'} uppercase>{item.employeeStatus}</Chip>
                  )}
                </span>
                <span style={{ display: 'block', font: '450 10.5px/1.4 var(--font)', color: 'var(--fg-4)' }}>{item.email}</span>
                {item.employeeStatus && item.employeeStatus !== 'active' && item.financialYear && item.financialYear !== fy && (
                  <span style={{ display: 'block', font: '450 10px/1.4 var(--font)', color: 'var(--warn)' }}>as of FY {item.financialYear}</span>
                )}
                {item.employeeStatus && item.employeeStatus !== 'active' && !item.financialYear && (
                  <span style={{ display: 'block', font: '450 10px/1.4 var(--font)', color: 'var(--fg-4)' }}>no balance record</span>
                )}
              </td>
              <td style={td({ fontSize: 12, color: 'var(--fg-3)' })}>{item.departmentName || item.department || <span style={{ color: 'var(--fg-4)' }}>—</span>}</td>
              {visibleTypes.map(lt => {
                const b = balances[lt.code];
                if (!b) return <td key={lt.code} style={td({ textAlign: 'center', color: 'var(--fg-4)', fontSize: 12 })}>—</td>;
                const available = b.available ?? 0;
                const entitled = b.entitled ?? b.accrued ?? 0;
                if (item.fnfEncashed) {
                  return (
                    <td key={lt.code} style={td({ textAlign: 'center', fontSize: 12 })}>
                      <span style={{ color: 'var(--fg-4)' }}>0</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>/{fmt(entitled)}</span>
                    </td>
                  );
                }
                return (
                  <td key={lt.code} style={td({ textAlign: 'center', fontSize: 12 })}>
                    <span style={{ fontWeight: 550, color: available <= 0 ? 'var(--danger)' : available <= 2 ? 'var(--warn)' : 'var(--brand)' }}>
                      {fmt(available)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>/{fmt(entitled)}</span>
                  </td>
                );
              })}
              <td style={td({ textAlign: 'center', fontSize: 12, color: 'var(--fg-3)' })}>{fmt(balances.lop?.used || 0)}</td>
              <td style={td()}>
                {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--fg-4)' }} /> : <ChevronDown size={14} style={{ color: 'var(--fg-4)' }} />}
              </td>
            </tr>,
          ];
          if (isExpanded) {
            rows.push(
              <tr key={`${empId}-detail`}>
                <td colSpan={columns.length} style={{ padding: 0, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ background: 'var(--surface-2)', padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        iconLeft={<History size={13} />}
                        onClick={(e) => { e.stopPropagation(); navigate(orgPath(`/timesheet/leave/balances/${empId}`)); }}
                      >
                        View full history
                      </Button>
                    </div>
                    {item.fnfEncashed && (
                      <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 'var(--r-2)', background: 'var(--brand-soft)', color: 'var(--brand-ink)', font: '450 12px/1.5 var(--font)' }}>
                        ✓ Leave balance encashed in Full &amp; Final settlement
                        {item.fnfEncashmentAmount ? ` — ₹${Number(item.fnfEncashmentAmount).toLocaleString('en-IN')}` : ''}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
                      {visibleTypes.map(lt => {
                        const b = balances[lt.code];
                        if (!b) return null;
                        return (
                          <div key={lt.code} style={{ background: 'var(--surface-1)', borderRadius: 'var(--r-2)', boxShadow: 'inset 0 0 0 1px var(--line)', padding: 14 }}>
                            <p style={{ font: '600 12px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 10 }}>{lt.name}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {detailRow('Entitled', fmt(b.entitled || 0))}
                              {detailRow('Accrued', fmt(b.accrued || 0))}
                              {(b.carriedForward || 0) > 0 && detailRow('Carried Forward', fmt(b.carriedForward), 'var(--info)')}
                              {(b.manualAdjustment || 0) !== 0 && detailRow('Manual Adjustment', `${b.manualAdjustment > 0 ? '+' : ''}${fmt(b.manualAdjustment)}`, b.manualAdjustment > 0 ? 'var(--brand)' : 'var(--danger)')}
                              {detailRow('Used', fmt(b.used || 0), 'var(--danger)')}
                              {(b.pending || 0) > 0 && detailRow('Pending', fmt(b.pending), 'var(--warn)')}
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, borderTop: '1px solid var(--line)', font: '600 12px/1.5 var(--font)' }}>
                                <span style={{ color: 'var(--fg)' }}>Available</span>
                                {item.fnfEncashed
                                  ? <span style={{ color: 'var(--fg-4)' }}>0 <span style={{ fontSize: 9 }}>(encashed)</span></span>
                                  : <span style={{ color: (b.available || 0) <= 0 ? 'var(--danger)' : 'var(--brand)' }}>{fmt(b.available || 0)}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(balances.lop?.used || 0) > 0 && (
                        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--r-2)', boxShadow: 'inset 0 0 0 1px var(--line)', padding: 14 }}>
                          <p style={{ font: '600 12px/1.3 var(--font)', color: 'var(--fg)', marginBottom: 10 }}>Loss of Pay (LOP)</p>
                          {detailRow('LOP Days', fmt(balances.lop.used), 'var(--danger)')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          }
          return rows;
        }).flat() : null}
      </DataTable>
    </div>
  );
}
