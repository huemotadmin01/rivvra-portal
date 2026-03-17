import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useAuth } from '../../context/AuthContext';
import employeeApi from '../../utils/employeeApi';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import InlineField from '../../components/shared/InlineField';
import { getFieldPermission } from '../../config/employeeFieldPermissions';
import {
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Shield,
  User,
  IndianRupee,
  Loader2,
  Briefcase,
  Link2,
  UserPlus,
  Rocket,
  GraduationCap,
  Users,
  FileText,
  Send,
  Trash2,
  AlertTriangle,
  PenLine,
  Plus,
  X,
  History,
} from 'lucide-react';
import InviteEmployeeModal from '../../components/employee/InviteEmployeeModal';
import LaunchPlanModal from '../../components/employee/LaunchPlanModal';
import PlanProgress from '../../components/employee/PlanProgress';
import ActivityPanel from '../../components/shared/ActivityPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(val) {
  if (!val) return null;
  return new Date(val).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(val) {
  if (val == null) return null;
  return `\u20B9${Number(val).toLocaleString()}`;
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Badge({ children, className }) {
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{label}</span>
      <span className="text-white text-sm">{value ?? '\u2014'}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} className="text-dark-400" />}
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employment type / status badge helpers
// ---------------------------------------------------------------------------

const EMPLOYMENT_TYPE_CONFIG = {
  confirmed: { label: 'Confirmed', className: 'bg-emerald-500/10 text-emerald-400' },
  internal_consultant: { label: 'Internal Consultant', className: 'bg-purple-500/10 text-purple-400' },
  external_consultant: { label: 'External Consultant', className: 'bg-blue-500/10 text-blue-400' },
  intern: { label: 'Intern', className: 'bg-amber-500/10 text-amber-400' },
};

