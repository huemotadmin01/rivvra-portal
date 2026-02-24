import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { useOrg } from '../../context/OrgContext';
import timesheetApi from '../../utils/timesheetApi';
import employeeApi from '../../utils/employeeApi';
import { UserPlus, Edit2, X, Loader2, UserCheck, Search, ChevronDown, Hash, Filter } from 'lucide-react';

const RATE_TYPE_LABELS = {
  daily: '₹/day',
  hourly: '$/hour',
  monthly: '₹/month',
};

export default function TimesheetUsers() {
  const { showToast } = useToast();
  const { currentOrg } = useOrg();
  const orgSlug = currentOrg?.slug;
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [linkedEmployee, setLinkedEmployee] = useState(null);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const empDropdownRef = useRef(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const [form, setForm] = useState({
    fullName: '', email: '', password: '', role: 'contractor',
    employeeId: '', phone: '', payType: 'daily', dailyRate: '', monthlyRate: '',
    paidLeavePerMonth: 0, clientBillingRate: '', clientBillingRateType: 'daily', assignedClient: '', assignedProjects: []
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      timesheetApi.get('/auth/users').then(r => setUsers(r.data)),
      timesheetApi.get('/projects').then(r => setProjects(r.data)),
      timesheetApi.get('/clients').then(r => setClients(r.data)),
    ]).catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  };

  // Fetch all employees for the dropdown
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.list(orgSlug, { status: 'active', limit: 100 }).then(data => {
      setAllEmployees(data?.employees || []);
    }).catch(() => {});
  }, [orgSlug]);

  // Close employee dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (empDropdownRef.current && !empDropdownRef.current.contains(e.target)) {
        setShowEmpDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ fullName: '', email: '', password: '', role: 'contractor', employeeId: '', phone: '', payType: 'daily', dailyRate: '', monthlyRate: '', paidLeavePerMonth: 0, clientBillingRate: '', clientBillingRateType: 'daily', assignedClient: '', assignedProjects: [] });
    setEditing(null); setShowForm(false); setLinkedEmployee(null); setEmpSearch(''); setShowEmpDropdown(false);
  };

  // When an employee is selected from the dropdown, auto-fill form fields
  const selectEmployee = (emp) => {
    setLinkedEmployee(emp);
    setEmpSearch(emp.fullName);
    setShowEmpDropdown(false);

    const dailyRate = emp.billingRate?.daily || '';
    const monthlyRate = emp.billingRate?.monthly || '';
    const payType = dailyRate ? 'daily' : monthlyRate ? 'monthly' : 'daily';

    // Determine clientBillingRate and its type from employee record
    let cbr = '', cbrType = 'daily';
    if (emp.clientBillingRate?.daily) { cbr = emp.clientBillingRate.daily; cbrType = 'daily'; }
    else if (emp.clientBillingRate?.hourly) { cbr = emp.clientBillingRate.hourly; cbrType = 'hourly'; }
    else if (emp.clientBillingRate?.monthly) { cbr = emp.clientBillingRate.monthly; cbrType = 'monthly'; }

    setForm(prev => ({
      ...prev,
      fullName: emp.fullName || prev.fullName,
      email: emp.email || prev.email,
      phone: emp.phone || prev.phone,
      employeeId: emp.employeeId || prev.employeeId,
      dailyRate: dailyRate || prev.dailyRate,
      monthlyRate: monthlyRate || prev.monthlyRate,
      payType,
      clientBillingRate: cbr || prev.clientBillingRate,
      clientBillingRateType: cbr ? cbrType : prev.clientBillingRateType,
    }));
  };

  const startEdit = (user) => {
    setForm({
      fullName: user.fullName, email: user.email, password: '', role: user.role,
      employeeId: user.employeeId || '', phone: user.phone || '',
      payType: user.payType || 'daily', dailyRate: user.dailyRate || '', monthlyRate: user.monthlyRate || '',
      paidLeavePerMonth: user.paidLeavePerMonth || 0, clientBillingRate: user.clientBillingRate || '',
      clientBillingRateType: user.clientBillingRateType || 'daily',
      assignedClient: user.assignedClient?._id || user.assignedClient || '',
      assignedProjects: user.assignedProjects?.map(p => p._id || p) || []
    });
    // Try to find linked employee
    const emp = allEmployees.find(e => e.email === user.email);
    setLinkedEmployee(emp || null);
    setEmpSearch(emp?.fullName || '');
    setEditing(user._id); setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form };
      if (data.dailyRate) data.dailyRate = Number(data.dailyRate);
      if (data.monthlyRate) data.monthlyRate = Number(data.monthlyRate);
      data.paidLeavePerMonth = Number(data.paidLeavePerMonth) || 0;
      if (data.clientBillingRate) data.clientBillingRate = Number(data.clientBillingRate);
      if (!data.assignedClient) delete data.assignedClient;

      if (editing) {
        delete data.password;
        await timesheetApi.put(`/auth/users/${editing}`, data);
        showToast('User updated');
      } else {
        await timesheetApi.post('/auth/register', data);
        showToast('User created');
      }
      resetForm(); load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const toggleActive = async (user) => {
    try {
      await timesheetApi.put(`/auth/users/${user._id}`, { isActive: !user.isActive });
      showToast(user.isActive ? 'User deactivated' : 'User activated');
      load();
    } catch (err) { showToast('Failed to update', 'error'); }
  };

  // Filter employees for dropdown
  const filteredEmployees = allEmployees.filter(emp => {
    if (!empSearch) return true;
    const q = empSearch.toLowerCase();
    return (emp.fullName || '').toLowerCase().includes(q) ||
           (emp.email || '').toLowerCase().includes(q) ||
           (emp.employeeId || '').toLowerCase().includes(q);
  });

  // Filter users for table
  const filteredUsers = users.filter(u => {
    // Status filter
    if (filterStatus === 'active' && !u.isActive) return false;
    if (filterStatus === 'inactive' && u.isActive) return false;
    // Role filter
    if (filterRole && u.role !== filterRole) return false;
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (u.fullName || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q) ||
             (u.employeeId || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-dark-400 text-sm">{filteredUsers.length} of {users.length} users</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 transition-colors">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or ID..."
            className="input-field pl-9 w-full"
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="input-field w-auto min-w-[120px]"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="contractor">Contractor</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input-field w-auto min-w-[120px]"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(searchQuery || filterRole || filterStatus) && (
          <button
            onClick={() => { setSearchQuery(''); setFilterRole(''); setFilterStatus(''); }}
            className="text-xs text-dark-400 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Role</th>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Employee ID</th>
                <th className="text-left px-4 py-3 font-medium text-dark-400">Pay Type</th>
                <th className="text-right px-4 py-3 font-medium text-dark-400">Rate</th>
                <th className="text-center px-4 py-3 font-medium text-dark-400">Status</th>
                <th className="text-center px-4 py-3 font-medium text-dark-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {filteredUsers.map(u => (
                <tr key={u._id} className={`hover:bg-dark-800/50 transition-colors ${!u.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-white">{u.fullName}</td>
                  <td className="px-4 py-3 text-dark-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      u.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                      u.role === 'manager' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-dark-700 text-dark-400'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-dark-300">{u.employeeId || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.payType === 'monthly' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>{u.payType === 'monthly' ? 'Monthly' : 'Daily'}</span>
                    {u.paidLeavePerMonth > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400">{u.paidLeavePerMonth} PL</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-dark-300">
                    {u.payType === 'monthly' ? (u.monthlyRate ? `₹${u.monthlyRate.toLocaleString()}/mo` : '—') : (u.dailyRate ? `₹${u.dailyRate.toLocaleString()}/day` : '—')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(u)} className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => startEdit(u)} className="text-blue-400 hover:text-blue-300"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-dark-500">No users match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-800">
              <h3 className="text-lg font-semibold text-white">{editing ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={resetForm} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">

              {/* Employee Lookup */}
              <div ref={empDropdownRef} className="relative">
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Search size={14} className="text-rivvra-400" />
                    Employee Lookup
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={empSearch}
                    onChange={e => { setEmpSearch(e.target.value); setShowEmpDropdown(true); if (!e.target.value) setLinkedEmployee(null); }}
                    onFocus={() => setShowEmpDropdown(true)}
                    placeholder="Search by name, email, or ID..."
                    className="input-field pr-8"
                  />
                  <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 transition-transform ${showEmpDropdown ? 'rotate-180' : ''}`} />
                </div>
                {showEmpDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-30">
                    {filteredEmployees.length === 0 ? (
                      <p className="text-sm text-dark-500 px-3 py-2">No employees found</p>
                    ) : filteredEmployees.map(emp => (
                      <button
                        key={emp._id}
                        type="button"
                        onClick={() => selectEmployee(emp)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-dark-700 ${
                          linkedEmployee?._id === emp._id ? 'bg-rivvra-500/10 text-rivvra-400' : 'text-dark-300'
                        }`}
                      >
                        <div className="font-medium text-white">{emp.fullName}</div>
                        <div className="flex items-center gap-2 text-xs text-dark-400">
                          <span>{emp.email}</span>
                          {emp.employeeId && <span className="flex items-center gap-0.5"><Hash size={9} />{emp.employeeId}</span>}
                          {emp.billable && <span className="text-amber-400">Billable</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {linkedEmployee && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <UserCheck size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-300">
                    Linked: <strong>{linkedEmployee.fullName}</strong>
                    {linkedEmployee.employeeId && <span className="text-emerald-400/70"> ({linkedEmployee.employeeId})</span>}
                    {linkedEmployee.designation && <span className="text-emerald-400/70"> — {linkedEmployee.designation}</span>}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Full Name *</label>
                  <input type="text" required value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Email *</label>
                  <input type="email" required value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    className="input-field" />
                </div>
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Password *</label>
                  <input type="password" required minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    className="input-field" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                    className="input-field">
                    <option value="contractor">Contractor</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Employee ID</label>
                  <input type="text" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})}
                    className="input-field" />
                </div>
              </div>

              <div className="border border-dark-700 rounded-xl p-4 space-y-3">
                <label className="block text-sm font-semibold text-white">Pay Configuration</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({...form, payType: 'daily'})}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      form.payType === 'daily' ? 'bg-rivvra-500 text-dark-950 border-rivvra-500' : 'bg-dark-800 text-dark-300 border-dark-700 hover:border-dark-600'
                    }`}>Fixed Daily Rate</button>
                  <button type="button" onClick={() => setForm({...form, payType: 'monthly'})}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      form.payType === 'monthly' ? 'bg-rivvra-500 text-dark-950 border-rivvra-500' : 'bg-dark-800 text-dark-300 border-dark-700 hover:border-dark-600'
                    }`}>Fixed Monthly Rate</button>
                </div>
                {form.payType === 'daily' ? (
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Daily Rate (₹)</label>
                    <input type="number" value={form.dailyRate} onChange={e => setForm({...form, dailyRate: e.target.value})} placeholder="e.g. 3000" className="input-field" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Monthly Rate (₹)</label>
                    <input type="number" value={form.monthlyRate} onChange={e => setForm({...form, monthlyRate: e.target.value})} placeholder="e.g. 60000" className="input-field" />
                    <p className="text-[11px] text-dark-500 mt-1">Payable = (Actual days worked / Working days in month) x Monthly rate</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <label className="block text-xs text-dark-400">Paid Leave / Month</label>
                    <p className="text-[11px] text-dark-500">Days counted as worked for pay</p>
                  </div>
                  <select value={form.paidLeavePerMonth} onChange={e => setForm({...form, paidLeavePerMonth: Number(e.target.value)})}
                    className="px-3 py-1.5 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white w-20 focus:outline-none focus:border-rivvra-500">
                    <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Client Billing Rate ({RATE_TYPE_LABELS[form.clientBillingRateType] || '₹/day'})
                </label>
                <input type="number" value={form.clientBillingRate} onChange={e => setForm({...form, clientBillingRate: e.target.value})} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Assigned Client</label>
                  <select value={form.assignedClient} onChange={e => setForm({...form, assignedClient: e.target.value})} className="input-field">
                    <option value="">None</option>
                    {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">Assigned Projects</label>
                  <div className="border border-dark-700 rounded-lg p-2 max-h-28 overflow-y-auto space-y-1 bg-dark-800/50">
                    {projects.length === 0 ? (
                      <p className="text-xs text-dark-500 px-1">No projects</p>
                    ) : (
                      projects.map(p => (
                        <label key={p._id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-dark-700/50 cursor-pointer">
                          <input type="checkbox" checked={form.assignedProjects.includes(p._id)}
                            onChange={e => {
                              const updated = e.target.checked ? [...form.assignedProjects, p._id] : form.assignedProjects.filter(id => id !== p._id);
                              setForm({...form, assignedProjects: updated});
                            }}
                            className="rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500" />
                          <span className="text-sm text-dark-300">{p.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" />
              </div>
              <button type="submit" className="w-full btn-primary">
                {editing ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
