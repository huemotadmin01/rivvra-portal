import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import { ArrowLeft, Save, Loader2, AlertTriangle, Plus, Trash2, Briefcase, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// ComboSelect — searchable dropdown with "Create new" option
// ---------------------------------------------------------------------------
function ComboSelect({ value, displayValue, options, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(displayValue || '');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display value when prop changes
  useEffect(() => { setInputValue(displayValue || ''); }, [displayValue]);

  const trimmed = inputValue.trim().toLowerCase();
  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(trimmed)
  );
  const exactMatch = options.some(o => o.name.toLowerCase() === trimmed);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
            // Clear selection if user is typing something different
            if (value && e.target.value !== displayValue) {
              onChange('', e.target.value.trim());
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field w-full text-sm pr-8"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((o, i) => (
              <button
                key={o._id || `name-${i}`}
                type="button"
                onClick={() => {
                  onChange(o._id || '', o.name);
                  setInputValue(o.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-700 transition-colors ${
                  o._id === value ? 'text-orange-400 bg-dark-700/50' : 'text-white'
                }`}
              >
                {o.name}
              </button>
            ))
          ) : (
            !inputValue.trim() && (
              <div className="px-3 py-2 text-sm text-dark-500">No options available</div>
            )
          )}
          {inputValue.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange('', inputValue.trim());
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-orange-400 hover:bg-dark-700 transition-colors border-t border-dark-700 font-medium"
            >
              + Create &ldquo;{inputValue.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  employeeId: '',
  employmentType: 'confirmed',
  status: 'active',
  department: '',
  designation: '',
  monthlyGrossSalary: '',
  billable: false,
  billingRate: {
    daily: '',
    hourly: '',
    monthly: '',
  },
  clientBillingRate: {
    daily: '',
    hourly: '',
    monthly: '',
  },
  assignments: [],
  joiningDate: '',
  lastWorkingDate: '',
  dateOfBirth: '',
  address: {
    street: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'India',
  },
  emergencyContact: {
    name: '',
    phone: '',
    relation: '',
  },
  bankDetails: {
    accountNumber: '',
    ifsc: '',
    pan: '',
    bankName: '',
  },
};

export default function EmployeeForm() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();

  const isEdit = !!employeeId;
  const orgSlug = currentOrg?.slug;

  const [form, setForm] = useState(INITIAL_FORM);
  const [departments, setDepartments] = useState([]);
  const [tsClients, setTsClients] = useState([]);
  const [tsProjects, setTsProjects] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch departments + timesheet options (clients/projects for assignment dropdowns)
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.listDepartments(orgSlug)
      .then((res) => {
        if (res.success) setDepartments(res.departments || []);
      })
      .catch(() => {});
    employeeApi.getTimesheetOptions(orgSlug)
      .then((res) => {
        if (res.success) {
          setTsClients(res.clients || []);
          setTsProjects(res.projects || []);
        }
      })
      .catch(() => {});
  }, [orgSlug]);

  // Fetch employee data in edit mode
  useEffect(() => {
    if (!isEdit || !orgSlug) return;
    setLoading(true);
    employeeApi.get(orgSlug, employeeId)
      .then((res) => {
        if (res.success && res.employee) {
          const emp = res.employee;
          setForm({
            fullName: emp.fullName || '',
            email: emp.email || '',
            phone: emp.phone || '',
            employeeId: emp.employeeId || '',
            employmentType: emp.employmentType || 'confirmed',
            status: emp.status || 'active',
            department: emp.department || '',
            designation: emp.designation || '',
            monthlyGrossSalary: emp.monthlyGrossSalary ?? '',
            billable: emp.billable || false,
            billingRate: {
              daily: emp.billingRate?.daily ?? '',
              hourly: emp.billingRate?.hourly ?? '',
              monthly: emp.billingRate?.monthly ?? '',
            },
            clientBillingRate: {
              daily: emp.clientBillingRate?.daily ?? '',
              hourly: emp.clientBillingRate?.hourly ?? '',
              monthly: emp.clientBillingRate?.monthly ?? '',
            },
            assignments: (emp.assignments || []).map(a => ({
              clientId: a.clientId || '',
              clientName: a.clientName || '',
              projectId: a.projectId || '',
              projectName: a.projectName || '',
              clientBillingRate: a.clientBillingRate ?? '',
              startDate: a.startDate ? a.startDate.slice(0, 10) : '',
              endDate: a.endDate ? a.endDate.slice(0, 10) : '',
              status: a.status || 'active',
            })),
            joiningDate: emp.joiningDate ? emp.joiningDate.slice(0, 10) : '',
            lastWorkingDate: emp.lastWorkingDate ? emp.lastWorkingDate.slice(0, 10) : '',
            dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.slice(0, 10) : '',
            address: {
              street: emp.address?.street || '',
              street2: emp.address?.street2 || '',
              city: emp.address?.city || '',
              state: emp.address?.state || '',
              zip: emp.address?.zip || '',
              country: emp.address?.country || 'India',
            },
            emergencyContact: {
              name: emp.emergencyContact?.name || '',
              phone: emp.emergencyContact?.phone || '',
              relation: emp.emergencyContact?.relation || '',
            },
            bankDetails: {
              accountNumber: emp.bankDetails?.accountNumber || '',
              ifsc: emp.bankDetails?.ifsc || '',
              pan: emp.bankDetails?.pan || '',
              bankName: emp.bankDetails?.bankName || '',
            },
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load employee:', err);
        setError('Failed to load employee data.');
      })
      .finally(() => setLoading(false));
  }, [isEdit, orgSlug, employeeId]);

  // Generic field updater
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setNested = (section, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  // ── Assignment helpers ──────────────────────────────────────────────
  const addAssignment = () => {
    setForm(prev => ({
      ...prev,
      assignments: [
        ...prev.assignments,
        { clientId: '', clientName: '', projectId: '', projectName: '', clientBillingRate: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', status: 'active' },
      ],
    }));
  };

  const removeAssignment = (idx) => {
    setForm(prev => ({
      ...prev,
      assignments: prev.assignments.filter((_, i) => i !== idx),
    }));
  };

  const updateAssignment = (idx, field, value) => {
    setForm(prev => {
      const updated = [...prev.assignments];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, assignments: updated };
    });
  };

  // Combo handler for client: sets both clientId + clientName
  const setAssignmentClient = (idx, id, name) => {
    setForm(prev => {
      const updated = [...prev.assignments];
      updated[idx] = { ...updated[idx], clientId: id, clientName: name };
      // Reset project when client changes
      if (id !== prev.assignments[idx]?.clientId) {
        updated[idx].projectId = '';
        updated[idx].projectName = '';
      }
      return { ...prev, assignments: updated };
    });
  };

  // Combo handler for project: sets both projectId + projectName
  const setAssignmentProject = (idx, id, name) => {
    setForm(prev => {
      const updated = [...prev.assignments];
      updated[idx] = { ...updated[idx], projectId: id, projectName: name };
      return { ...prev, assignments: updated };
    });
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!form.fullName.trim()) {
      setError('Full Name is required.');
      return;
    }
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if ((form.status === 'resigned' || form.status === 'terminated') && !form.lastWorkingDate) {
      setError('Last Working Date is required when status is Resigned or Terminated.');
      return;
    }

    setSaving(true);
    try {
      const result = isEdit
        ? await employeeApi.update(orgSlug, employeeId, form)
        : await employeeApi.create(orgSlug, form);

      if (result.success && result.employee?._id) {
        navigate(orgPath('/employee/' + result.employee._id));
      } else {
        setError(result.message || 'Something went wrong.');
      }
    } catch (err) {
      console.error('Save failed:', err);
      setError(err.message || 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(orgPath('/employee/directory'))}
          className="p-2 rounded-lg hover:bg-dark-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-dark-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">
          {isEdit ? 'Edit Employee' : 'Add Employee'}
        </h1>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Basic Information ──────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Basic Information</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
                className="input-field w-full"
                placeholder="John Doe"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                className="input-field w-full"
                placeholder="john@example.com"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className="input-field w-full"
                placeholder="+91 98765 43210"
              />
            </div>

            {/* Employee ID */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Employee ID</label>
              <input
                type="text"
                value={form.employeeId}
                onChange={(e) => setField('employeeId', e.target.value)}
                className="input-field w-full"
                placeholder={isEdit ? 'EMP-001' : 'Auto-generated if left blank'}
              />
              {!isEdit && (
                <p className="text-xs text-dark-500 mt-1">Leave blank to auto-generate from the next available ID</p>
              )}
            </div>

            {/* Employment Type */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={(e) => setField('employmentType', e.target.value)}
                className="input-field w-full"
              >
                <option value="confirmed">Confirmed</option>
                <option value="internal_consultant">Internal Consultant</option>
                <option value="external_consultant">External Consultant</option>
                <option value="intern">Intern</option>
              </select>
            </div>

            {/* Status — only in edit mode */}
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className="input-field w-full"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Organization ──────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Organization</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Department</label>
              <select
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                className="input-field w-full"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Designation */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Designation / Job Title
              </label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => setField('designation', e.target.value)}
                className="input-field w-full"
                placeholder="Software Engineer"
              />
            </div>

            {/* Monthly Gross Salary */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Monthly Gross Salary
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  value={form.monthlyGrossSalary}
                  onChange={(e) => setField('monthlyGrossSalary', e.target.value)}
                  className="input-field w-full pl-7"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Billable */}
            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setField('billable', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-dark-600 rounded-full peer peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm font-medium text-dark-300">Billable</span>
            </div>
          </div>
        </div>

        {/* ── Candidate Billing Rate ──────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Candidate Billing Rate</h2>
          <p className="text-sm text-dark-400">The rate at which this candidate/employee is paid. Fill in one rate type that applies.</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Candidate Rate — Daily */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Candidate Rate ({'\u20B9'}/day)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">{'\u20B9'}</span>
                <input
                  type="number"
                  value={form.billingRate.daily}
                  onChange={(e) => setNested('billingRate', 'daily', e.target.value)}
                  className="input-field w-full pl-7"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Candidate Rate — Hourly */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Candidate Rate ($/hour)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">$</span>
                <input
                  type="number"
                  value={form.billingRate.hourly}
                  onChange={(e) => setNested('billingRate', 'hourly', e.target.value)}
                  className="input-field w-full pl-7"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Candidate Rate — Monthly */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Candidate Rate ({'\u20B9'}/month)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">{'\u20B9'}</span>
                <input
                  type="number"
                  value={form.billingRate.monthly}
                  onChange={(e) => setNested('billingRate', 'monthly', e.target.value)}
                  className="input-field w-full pl-7"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Project Assignments ───────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Briefcase size={18} className="text-orange-400" />
                Project Assignments
              </h2>
              <p className="text-sm text-dark-400 mt-0.5">Assign this employee to client projects. Each assignment has its own billing rate. Syncs to Timesheet automatically.</p>
            </div>
            <button
              type="button"
              onClick={addAssignment}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg text-sm font-medium hover:bg-orange-500/20 transition-colors"
            >
              <Plus size={14} />
              Add Assignment
            </button>
          </div>

          {form.assignments.length === 0 && (
            <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
              <Briefcase size={24} className="mx-auto mb-2 text-dark-600" />
              <p className="text-dark-500 text-sm">No project assignments yet.</p>
              <p className="text-dark-600 text-xs mt-1">Click "Add Assignment" to assign this employee to a client project.</p>
            </div>
          )}

          {form.assignments.map((assignment, idx) => (
            <div key={idx} className="border border-dark-700 rounded-xl p-4 space-y-3 bg-dark-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-400">Assignment {idx + 1}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={assignment.status}
                    onChange={(e) => updateAssignment(idx, 'status', e.target.value)}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      assignment.status === 'active'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : 'bg-dark-700 text-dark-400 border-dark-600'
                    }`}
                  >
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeAssignment(idx)}
                    className="p-1 text-dark-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Row 1: Client + Project */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Client (ComboSelect — lookup + create) */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Client</label>
                  <ComboSelect
                    value={assignment.clientId}
                    displayValue={assignment.clientName}
                    options={tsClients}
                    onChange={(id, name) => setAssignmentClient(idx, id, name)}
                    placeholder="Search or create client..."
                  />
                </div>
                {/* Project (ComboSelect — filtered by client + create) */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Project</label>
                  <ComboSelect
                    value={assignment.projectId}
                    displayValue={assignment.projectName}
                    options={tsProjects.filter(p => !assignment.clientId || p.clientId === assignment.clientId)}
                    onChange={(id, name) => setAssignmentProject(idx, id, name)}
                    placeholder="Search or create project..."
                  />
                </div>
              </div>

              {/* Row 2: Billing Rate + Start Date + End Date */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Client Billing Rate */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Client Billing Rate ({'\u20B9'}/day)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">{'\u20B9'}</span>
                    <input
                      type="number"
                      value={assignment.clientBillingRate}
                      onChange={(e) => updateAssignment(idx, 'clientBillingRate', e.target.value)}
                      className="input-field w-full pl-7 text-sm"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={assignment.startDate}
                    onChange={(e) => updateAssignment(idx, 'startDate', e.target.value)}
                    className="input-field w-full text-sm"
                  />
                </div>
                {/* End Date */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={assignment.endDate || ''}
                    onChange={(e) => updateAssignment(idx, 'endDate', e.target.value)}
                    className="input-field w-full text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Dates ─────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Dates</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Joining Date */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Joining Date</label>
              <input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setField('joiningDate', e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* Last Working Date */}
            {(form.status === 'resigned' || form.status === 'terminated') && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Last Working Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.lastWorkingDate}
                  onChange={(e) => setField('lastWorkingDate', e.target.value)}
                  className="input-field w-full"
                  required
                />
                {!form.lastWorkingDate && (
                  <p className="text-xs text-red-400 mt-1">Required for resigned/terminated employees</p>
                )}
              </div>
            )}

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* ── Address ───────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Address</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Street</label>
              <input
                type="text"
                value={form.address.street}
                onChange={(e) => setNested('address', 'street', e.target.value)}
                className="input-field w-full"
                placeholder="123 Main Street"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Street 2</label>
              <input
                type="text"
                value={form.address.street2}
                onChange={(e) => setNested('address', 'street2', e.target.value)}
                className="input-field w-full"
                placeholder="Apt, Suite, Floor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">City</label>
              <input
                type="text"
                value={form.address.city}
                onChange={(e) => setNested('address', 'city', e.target.value)}
                className="input-field w-full"
                placeholder="Mumbai"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">State</label>
              <input
                type="text"
                value={form.address.state}
                onChange={(e) => setNested('address', 'state', e.target.value)}
                className="input-field w-full"
                placeholder="Maharashtra"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">ZIP / Pincode</label>
              <input
                type="text"
                value={form.address.zip}
                onChange={(e) => setNested('address', 'zip', e.target.value)}
                className="input-field w-full"
                placeholder="400001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Country</label>
              <input
                type="text"
                value={form.address.country}
                onChange={(e) => setNested('address', 'country', e.target.value)}
                className="input-field w-full"
                placeholder="India"
              />
            </div>
          </div>
        </div>

        {/* ── Emergency Contact ─────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Emergency Contact</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Contact Name</label>
              <input
                type="text"
                value={form.emergencyContact.name}
                onChange={(e) => setNested('emergencyContact', 'name', e.target.value)}
                className="input-field w-full"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Contact Phone</label>
              <input
                type="text"
                value={form.emergencyContact.phone}
                onChange={(e) => setNested('emergencyContact', 'phone', e.target.value)}
                className="input-field w-full"
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Relation</label>
              <input
                type="text"
                value={form.emergencyContact.relation}
                onChange={(e) => setNested('emergencyContact', 'relation', e.target.value)}
                className="input-field w-full"
                placeholder="Spouse"
              />
            </div>
          </div>
        </div>

        {/* ── Bank Details ──────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-lg">Bank Details</h2>
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              <AlertTriangle size={12} />
              Sensitive Data
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Account Number</label>
              <input
                type="text"
                value={form.bankDetails.accountNumber}
                onChange={(e) => setNested('bankDetails', 'accountNumber', e.target.value)}
                className="input-field w-full"
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">IFSC Code</label>
              <input
                type="text"
                value={form.bankDetails.ifsc}
                onChange={(e) => setNested('bankDetails', 'ifsc', e.target.value)}
                className="input-field w-full"
                placeholder="SBIN0001234"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">PAN</label>
              <input
                type="text"
                value={form.bankDetails.pan}
                onChange={(e) => setNested('bankDetails', 'pan', e.target.value)}
                className="input-field w-full"
                placeholder="ABCDE1234F"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Bank Name</label>
              <input
                type="text"
                value={form.bankDetails.bankName}
                onChange={(e) => setNested('bankDetails', 'bankName', e.target.value)}
                className="input-field w-full"
                placeholder="State Bank of India"
              />
            </div>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-6 py-2.5 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                {isEdit ? 'Update Employee' : 'Add Employee'}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate(orgPath('/employee/directory'))}
            className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-6 py-2.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