function employmentTypeBadge(type, configMap) {
  if (!type) return null;
  const map = configMap || EMPLOYMENT_TYPE_CONFIG;
  const cfg = map[type] || { label: type, className: 'bg-dark-700 text-dark-300' };
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function statusBadge(status) {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === 'active') {
    return <Badge className="bg-green-500/10 text-green-400">Active</Badge>;
  }
  if (lower === 'resigned') {
    return <Badge className="bg-red-500/10 text-red-400">Resigned</Badge>;
  }
  if (lower === 'terminated') {
    return <Badge className="bg-red-600/10 text-red-500">Terminated</Badge>;
  }
  return (
    <Badge className="bg-dark-700 text-dark-400">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EmployeeDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { user } = useAuth();

  const [employee, setEmployee] = useState(null);
  usePageTitle(employee?.name);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showLaunchPlanModal, setShowLaunchPlanModal] = useState(false);
  const [sendingOnboardingLink, setSendingOnboardingLink] = useState(false);
  const [employeeDocs, setEmployeeDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline editing context
  const [myEmployeeId, setMyEmployeeId] = useState(null); // current user's employee _id
  const [departments, setDepartments] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);

  // Dynamic employment types
  const [empTypeMap, setEmpTypeMap] = useState(EMPLOYMENT_TYPE_CONFIG);

  useEffect(() => {
    getPublicPlatformSetting('employment_types')
      .then(res => {
        if (res?.items?.length) {
          const colorPool = ['bg-teal-500/10 text-teal-400', 'bg-pink-500/10 text-pink-400', 'bg-cyan-500/10 text-cyan-400', 'bg-rose-500/10 text-rose-400'];
          const merged = { ...EMPLOYMENT_TYPE_CONFIG };
          res.items.forEach((t, i) => {
            if (!merged[t.key]) {
              merged[t.key] = { label: t.label, className: colorPool[i % colorPool.length] };
            } else {
              merged[t.key] = { ...merged[t.key], label: t.label };
            }
          });
          setEmpTypeMap(merged);
        }
      })
      .catch(() => {});
  }, []);

  // CTC management state
  const [showSetCtc, setShowSetCtc] = useState(false);
  const [showReviseCtc, setShowReviseCtc] = useState(false);
  const [ctcForm, setCtcForm] = useState({ ctcAnnual: '', effectiveFrom: '', reason: '' });
  const [ctcSaving, setCtcSaving] = useState(false);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [salaryHistoryLoading, setSalaryHistoryLoading] = useState(false);

  const isAdmin = getAppRole('employee') === 'admin';
  const appRole = getAppRole('employee') || 'member';

  // Determine viewer context for inline editing
  const isSelf = !!(employee && user && employee.linkedUserId === user._id);
  const isDirectReport = !!(employee && myEmployeeId && employee.manager &&
    employee.manager.toString() === myEmployeeId);
  const canInlineEdit = isAdmin || isSelf || isDirectReport;

  // Fetch current user's employee ID (for manager check) + dropdown options
  useEffect(() => {
    if (!currentOrg?.slug) return;
    // Get current user's linked employee (for isDirectReport check)
    if (!isAdmin) {
      employeeApi.getMyProfile(currentOrg.slug)
        .then(res => { if (res.success && res.employee) setMyEmployeeId(res.employee._id); })
        .catch(() => {});
    }
    // Fetch departments + manager options for admin/manager dropdowns
    if (isAdmin || appRole === 'manager' || appRole === 'member') {
      employeeApi.listDepartments(currentOrg.slug)
        .then(res => { if (res.success) setDepartments((res.departments || []).map(d => ({ value: d._id, label: d.name }))); })
        .catch(() => {});
      employeeApi.getManagerOptions(currentOrg.slug)
        .then(res => { if (res.success) setManagerOptions((res.managers || []).map(m => ({ value: m._id, label: m.fullName }))); })
        .catch(() => {});
    }
  }, [currentOrg?.slug, isAdmin, appRole]);

  // Inline save handler
  const handleFieldSave = useCallback(async (field, value) => {
    const slug = currentOrg?.slug;
    if (!slug || !employee) throw new Error('Missing context');

    // Build payload — handle nested fields (e.g. "bankDetails.pan")
    let payload;
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      payload = { [parent]: { ...(employee[parent] || {}), [child]: value } };
    } else {
      payload = { [field]: value };
    }

    let res;
    if (isSelf && !isAdmin) {
      res = await employeeApi.updateMyProfile(slug, payload);
    } else {
      res = await employeeApi.update(slug, employee._id, payload);
    }

    if (!res.success) throw new Error(res.error || 'Update failed');

    // Update local state
    setEmployee(prev => {
      if (!prev) return prev;
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return { ...prev, [parent]: { ...(prev[parent] || {}), [child]: value } };
      }
      // For department/manager selects, also update display names
      const updated = { ...prev, [field]: value };
      if (field === 'department') {
        const dept = departments.find(d => d.value === value);
        updated.departmentName = dept?.label || prev.departmentName;
      }
      if (field === 'manager') {
        const mgr = managerOptions.find(m => m.value === value);
        updated.managerName = mgr?.label || prev.managerName;
      }
      return updated;
    });
  }, [currentOrg?.slug, employee, isSelf, isAdmin, departments, managerOptions]);

  // Helper to get permission for a field
  const fp = useCallback((fieldKey) => {
    return getFieldPermission(fieldKey, appRole, isSelf, isDirectReport);
  }, [appRole, isSelf, isDirectReport]);

  useEffect(() => {
    if (!currentOrg?.slug || !employeeId) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    employeeApi
      .get(currentOrg.slug, employeeId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.employee) {
          setEmployee(res.employee);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrg?.slug, employeeId]);

  // Fetch employee documents
  useEffect(() => {
    if (!currentOrg?.slug || !employeeId) return;
    setDocsLoading(true);
    employeeApi.listEmployeeDocs(currentOrg.slug, employeeId)
      .then(res => { if (res.success) setEmployeeDocs(res.documents || []); })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [currentOrg?.slug, employeeId]);

  // Fetch salary history for confirmed / non-billable internal_consultant / intern employees
  const isCompensationEligible = employee && (
    employee.employmentType === 'confirmed' ||
    (employee.employmentType === 'internal_consultant' && employee.billable === false) ||
    employee.employmentType === 'intern'
  );
  // Non-billable ICs and interns use flat TDS mode (admin enters both CTC and gross independently)
  const isFlatTdsEmployee = employee && (
    (employee.employmentType === 'internal_consultant' && employee.billable === false) ||
    employee.employmentType === 'intern'
  );
  const fetchSalaryHistory = async () => {
    if (!currentOrg?.slug || !employeeId || !isAdmin) return;
    setSalaryHistoryLoading(true);
    try {
      const res = await employeeApi.getSalaryHistory(currentOrg.slug, employeeId);
      if (res.success) setSalaryHistory(res.history || []);
    } catch {}
    setSalaryHistoryLoading(false);
  };
  useEffect(() => {
    if (isCompensationEligible) fetchSalaryHistory();
  }, [currentOrg?.slug, employeeId, isCompensationEligible]);

  const handleSetCtc = async () => {
    if (!ctcForm.ctcAnnual || !ctcForm.effectiveFrom || ctcSaving) return;
    setCtcSaving(true);
    try {
      const data = {
        ctcAnnual: Number(ctcForm.ctcAnnual),
        effectiveFrom: ctcForm.effectiveFrom,
      };
      const res = await employeeApi.setCtc(currentOrg.slug, employeeId, data);
      if (res.success) {
        setShowSetCtc(false);
        setCtcForm({ ctcAnnual: '', effectiveFrom: '', reason: '' });
        // Re-fetch employee + salary history
        const empRes = await employeeApi.get(currentOrg.slug, employeeId);
        if (empRes.success) setEmployee(empRes.employee);
        fetchSalaryHistory();
      } else {
        alert(res.error || 'Failed to set CTC');
      }
    } catch (err) {
      alert(err.message || 'Failed to set CTC');
    }
    setCtcSaving(false);
  };

  const handleReviseCtc = async () => {
    if (!ctcForm.ctcAnnual || !ctcForm.effectiveFrom || !ctcForm.reason || ctcSaving) return;
    setCtcSaving(true);
    try {
      const data = {
        ctcAnnual: Number(ctcForm.ctcAnnual),
        effectiveFrom: ctcForm.effectiveFrom,
        reason: ctcForm.reason,
      };
      const res = await employeeApi.reviseCtc(currentOrg.slug, employeeId, data);
      if (res.success) {
        setShowReviseCtc(false);
        setCtcForm({ ctcAnnual: '', effectiveFrom: '', reason: '' });
        const empRes = await employeeApi.get(currentOrg.slug, employeeId);
        if (empRes.success) setEmployee(empRes.employee);
        fetchSalaryHistory();
      } else {
        alert(res.error || 'Failed to revise CTC');
      }
    } catch (err) {
      alert(err.message || 'Failed to revise CTC');
    }
    setCtcSaving(false);
  };

  // ── Send Onboarding Form Link ────────────────────────────────────────────
  const handleSendOnboardingLink = async () => {
    if (!currentOrg?.slug || !employeeId || sendingOnboardingLink) return;
    setSendingOnboardingLink(true);
    try {
      const res = await employeeApi.sendOnboardingLink(currentOrg.slug, employeeId);
      if (res.success) {
        alert('Onboarding form link sent successfully to ' + employee?.email);
      } else {
        alert(res.error || 'Failed to send onboarding link');
      }
    } catch (err) {
      alert(err.message || 'Failed to send onboarding link');
    } finally {
      setSendingOnboardingLink(false);
    }
  };

  // ── Delete Employee ────────────────────────────────────────────────────────
  const handleDeleteEmployee = async () => {
    if (!currentOrg?.slug || !employeeId || deleting) return;
    setDeleting(true);
    try {
      const res = await employeeApi.remove(currentOrg.slug, employeeId);
      if (res.success) {
        navigate(orgPath('/employee/directory'));
      } else {
        alert(res.error || 'Failed to delete employee');
      }
    } catch (err) {
      // Handle 409 — blocking dependencies
      if (err.message && (err.message.includes('timesheet') || err.message.includes('payroll') || err.message.includes('Cannot delete'))) {
        alert(err.message);
      } else {
        alert(err.message || 'Failed to delete employee');
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  // ── 404 state ────────────────────────────────────────────────────────────
  if (notFound || !employee) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center h-72 text-dark-400">
          <User size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Employee not found</p>
        </div>
      </div>
    );
  }

  const emp = employee;
  const addr = emp.address || {};
  const emergency = emp.emergencyContact || {};
  const bank = emp.bankDetails || {};

  const addressLines = [addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country]
    .filter(Boolean)
    .join(', ');

  const hasBankData = bank.accountNumber || bank.ifsc || bank.pan || bank.bankName;

  const maskedAccount = bank.accountNumber
    ? `****${bank.accountNumber.slice(-4)}`
    : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-orange-400">
              {getInitials(emp.fullName)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{emp.fullName}</h1>
                {emp.designation && (
                  <p className="text-dark-400 mt-0.5">{emp.designation}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {emp.departmentName && (
                    <Badge className="bg-dark-700 text-dark-300">
                      {emp.departmentName}
                    </Badge>
                  )}
                  {employmentTypeBadge(emp.employmentType, empTypeMap)}
                  {statusBadge(emp.status)}
                </div>
              </div>

              {/* Action buttons (admin only) */}
              {isAdmin && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Request Details — smart button: invite if not linked, send form if linked */}
                  {emp.email && emp.status === 'active' && (
                    <button
                      onClick={() => emp.linkedUserId ? handleSendOnboardingLink() : setShowInviteModal(true)}
                      disabled={sendingOnboardingLink}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {sendingOnboardingLink ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {sendingOnboardingLink ? 'Sending...' : 'Request Details'}
                    </button>
                  )}
                  {/* Launch Plan */}
                  <button
                    onClick={() => setShowLaunchPlanModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors"
                  >
                    <Rocket size={14} />
                    Launch Plan
                  </button>
                  {/* Delete — available for any employee (backend checks for blocking data) */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Info Sections (2-col grid) ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Work Information */}
        <SectionCard title="Work Information" icon={Building2}>
          <InlineField label="Email" field="email" value={emp.email} type="email"
            editable={fp('email').editable} required={fp('email').required} onSave={handleFieldSave} />
          <InlineField label="Phone" field="phone" value={emp.phone} type="phone"
            editable={fp('phone').editable} required={fp('phone').required} onSave={handleFieldSave} />
          <InlineField label="Employee ID" field="employeeId" value={emp.employeeId}
            editable={fp('employeeId').editable} required={fp('employeeId').required} onSave={handleFieldSave} />
          <InlineField label="Department" field="department" value={emp.department} type="select"
            options={departments} editable={fp('department').editable} required={fp('department').required}
            onSave={handleFieldSave} displayValue={emp.departmentName || null} />
          <InlineField label="Designation" field="designation" value={emp.designation}
            editable={fp('designation').editable} onSave={handleFieldSave} />
          <InlineField label="Manager" field="manager" value={emp.manager} type="select"
            options={managerOptions} editable={fp('manager').editable} required={fp('manager').required}
            onSave={handleFieldSave} displayValue={emp.managerName || null} />
          <InfoRow
            label="Related User"
            value={
              emp.linkedUserName ? (
                <Link to={orgPath(`/settings/users/${emp.linkedUserId}`)} className="flex items-center gap-1.5 group">
                  <Link2 size={12} className="text-rivvra-400" />
                  <span className="text-rivvra-400 group-hover:underline">{emp.linkedUserName}</span>
                  {emp.linkedUserEmail && (
                    <span className="text-dark-400">({emp.linkedUserEmail})</span>
                  )}
                </Link>
              ) : null
            }
          />
          {isCompensationEligible && (
            <InfoRow
              label="Annual CTC"
              value={
                (emp.ctcAnnual || salaryHistory.length > 0) ? (
                  <span className="flex items-center gap-2">
                    {formatCurrency(emp.ctcAnnual || salaryHistory[0]?.ctcAnnual)}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setCtcForm({ ctcAnnual: '', effectiveFrom: '', reason: '' });
                          setShowReviseCtc(true);
                        }}
                        className="text-dark-400 hover:text-rivvra-400 transition-colors"
                        title="Revise CTC"
                      >
                        <PenLine size={13} />
                      </button>
                    )}
                  </span>
                ) : isAdmin ? (
                  <button
                    onClick={() => {
                      setCtcForm({ ctcAnnual: '', effectiveFrom: '', reason: '' });
                      setShowSetCtc(true);
                    }}
                    className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors"
                  >
                    <Plus size={12} /> Set CTC
                  </button>
                ) : '—'
              }
            />
          )}
          <InlineField label="Billable" field="billable" value={emp.billable} type="toggle"
            editable={fp('billable').editable} onSave={handleFieldSave} />
          {(emp.employmentType === 'confirmed' || emp.employmentType === 'intern') && (
            <InlineField label="Joining Date" field="joiningDate" value={emp.joiningDate} type="date"
              editable={fp('joiningDate').editable} required={fp('joiningDate').required} onSave={handleFieldSave} />
          )}
          <InfoRow
            label="Salary Disbursement"
            value={
              emp.employmentType === 'confirmed' || emp.employmentType === 'intern'
                ? 'Last day of the month'
                : null
            }
          />
        </SectionCard>

        {/* Personal Information */}
        <SectionCard title="Personal Information" icon={User}>
          <InlineField label="Private Email" field="privateEmail" value={emp.privateEmail} type="email"
            editable={fp('privateEmail').editable} onSave={handleFieldSave} />
          <InlineField label="Private Phone" field="privatePhone" value={emp.privatePhone || emp.alternatePhone} type="phone"
            editable={fp('privatePhone').editable} onSave={handleFieldSave} />
          {(emp.employmentType === 'confirmed' || emp.employmentType === 'intern') && (
            <InlineField label="Date of Birth" field="dateOfBirth" value={emp.dateOfBirth} type="date"
              editable={fp('dateOfBirth').editable} required={fp('dateOfBirth').required} onSave={handleFieldSave} />
          )}
          <InlineField label="Gender" field="gender" value={emp.gender} type="select"
            options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]}
            editable={fp('gender').editable} required={fp('gender').required} onSave={handleFieldSave} />
          <InlineField label="Blood Group" field="bloodGroup" value={emp.bloodGroup} type="select"
            options={['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(v => ({ value: v, label: v }))}
            editable={fp('bloodGroup').editable} onSave={handleFieldSave} />
          <InlineField label="Father's Name" field="fatherName" value={emp.fatherName}
            editable={fp('fatherName').editable} required={fp('fatherName').required} onSave={handleFieldSave} />
          <InlineField label="Nationality" field="nationality" value={emp.nationality}
            editable={fp('nationality').editable} onSave={handleFieldSave} />
          <InlineField label="Marital Status" field="maritalStatus" value={emp.maritalStatus} type="select"
            options={[{ value: 'Single', label: 'Single' }, { value: 'Married', label: 'Married' }, { value: 'Divorced', label: 'Divorced' }, { value: 'Widowed', label: 'Widowed' }]}
            editable={fp('maritalStatus').editable} onSave={handleFieldSave} />
          {emp.maritalStatus === 'Married' && (
            <InlineField label="Spouse Name" field="spouseName" value={emp.spouseName}
              editable={fp('spouseName').editable} onSave={handleFieldSave} />
          )}
          <InlineField label="Religion" field="religion" value={emp.religion}
            editable={fp('religion').editable} onSave={handleFieldSave} />
        </SectionCard>

        {/* Address */}
        <SectionCard title="Address" icon={MapPin}>
          <InfoRow label="Full Address" value={addressLines || null} />
        </SectionCard>

        {/* Emergency Contact */}
        <SectionCard title="Emergency Contact" icon={Phone}>
          <InlineField label="Name" field="emergencyContact.name" value={emergency.name}
            editable={fp('emergencyContact.name').editable} onSave={handleFieldSave} />
          <InlineField label="Phone" field="emergencyContact.phone" value={emergency.phone} type="phone"
            editable={fp('emergencyContact.phone').editable} onSave={handleFieldSave} />
          <InlineField label="Relation" field="emergencyContact.relation" value={emergency.relation}
            editable={fp('emergencyContact.relation').editable} onSave={handleFieldSave} />
        </SectionCard>

        {/* Bank Details (admin only) */}
        {isAdmin && (
          <SectionCard title="Bank Details" icon={Shield}>
            <InlineField label="Account Number" field="bankDetails.accountNumber" value={bank.accountNumber}
              type="masked" maskFn={v => v ? '****' + String(v).slice(-4) : null}
              editable={fp('bankDetails.accountNumber').editable} onSave={handleFieldSave} />
            <InlineField label="IFSC" field="bankDetails.ifsc" value={bank.ifsc}
              editable={fp('bankDetails.ifsc').editable} onSave={handleFieldSave} />
            <InlineField label="PAN" field="bankDetails.pan" value={bank.pan}
              editable={fp('bankDetails.pan').editable} required={fp('bankDetails.pan').required} onSave={handleFieldSave} />
            <InlineField label="Bank Name" field="bankDetails.bankName" value={bank.bankName}
              editable={fp('bankDetails.bankName').editable} onSave={handleFieldSave} />
          </SectionCard>
        )}
      </div>

      {/* ── Separation Details (for resigned / terminated) ─────────────── */}
      {(emp.status === 'resigned' || emp.status === 'terminated') && (
        <div className="mt-5">
          <div className="card p-5 border-red-500/20">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-red-400" />
              <h3 className="text-white font-semibold">Separation Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Status</p>
                <p className="text-red-400 font-medium capitalize">{emp.status}</p>
              </div>
              <div>
                <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Last Working Date</p>
                <p className="text-white">{formatDate(emp.lastWorkingDate) || '—'}</p>
              </div>
              <div>
                <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Separation Reason</p>
                <p className="text-white">{emp.separationReason || 'Not specified'}</p>
              </div>
            </div>
            {emp.separationNotes && (
              <div className="mt-3 pt-3 border-t border-dark-700">
                <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Notes</p>
                <p className="text-dark-300 text-sm">{emp.separationNotes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Statutory Details (admin only) ──────────────────────────────── */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <SectionCard title="Statutory Details" icon={FileText}>
            <InlineField label="Aadhaar" field="statutory.aadhaar" value={emp.statutory?.aadhaar}
              editable={fp('statutory.aadhaar').editable} onSave={handleFieldSave} />
            <InlineField label="UAN" field="statutory.uan" value={emp.statutory?.uan}
              editable={fp('statutory.uan').editable} onSave={handleFieldSave} />
            <InlineField label="PF Number" field="statutory.pfNumber" value={emp.statutory?.pfNumber}
              editable={fp('statutory.pfNumber').editable} onSave={handleFieldSave} />
            <InlineField label="ESIC" field="statutory.esicNumber" value={emp.statutory?.esicNumber}
              editable={fp('statutory.esicNumber').editable} onSave={handleFieldSave} />
          </SectionCard>
        </div>
      )}

      {/* ── Family Members ─────────────────────────────────────────────── */}
      {Array.isArray(emp.familyMembers) && emp.familyMembers.length > 0 && (
        <div className="mt-5">
          <SectionCard title={`Family Members (${emp.familyMembers.length})`} icon={Users}>
            <div className="space-y-2">
              {emp.familyMembers.map((fm, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-dark-800 last:border-0">
                  <div>
                    <span className="text-white text-sm">{fm.name}</span>
                    {fm.relation && <span className="text-dark-400 text-xs ml-2">({fm.relation})</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-dark-500">
                    {fm.phone && <span>{fm.phone}</span>}
                    {fm.isDependent && <Badge className="bg-blue-500/10 text-blue-400">Dependent</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Education ──────────────────────────────────────────────────── */}
      {Array.isArray(emp.education) && emp.education.length > 0 && (
        <div className="mt-5">
          <SectionCard title={`Education (${emp.education.length})`} icon={GraduationCap}>
            <div className="space-y-2">
              {emp.education.map((ed, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-dark-800 last:border-0">
                  <div>
                    <span className="text-white text-sm font-medium">{ed.degree}</span>
                    {ed.institution && <span className="text-dark-400 text-sm ml-2">— {ed.institution}</span>}
                    {ed.specialization && <span className="text-dark-500 text-xs ml-2">({ed.specialization})</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-dark-500">
                    {ed.yearOfPassing && <span>{ed.yearOfPassing}</span>}
                    {ed.percentage && <span>{ed.percentage}%</span>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Documents ────────────────────────────────────────────────────── */}
      {employeeDocs.length > 0 && (
        <div className="mt-5">
          <SectionCard title={`Documents (${employeeDocs.length})`} icon={FileText}>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-dark-500 text-sm py-2">
                <Loader2 size={14} className="animate-spin" /> Loading...
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { key: 'bank_proof', label: 'Bank Proof' },
                  { key: 'education_certificate', label: 'Education Certificates' },
                  { key: 'id_document', label: 'ID Documents' },
                  { key: 'other', label: 'Other' },
                ].map(({ key, label }) => {
                  const catDocs = employeeDocs.filter(d => d.category === key);
                  if (catDocs.length === 0) return null;
                  return (
                    <div key={key}>
                      <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">{label}</p>
                      <div className="space-y-1.5">
                        {catDocs.map(doc => (
                          <div key={doc._id} className="flex items-center gap-3 bg-dark-900/50 rounded-lg px-4 py-2.5">
                            <FileText size={14} className="text-dark-400 flex-shrink-0" />
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const url = employeeApi.getEmployeeDocUrl(currentOrg.slug, employeeId, doc._id);
                                  const token = localStorage.getItem('rivvra_token');
                                  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                  if (!res.ok) throw new Error();
                                  const blob = await res.blob();
                                  const blobUrl = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = blobUrl; a.download = doc.filename;
                                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                  URL.revokeObjectURL(blobUrl);
                                } catch (_) {}
                              }}
                              className="text-sm text-blue-400 hover:underline truncate flex-1 text-left"
                            >
                              {doc.filename}
                            </button>
                            <span className="text-xs text-dark-500 flex-shrink-0">
                              {doc.size < 1024 * 1024 ? `${(doc.size / 1024).toFixed(0)}KB` : `${(doc.size / (1024 * 1024)).toFixed(1)}MB`}
                            </span>
                            <span className="text-xs text-dark-600 flex-shrink-0">
                              {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── Activities & Log Notes ─────────────────────────────────────── */}
      <div className="mt-5">
        <ActivityPanel orgSlug={currentOrg?.slug} entityType="employee" entityId={employeeId} />
      </div>

      {/* ── Project Assignments (full-width) ────────────────────────────── */}
      {Array.isArray(emp.assignments) && emp.assignments.length > 0 && (
        <div className="card p-5 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-orange-400" />
            <h3 className="text-white font-semibold">Project Assignments</h3>
            <span className="ml-auto text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full font-medium">
              {emp.assignments.filter(a => a.status === 'active').length} active
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Project</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Candidate Rate</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Client Rate</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Start Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">End Date</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {emp.assignments.map((a, i) => {
                  const br = a.billingRate || {};
                  const cbr = typeof a.clientBillingRate === 'number'
                    ? { daily: a.clientBillingRate }
                    : (a.clientBillingRate || {});
                  const fmtRate = (r) => {
                    if (r.daily) return `${formatCurrency(r.daily)}/day`;
                    if (r.hourly) return `$${Number(r.hourly).toLocaleString()}/hr`;
                    if (r.monthly) return `${formatCurrency(r.monthly)}/mo`;
                    return '\u2014';
                  };
                  return (
                    <tr key={i} className="hover:bg-dark-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-white">{a.clientName || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-sm text-white">{a.projectName || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-sm text-white text-right">{fmtRate(br)}</td>
                      <td className="px-3 py-2.5 text-sm text-white text-right">{fmtRate(cbr)}</td>
                      <td className="px-3 py-2.5 text-sm text-dark-300">{formatDate(a.startDate)}</td>
                      <td className="px-3 py-2.5 text-sm text-dark-300">{formatDate(a.endDate) || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === 'active'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-dark-700 text-dark-400'
                        }`}>
                          {a.status === 'active' ? 'Active' : 'Ended'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Compensation History ─────────────────────────────────────── */}
      {isCompensationEligible && isAdmin && salaryHistory.length > 0 && (
        <div className="card p-5 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <IndianRupee size={16} className="text-emerald-400" />
            <h3 className="text-white font-semibold">Compensation</h3>
            <span className="ml-auto text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              {salaryHistory.length} revision{salaryHistory.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Effective From</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">CTC / Year</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Gross / Mo</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Structure</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Changed By</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Reason</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {salaryHistory.map((s, i) => (
                  <tr key={s._id} className="hover:bg-dark-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-sm text-dark-300">{formatDate(s.effectiveFrom)}</td>
                    <td className="px-3 py-2.5 text-sm text-white text-right font-medium">{formatCurrency(s.ctcAnnual)}</td>
                    <td className="px-3 py-2.5 text-sm text-dark-300 text-right">{formatCurrency(s.grossMonthly)}</td>
                    <td className="px-3 py-2.5 text-sm text-dark-300">{s.structureName || '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-dark-300">{s.changedByName || s.createdBy || '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-dark-400 max-w-[200px] truncate" title={s.reason}>{s.reason || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {!s.effectiveTo ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">Current</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-dark-700 text-dark-400">
                          Until {formatDate(s.effectiveTo)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Onboarding/Offboarding Plans ─────────────────────────────── */}
      <div className="mt-5">
        <PlanProgress employeeId={emp._id} isAdmin={isAdmin} />
      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <InviteEmployeeModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInviteSent={() => {
          employeeApi.get(currentOrg.slug, employeeId).then((res) => {
            if (res.success && res.employee) setEmployee(res.employee);
          });
        }}
        employee={emp}
        orgSlug={currentOrg?.slug}
      />

      <LaunchPlanModal
        isOpen={showLaunchPlanModal}
        onClose={() => setShowLaunchPlanModal(false)}
        onLaunched={() => {
          employeeApi.get(currentOrg.slug, employeeId).then((res) => {
            if (res.success && res.employee) setEmployee(res.employee);
          });
        }}
        employee={emp}
        orgSlug={currentOrg?.slug}
      />

      {/* ── Set CTC Modal ──────────────────────────────────────────────── */}
      {showSetCtc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg">Set CTC</h3>
              <button onClick={() => setShowSetCtc(false)} className="text-dark-400 hover:text-white"><X size={18} /></button>
            </div>
            {isFlatTdsEmployee && (
              <div className="bg-dark-900/50 rounded-lg p-3 mb-4">
                <span className="text-dark-400 text-xs">
                  {emp?.employmentType === 'intern' ? 'No deductions (LOP only)' : 'Deduction: Flat 2% TDS only (no PF / ESI / PT)'}
                </span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-1">Annual CTC (₹)</label>
                <input
                  type="number"
                  value={ctcForm.ctcAnnual}
                  onChange={e => setCtcForm(f => ({ ...f, ctcAnnual: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="e.g. 3000000"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-1">Effective From</label>
                <input
                  type="date"
                  value={ctcForm.effectiveFrom}
                  onChange={e => setCtcForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSetCtc(false)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSetCtc}
                disabled={!ctcForm.ctcAnnual || !ctcForm.effectiveFrom || ctcSaving}
                className="px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {ctcSaving && <Loader2 size={14} className="animate-spin" />}
                Set CTC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revise CTC Modal ─────────────────────────────────────────── */}
      {showReviseCtc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg">Revise CTC</h3>
              <button onClick={() => setShowReviseCtc(false)} className="text-dark-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="bg-dark-900/50 rounded-lg p-3 mb-4">
              <div className="flex gap-6">
                <div>
                  <span className="text-dark-400 text-xs">Current CTC</span>
                  <p className="text-white font-medium">{formatCurrency(emp?.ctcAnnual)}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-1">New Annual CTC (₹)</label>
                <input
                  type="number"
                  value={ctcForm.ctcAnnual}
                  onChange={e => setCtcForm(f => ({ ...f, ctcAnnual: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="e.g. 3600000"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-1">Effective From</label>
                <input
                  type="date"
                  value={ctcForm.effectiveFrom}
                  onChange={e => setCtcForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-1">Reason <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={ctcForm.reason}
                  onChange={e => setCtcForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="e.g. Annual appraisal, Promotion"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowReviseCtc(false)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleReviseCtc}
                disabled={!ctcForm.ctcAnnual || !ctcForm.effectiveFrom || !ctcForm.reason || ctcSaving}
                className="px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {ctcSaving && <Loader2 size={14} className="animate-spin" />}
                Revise CTC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Delete Employee</h3>
            </div>

            <p className="text-dark-300 text-sm mb-4">
              This will permanently delete <strong className="text-white">{emp.fullName}</strong> and all their associated documents. This action cannot be undone.
            </p>

            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 mb-6">
              <p className="text-red-400 text-xs font-medium">
                Employees with existing timesheets or payroll records cannot be deleted.
              </p>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
              >
                {deleting ? (
                  <><Loader2 size={14} className="animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 size={14} /> Delete Permanently</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
