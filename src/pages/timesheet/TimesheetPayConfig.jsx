/**
 * TimesheetPayConfig — Pay Configuration page
 * Shows employees from Employee Directory with their timesheet-specific config.
 * Replaces the old "User Management" (TimesheetUsers.jsx) page.
 * Employee identity lives in the Employee app; pay config lives in ts_users.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTimesheetContext } from '../../context/TimesheetContext';
import {
  Search, Loader2, Edit3, X, Check, Save, RefreshCw,
  IndianRupee, Users, ChevronDown, Building2, Briefcase,
} from 'lucide-react';
import { getPayConfig, updatePayConfig, syncAllPayConfig } from '../../utils/timesheetApi';

const ROLES = [
  { value: 'contractor', label: 'Contractor' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

const PAY_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
];

/** Pick the first non-zero billing rate from an object { daily, hourly, monthly } */
function pickBillingRate(rateObj) {
  if (!rateObj) return null;
  const d = Number(rateObj.daily) || 0;
  const h = Number(rateObj.hourly) || 0;
  const m = Number(rateObj.monthly) || 0;
  if (m) return { value: m, suffix: '/mo', prefix: '\u20B9' };
  if (d) return { value: d, suffix: '/day', prefix: '\u20B9' };
  if (h) return { value: h, suffix: '/hr', prefix: '$' };
  return null;
}

/** Format a billing rate for display */
function formatRate(rate) {
  if (!rate) return '\u2014';
  return `${rate.prefix}${rate.value.toLocaleString('en-IN')}${rate.suffix}`;
}

