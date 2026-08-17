import { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import timesheetApi from '../../utils/timesheetApi';
import employeeApi from '../../utils/employeeApi';
import { UserPlus, Edit2, UserCheck, Search, ChevronDown, Hash } from 'lucide-react';
import {
  PageHeader, FilterBar, SelectChip, DataTable, EmptyState, Modal,
  Field, Input, Select, Button, Chip, Callout,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// A money page: it sets the daily/monthly pay rate and the client billing rate
// that the contractor pay chain reads. So every money string below is carried
// across byte-identical — including `RATE_TYPE_LABELS`, which is wrong (see
// REDESIGN-QA.md: `hourly` is denominated in $ while daily and monthly are ₹)
// and is deliberately NOT corrected here. Changing what a rate label says is a
// change to what the number means; that is a decision to take on purpose, not
// a side effect of a theme migration.
// ─────────────────────────────────────────────────────────────────────────────

const RATE_TYPE_LABELS = {
  daily: '₹/day',
  hourly: '$/hour',
  monthly: '₹/month',
};

// Badge hues move to Chip's tone set rather than being reproduced exactly.
// Legacy used purple for admin, blue for manager, indigo/amber for pay type —
// hues Chip doesn't carry. Hand-rolling accent chips to match is precisely the
// pairing that failed on my-attendance (an accent on a wash of itself), and
// Chip's tones already encode the measured `-ink` corrections. The hue here is
// decoration, not data, so the safe pairing wins. `warn` marks the elevated
// privilege, which is the one worth noticing in a list of users.
const ROLE_TONE = { admin: 'warn', manager: 'info' };
const PAY_TONE = { monthly: 'info', daily: 'warn' };

export default function TimesheetUsersV2() {
  const { showToast } = useToast();
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
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
    setUsers([]);
    setProjects([]);
    setClients([]);
    Promise.all([
      timesheetApi.get('/auth/users').then(r => setUsers(
        (r.data || []).map(u => ({
          ...u,
          // Derive isActive from employee status field (employees collection uses status, not isActive)
          isActive: u.isActive ?? (u.status !== 'resigned' && u.status !== 'terminated'),
        }))
      )),
      timesheetApi.get('/projects').then(r => setProjects(r.data)),
      timesheetApi.get('/clients').then(r => setClients(r.data)),
    ]).catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  };

  // Fetch all employees for the dropdown
  useEffect(() => {
    if (!orgSlug) return;
    setAllEmployees([]);
    employeeApi.list(orgSlug, { status: 'active', limit: 100 }).then(data => {
      setAllEmployees(data?.employees || []);
    }).catch(() => {});
  }, [orgSlug, currentCompany?._id]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [currentCompany?._id]);

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
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed', 'error'); }
  };

  const toggleActive = async (user) => {
    try {
      const newStatus = user.isActive ? 'resigned' : 'active';
      await employeeApi.update(orgSlug, user._id, { status: newStatus });
      showToast(user.isActive ? 'User deactivated' : 'User activated');
      load();
    } catch (err) { showToast('Failed to update status', 'error'); }
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
    if (filterStatus === 'resigned' && u.isActive) return false;
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

  const hasFilters = searchQuery || filterRole || filterStatus;

  const columns = [
    { key: 'fullName', header: 'Name', width: 180,
      render: (u) => <span style={{ fontWeight: 600, color: u.isActive ? 'var(--fg)' : 'var(--fg-4)' }}>{u.fullName}</span> },
    { key: 'email', header: 'Email', width: 220, muted: true },
    { key: 'role', header: 'Role', width: 120,
      render: (u) => <Chip tone={ROLE_TONE[u.role]} style={{ textTransform: 'capitalize' }}>{u.role}</Chip> },
    { key: 'employeeId', header: 'Employee ID', width: 130, muted: true,
      render: (u) => u.employeeId || '—' },
    { key: 'payType', header: 'Pay Type', width: 150,
      render: (u) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Chip tone={PAY_TONE[u.payType === 'monthly' ? 'monthly' : 'daily']}>
            {u.payType === 'monthly' ? 'Monthly' : 'Daily'}
          </Chip>
          {u.paidLeavePerMonth > 0 && <Chip tone="brand">{u.paidLeavePerMonth} PL</Chip>}
        </span>
      ) },
    // Money. Byte-identical to legacy, including the hardcoded ₹ — see the
    // header comment and REDESIGN-QA.md.
    { key: 'rate', header: 'Rate', width: 130, align: 'right', muted: true,
      render: (u) => (u.payType === 'monthly' ? (u.monthlyRate ? `₹${u.monthlyRate.toLocaleString()}/mo` : '—') : (u.dailyRate ? `₹${u.dailyRate.toLocaleString()}/day` : '—')) },
    { key: 'status', header: 'Status', width: 110, align: 'center',
      render: (u) => (
        // Behaviour preserved exactly: one click flips the employee between
        // active and resigned, with no confirmation. That is flagged as the
        // top finding in the PR rather than fixed here — adding a confirm is a
        // behaviour change and belongs in its own commit.
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleActive(u); }}
          title={u.isActive ? 'Click to mark this person resigned' : 'Click to reactivate'}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
        >
          <Chip tone={u.isActive ? 'brand' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Chip>
        </button>
      ) },
    { key: 'actions', header: 'Actions', width: 90, align: 'center',
      render: (u) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit ${u.fullName}`}
          onClick={(e) => { e.stopPropagation(); startEdit(u); }}
          iconLeft={<Edit2 size={15} />}
        />
      ) },
  ];

  return (
    <div>
      <PageHeader
        title="User Management"
        sub={`${filteredUsers.length} of ${users.length} users`}
        actions={(
          <Button size="sm" iconLeft={<UserPlus size={14} />} onClick={() => { resetForm(); setShowForm(true); }}>
            Add User
          </Button>
        )}
      />

      <FilterBar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, email, or ID…"
        resultCount={filteredUsers.length}
        noun="user"
        onClearAll={hasFilters ? () => { setSearchQuery(''); setFilterRole(''); setFilterStatus(''); } : undefined}
        filters={[]}
        left={(
          <>
            <SelectChip
              label="Role"
              value={filterRole}
              onChange={setFilterRole}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'manager', label: 'Manager' },
                { value: 'employee', label: 'Employee' },
                { value: 'contractor', label: 'Contractor' },
              ]}
            />
            <SelectChip
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'resigned', label: 'Resigned' },
              ]}
            />
          </>
        )}
        style={{ marginBottom: 14 }}
      />

      <DataTable
        columns={columns}
        rows={filteredUsers}
        rowKey="_id"
        loading={loading}
        stickyHeader
        empty={<EmptyState title="No users match the current filters" />}
      />

      <Modal
        open={showForm}
        onClose={resetForm}
        size="md"
        title={editing ? 'Edit User' : 'Add New User'}
      >
        <form id="user-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>

          {/* Employee Lookup */}
          <div ref={empDropdownRef} style={{ position: 'relative' }}>
            <Field label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Search size={13} style={{ color: 'var(--brand-ink)' }} />Employee Lookup</span>}>
              <div style={{ position: 'relative' }}>
                <Input
                  type="text"
                  value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); setShowEmpDropdown(true); if (!e.target.value) setLinkedEmployee(null); }}
                  onFocus={() => setShowEmpDropdown(true)}
                  placeholder="Search by name, email, or ID…"
                  style={{ paddingRight: 30 }}
                />
                <ChevronDown
                  size={14}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: `translateY(-50%) rotate(${showEmpDropdown ? 180 : 0}deg)`,
                    color: 'var(--fg-4)', transition: 'transform var(--d-1) var(--e-out)', pointerEvents: 'none',
                  }}
                />
              </div>
            </Field>
            {showEmpDropdown && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
                background: 'var(--surface-2)', border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-2)', boxShadow: 'var(--shadow-2, 0 12px 32px rgba(0,0,0,.35))',
                maxHeight: 192, overflowY: 'auto',
              }}>
                {filteredEmployees.length === 0 ? (
                  <p style={{ font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', padding: '10px 12px', margin: 0 }}>
                    No employees found
                  </p>
                ) : filteredEmployees.map(emp => (
                  <button
                    key={emp._id}
                    type="button"
                    onClick={() => selectEmployee(emp)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                      border: 'none', cursor: 'pointer',
                      background: linkedEmployee?._id === emp._id ? 'var(--brand-soft)' : 'transparent',
                    }}
                  >
                    <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{emp.fullName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginTop: 2 }}>
                      <span>{emp.email}</span>
                      {emp.employeeId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Hash size={9} />{emp.employeeId}</span>}
                      {emp.billable && <span style={{ color: 'var(--warn-ink)' }}>Billable</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {linkedEmployee && (
            <Callout tone="brand" icon={<UserCheck size={16} />}>
              Linked: <strong>{linkedEmployee.fullName}</strong>
              {linkedEmployee.employeeId && <span> ({linkedEmployee.employeeId})</span>}
              {linkedEmployee.designation && <span> — {linkedEmployee.designation}</span>}
            </Callout>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            <Field label="Full Name" required htmlFor="u-name">
              <Input id="u-name" type="text" required value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} />
            </Field>
            <Field label="Email" required htmlFor="u-email">
              <Input id="u-email" type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </Field>
          </div>

          {!editing && (
            <Field label="Password" required htmlFor="u-pass">
              <Input id="u-pass" type="password" required minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </Field>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            <Field label="Role" htmlFor="u-role">
              <Select id="u-role" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="contractor">Contractor</option>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Employee ID" htmlFor="u-empid">
              <Input id="u-empid" type="text" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} />
            </Field>
          </div>

          {/* ── Pay Configuration ── */}
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 'var(--r-2)', padding: 14, display: 'grid', gap: 12 }}>
            <div style={{ font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Pay Configuration</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" block size="sm"
                variant={form.payType === 'daily' ? 'primary' : 'secondary'}
                onClick={() => setForm({...form, payType: 'daily'})}>
                Fixed Daily Rate
              </Button>
              <Button type="button" block size="sm"
                variant={form.payType === 'monthly' ? 'primary' : 'secondary'}
                onClick={() => setForm({...form, payType: 'monthly'})}>
                Fixed Monthly Rate
              </Button>
            </div>
            {form.payType === 'daily' ? (
              <Field label="Daily Rate (₹)" htmlFor="u-daily">
                <Input id="u-daily" type="number" value={form.dailyRate} onChange={e => setForm({...form, dailyRate: e.target.value})} placeholder="e.g. 3000" />
              </Field>
            ) : (
              <Field
                label="Monthly Rate (₹)"
                htmlFor="u-monthly"
                hint="Payable = (Actual days worked / Working days in month) x Monthly rate"
              >
                <Input id="u-monthly" type="number" value={form.monthlyRate} onChange={e => setForm({...form, monthlyRate: e.target.value})} placeholder="e.g. 60000" />
              </Field>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ font: "500 12px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>Paid Leave / Month</div>
                <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>Days counted as worked for pay</div>
              </div>
              <Select
                aria-label="Paid leave per month"
                value={form.paidLeavePerMonth}
                onChange={e => setForm({...form, paidLeavePerMonth: Number(e.target.value)})}
                style={{ width: 76 }}
              >
                <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </Select>
            </div>
          </div>

          <Field label={`Client Billing Rate (${RATE_TYPE_LABELS[form.clientBillingRateType] || '₹/day'})`} htmlFor="u-cbr">
            <Input id="u-cbr" type="number" value={form.clientBillingRate} onChange={e => setForm({...form, clientBillingRate: e.target.value})} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            <Field label="Assigned Client" htmlFor="u-client">
              <Select id="u-client" value={form.assignedClient} onChange={e => setForm({...form, assignedClient: e.target.value})}>
                <option value="">None</option>
                {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Assigned Projects">
              <div style={{
                border: '1px solid var(--line-2)', borderRadius: 'var(--r-1)', padding: 8,
                maxHeight: 112, overflowY: 'auto', display: 'grid', gap: 2, background: 'var(--surface-2)',
              }}>
                {projects.length === 0 ? (
                  <p style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, padding: 2 }}>No projects</p>
                ) : (
                  projects.map(p => (
                    <label key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', borderRadius: 'var(--r-1)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.assignedProjects.includes(p._id)}
                        onChange={e => {
                          const updated = e.target.checked ? [...form.assignedProjects, p._id] : form.assignedProjects.filter(id => id !== p._id);
                          setForm({...form, assignedProjects: updated});
                        }}
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      <span style={{ font: "400 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{p.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
          </div>

          <Field label="Phone" htmlFor="u-phone">
            <Input id="u-phone" type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </Field>

          <Button type="submit" block>
            {editing ? 'Update User' : 'Create User'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
