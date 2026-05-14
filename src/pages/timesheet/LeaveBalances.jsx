import React, { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { usePeriod } from '../../context/PeriodContext';
import { useCompany } from '../../context/CompanyContext';
import { getAllLeaveBalances } from '../../utils/timesheetApi';
import { useToast } from '../../context/ToastContext';
import { CalendarDays, Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });

const EMP_TYPE_LABELS = {
  confirmed: 'Confirmed',
  internal_consultant: 'Internal Consultant',
  intern: 'Intern',
};

export default function LeaveBalances() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const { fy } = usePeriod();
  const [search, setSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  // Employment-status filter: 'active' (default), 'resigned', 'terminated', 'all'
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
      // Extract unique leave types from first balance that has them
      const types = res.leaveTypes || [];
      if (types.length > 0) {
        setLeaveTypes(types);
      } else if (res.balances?.length > 0) {
        // Derive from balance keys
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

  // Collect unique departments
  const departments = [...new Set(data.map(d => d.departmentName || d.department || '').filter(Boolean))].sort();

  const filtered = data.filter(b => {
    if (search) {
      const q = search.toLowerCase();
      if (!(b.employeeName || '').toLowerCase().includes(q) && !(b.email || '').toLowerCase().includes(q)) return false;
    }
    if (deptFilter && (b.departmentName || b.department || '') !== deptFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-rivvra-500" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <CalendarDays size={20} className="text-rivvra-400" /> Leave Balances
          </h1>
          <p className="text-sm text-dark-400 mt-1">{filtered.length} employees • FY {fy}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
            <option value="all">All Statuses</option>
          </select>
          {departments.length > 1 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-rivvra-500 focus:outline-none">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-dark-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:border-rivvra-500 focus:outline-none w-56"
              placeholder="Search employee..." />
          </div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-4 py-3 text-dark-400 font-medium">Employee</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium">Department</th>
                {leaveTypes.filter(t => t.code !== 'lop').map(lt => (
                  <th key={lt.code} className="text-center px-3 py-3 text-dark-400 font-medium whitespace-nowrap">
                    {lt.name}
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-dark-400 font-medium">LOP</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const empId = item.employeeId;
                const balances = item.balances || {};
                const isExpanded = expandedEmp === empId;

                return (
                  <React.Fragment key={empId}>
                    <tr
                      onClick={() => setExpandedEmp(isExpanded ? null : empId)}
                      className={`border-b border-dark-700/50 hover:bg-dark-750 cursor-pointer transition-colors ${isExpanded ? 'bg-dark-750' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-xs">{item.employeeName}</span>
                          {item.employeeStatus && item.employeeStatus !== 'active' && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                              item.employeeStatus === 'terminated'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {item.employeeStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-dark-500">{item.email}</div>
                        {item.employeeStatus && item.employeeStatus !== 'active' && item.financialYear && item.financialYear !== fy && (
                          <div className="text-[9px] text-amber-500/80 mt-0.5">as of FY {item.financialYear}</div>
                        )}
                        {item.employeeStatus && item.employeeStatus !== 'active' && !item.financialYear && (
                          <div className="text-[9px] text-dark-500 mt-0.5">no balance record</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-dark-300">{item.departmentName || item.department || '—'}</td>
                      {leaveTypes.filter(t => t.code !== 'lop').map(lt => {
                        const b = balances[lt.code];
                        if (!b) return <td key={lt.code} className="px-3 py-3 text-center text-xs text-dark-600">—</td>;
                        const available = b.available ?? 0;
                        const entitled = b.entitled ?? b.accrued ?? 0;
                        // If FNF has been processed with leave encashment, show 0 with "Encashed" label
                        if (item.fnfEncashed) {
                          return (
                            <td key={lt.code} className="px-3 py-3 text-center">
                              <span className="text-xs text-dark-500">0</span>
                              <span className="text-[10px] text-dark-500">/{fmt(entitled)}</span>
                            </td>
                          );
                        }
                        return (
                          <td key={lt.code} className="px-3 py-3 text-center">
                            <span className={`text-xs font-medium ${available <= 0 ? 'text-red-400' : available <= 2 ? 'text-amber-400' : 'text-green-400'}`}>
                              {fmt(available)}
                            </span>
                            <span className="text-[10px] text-dark-500">/{fmt(entitled)}</span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-dark-400">{fmt(balances.lop?.used || 0)}</span>
                      </td>
                      <td className="px-2 py-3">
                        {isExpanded ? <ChevronUp size={14} className="text-dark-500" /> : <ChevronDown size={14} className="text-dark-500" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={leaveTypes.length + 3} className="px-0 py-0 border-b border-dark-700/50">
                          <div className="bg-dark-950/50 p-5">
                            {item.fnfEncashed && (
                              <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                                <span>✓</span>
                                <span>
                                  Leave balance encashed in Full &amp; Final settlement
                                  {item.fnfEncashmentAmount ? ` — ₹${Number(item.fnfEncashmentAmount).toLocaleString('en-IN')}` : ''}
                                </span>
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {leaveTypes.filter(t => t.code !== 'lop').map(lt => {
                                const b = balances[lt.code];
                                if (!b) return null;
                                return (
                                  <div key={lt.code} className="bg-dark-900 rounded-lg border border-dark-800 p-4">
                                    <p className="text-xs font-medium text-white mb-3">{lt.name}</p>
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex justify-between">
                                        <span className="text-dark-400">Entitled</span>
                                        <span className="text-dark-200">{fmt(b.entitled || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-dark-400">Accrued</span>
                                        <span className="text-dark-200">{fmt(b.accrued || 0)}</span>
                                      </div>
                                      {(b.carriedForward || 0) > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-400">Carried Forward</span>
                                          <span className="text-blue-400">{fmt(b.carriedForward)}</span>
                                        </div>
                                      )}
                                      {(b.manualAdjustment || 0) !== 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-400">Manual Adjustment</span>
                                          <span className={b.manualAdjustment > 0 ? 'text-green-400' : 'text-red-400'}>{b.manualAdjustment > 0 ? '+' : ''}{fmt(b.manualAdjustment)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span className="text-dark-400">Used</span>
                                        <span className="text-red-400">{fmt(b.used || 0)}</span>
                                      </div>
                                      {(b.pending || 0) > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-dark-400">Pending</span>
                                          <span className="text-amber-400">{fmt(b.pending)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-2 border-t border-dark-800">
                                        <span className="text-white font-medium">Available</span>
                                        {item.fnfEncashed ? (
                                          <span className="text-dark-500 font-medium">0 <span className="text-[9px]">(encashed)</span></span>
                                        ) : (
                                          <span className={`font-semibold ${(b.available || 0) <= 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(b.available || 0)}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {(balances.lop?.used || 0) > 0 && (
                                <div className="bg-dark-900 rounded-lg border border-dark-800 p-4">
                                  <p className="text-xs font-medium text-white mb-3">Loss of Pay (LOP)</p>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">LOP Days</span>
                                      <span className="text-red-400">{fmt(balances.lop.used)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-dark-500">
            {search ? 'No employees match your search' : 'No leave balance data for this FY'}
          </div>
        )}
      </div>
    </div>
  );
}