export default function TimesheetPayConfig() {
  const { timesheetUser } = useTimesheetContext();
  const isAdmin = timesheetUser?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSynced, setFilterSynced] = useState('all'); // all | synced | not_synced
  const [editingEmail, setEditingEmail] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPayConfig();
      if (res.success) setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) fetchData(); else setLoading(false); }, [isAdmin, fetchData]);

  const startEdit = (emp) => {
    setEditingEmail(emp.email);
    setEditForm({
      role: emp.tsConfig.role,
      payType: emp.tsConfig.payType,
      dailyRate: emp.tsConfig.dailyRate,
      monthlyRate: emp.tsConfig.monthlyRate,
      paidLeavePerMonth: emp.tsConfig.paidLeavePerMonth,
      assignedClient: emp.tsConfig.assignedClient || '',
      assignedProjects: emp.tsConfig.assignedProjects || [],
    });
  };

  const cancelEdit = () => { setEditingEmail(null); setEditForm({}); };

  const handleSave = async (email) => {
    setSaving(true);
    try {
      const res = await updatePayConfig(email, editForm);
      if (res.success) {
        setEditingEmail(null);
        await fetchData();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      await syncAllPayConfig();
      await fetchData();
    } catch {} finally { setSyncing(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <p className="text-dark-400">You need admin access to manage pay configuration.</p>
        </div>
      </div>
    );
  }

  const employees = data?.employees || [];
  const projects = data?.projects || [];
  const clients = data?.clients || [];

  // Filter
  const filtered = employees.filter(emp => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !emp.fullName?.toLowerCase().includes(q) &&
        !emp.email?.toLowerCase().includes(q) &&
        !emp.employeeId?.toLowerCase().includes(q) &&
        !emp.designation?.toLowerCase().includes(q)
      ) return false;
    }
    if (filterSynced === 'synced' && !emp.tsConfig.synced) return false;
    if (filterSynced === 'not_synced' && emp.tsConfig.synced) return false;
    return true;
  });

  const syncedCount = employees.filter(e => e.tsConfig.synced).length;
  const unsyncedCount = employees.length - syncedCount;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pay Configuration</h1>
          <p className="text-dark-400 text-sm mt-1">
            Configure pay rates and timesheet roles for your employees.
            Employee records are managed in the <span className="text-rivvra-400">Employee Directory</span>.
          </p>
        </div>
        {unsyncedCount > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync All ({unsyncedCount})
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-2xl font-bold text-white">{employees.length}</p>
          <p className="text-sm text-dark-400">Total Employees</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-rivvra-400">{syncedCount}</p>
          <p className="text-sm text-dark-400">Synced to Timesheet</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-amber-400">{unsyncedCount}</p>
          <p className="text-sm text-dark-400">Not Yet Synced</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, ID, or designation..."
            className="input-field w-full pl-10"
          />
        </div>
        <select
          value={filterSynced}
          onChange={e => setFilterSynced(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All ({employees.length})</option>
          <option value="synced">Synced ({syncedCount})</option>
          <option value="not_synced">Not Synced ({unsyncedCount})</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Pay Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Project</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Candidate Rate</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Paid Leave</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {filtered.map(emp => {
                const isEditing = editingEmail === emp.email;
                const tc = emp.tsConfig;
                const assignments = emp.assignments || [];
                const activeAssignments = assignments.filter(a => a.status === 'active');
                const candidateRate = pickBillingRate(emp.billingRate);
                return (
                  <tr key={emp._id} className={`transition-colors ${isEditing ? 'bg-dark-800/50' : 'hover:bg-dark-800/30'}`}>
                    {/* Employee Info */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-blue-300">
                            {emp.fullName?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{emp.fullName}</p>
                          <p className="text-xs text-dark-500 truncate">{emp.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {emp.employeeId && (
                              <span className="text-[10px] text-dark-500">#{emp.employeeId}</span>
                            )}
                            {emp.department && (
                              <span className="text-[10px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded">{emp.department}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Sync Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        tc.synced ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${tc.synced ? 'bg-green-400' : 'bg-amber-400'}`} />
                        {tc.synced ? 'Synced' : 'Not synced'}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})}
                          className="input-field w-auto text-xs py-1">
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          tc.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                          tc.role === 'manager' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-dark-700 text-dark-300'
                        }`}>{tc.role?.charAt(0).toUpperCase() + tc.role?.slice(1)}</span>
                      )}
                    </td>

                    {/* Pay Type */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={editForm.payType} onChange={e => setEditForm({...editForm, payType: e.target.value})}
                          className="input-field w-auto text-xs py-1">
                          {PAY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          tc.payType === 'monthly' ? 'bg-blue-500/10 text-blue-400' : 'bg-dark-700 text-dark-300'
                        }`}>{tc.payType === 'monthly' ? 'Monthly' : 'Daily'}</span>
                      )}
                    </td>

                    {/* Client (from Employee assignments) */}
                    <td className="px-4 py-3">
                      {activeAssignments.length > 0 ? (
                        <div className="space-y-1">
                          {[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].slice(0, 2).map((name, i) => (
                            <span key={i} className="block text-xs text-white truncate max-w-[120px]">{name}</span>
                          ))}
                          {[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].length > 2 && (
                            <span className="text-[10px] text-dark-500">+{[...new Set(activeAssignments.map(a => a.clientName).filter(Boolean))].length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-dark-600">{'\u2014'}</span>
                      )}
                    </td>

                    {/* Project (from Employee assignments) */}
                    <td className="px-4 py-3">
                      {activeAssignments.length > 0 ? (
                        <div className="space-y-1">
                          {activeAssignments.slice(0, 2).map((a, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-xs text-white truncate max-w-[120px]">{a.projectName || '\u2014'}</span>
                              {a.clientBillingRate > 0 && (
                                <span className="text-[10px] text-dark-500">({'\u20B9'}{Number(a.clientBillingRate).toLocaleString('en-IN')}/d)</span>
                              )}
                            </div>
                          ))}
                          {activeAssignments.length > 2 && (
                            <span className="text-[10px] text-dark-500">+{activeAssignments.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-dark-600">{'\u2014'}</span>
                      )}
                    </td>

                    {/* Candidate Billing Rate (read-only, from Employee Directory) */}
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${candidateRate ? 'text-white' : 'text-dark-600'}`}>
                        {formatRate(candidateRate)}
                      </span>
                    </td>

                    {/* Paid Leave */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select value={editForm.paidLeavePerMonth} onChange={e => setEditForm({...editForm, paidLeavePerMonth: Number(e.target.value)})}
                          className="input-field w-16 text-xs py-1 text-center">
                          {[0,1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-dark-300">{tc.paidLeavePerMonth || 0}/mo</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleSave(emp.email)} disabled={saving}
                            className="p-1.5 bg-rivvra-500 text-dark-950 rounded-md hover:bg-rivvra-400 transition-colors disabled:opacity-50">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={cancelEdit}
                            className="p-1.5 bg-dark-700 text-dark-300 rounded-md hover:bg-dark-600 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(emp)}
                          className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-md transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-8 text-center text-dark-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {search || filterSynced !== 'all'
                ? 'No employees match your filters'
                : 'No employees found. Add employees in the Employee Directory first.'
              }
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-dark-600">
        Showing {filtered.length} of {employees.length} employees.
        Employee records are managed in the Employee app.
      </p>
    </div>
  );
}
