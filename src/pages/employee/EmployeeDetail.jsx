import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useAuth } from '../../context/AuthContext';
import employeeApi from '../../utils/employeeApi';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import timesheetApi from '../../utils/timesheetApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import InlineField from '../../components/shared/InlineField';
import { getFieldPermission } from '../../config/employeeFieldPermissions';
import { formatDateUTC, toDateInputValue, todayStr } from '../../utils/dateUtils';
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
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Upload,
  Download,
} from 'lucide-react';
import InviteEmployeeModal from '../../components/employee/InviteEmployeeModal';
import LaunchPlanModal from '../../components/employee/LaunchPlanModal';
import PlanProgress from '../../components/employee/PlanProgress';
import ActivityPanel from '../../components/shared/ActivityPanel';
import ComboSelect from '../../components/ComboSelect';
import AssignmentDocs from '../../components/employee/AssignmentDocs';
import { Paperclip } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(val) {
  return formatDateUTC(val);
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
  const [docUploadOpen, setDocUploadOpen] = useState(null); // category key of open dropdown
  const [docUploading, setDocUploading] = useState(null); // category key currently uploading
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

  // Fetch disbursement rules from payroll settings
  useEffect(() => {
    timesheetApi.get('/payroll-settings')
      .then(r => { if (r.data?.disbursementRules) setDisbursementRules(r.data.disbursementRules); })
      .catch(() => {});
  }, []);

  // CTC management state
  const [showSetCtc, setShowSetCtc] = useState(false);
  const [showReviseCtc, setShowReviseCtc] = useState(false);
  const [ctcForm, setCtcForm] = useState({ ctcAnnual: '', effectiveFrom: '', reason: '' });
  const [ctcSaving, setCtcSaving] = useState(false);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [salaryHistoryLoading, setSalaryHistoryLoading] = useState(false);

  // Disbursement rules from payroll settings (read-only display)
  const [disbursementRules, setDisbursementRules] = useState(null);

  // Assignment edit modal state
  const [editAssignment, setEditAssignment] = useState(null); // { index, ...assignmentData }
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [tsClients, setTsClients] = useState([]);
  const [tsProjects, setTsProjects] = useState([]);

  // Rate revision state
  const [reviseModal, setReviseModal] = useState(null); // { assignmentIndex, currentRates }
  const [reviseForm, setReviseForm] = useState({ effectiveDate: '', billingRate: { daily: '', hourly: '', monthly: '' }, clientBillingRate: { daily: '', hourly: '', monthly: '' }, paidLeavePerMonth: '', reason: '' });
  const [revisingRate, setRevisingRate] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState({});
  const [expandedDocs, setExpandedDocs] = useState({});
  const [editingName, setEditingName] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(null);

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
    // Fetch client/project options for assignment editing (admin only)
    if (isAdmin) {
      employeeApi.getTimesheetOptions(currentOrg.slug)
        .then(res => {
          if (res.success) {
            setTsClients((res.clients || []).map(c => ({ _id: c._id, name: c.name })));
            setTsProjects((res.projects || []).map(p => ({ _id: p._id, name: p.name })));
          }
        })
        .catch(() => {});
    }
  }, [currentOrg?.slug, isAdmin, appRole]);

  // Inline save handler
  const handleFieldSave = useCallback(async (field, value) => {
    const slug = currentOrg?.slug;
    if (!slug || !employee) throw new Error('Missing context');

    // Build payload — use dot-notation for nested fields so the backend
    // can $set only the changed sub-field without replacing the entire object.
    const payload = { [field]: value };

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

  // Open assignment edit modal
  const openEditAssignment = useCallback((index) => {
    const a = employee?.assignments?.[index];
    if (!a) return;
    const br = a.billingRate || {};
    const cbr = typeof a.clientBillingRate === 'number'
      ? { daily: a.clientBillingRate, hourly: '', monthly: '' }
      : (a.clientBillingRate || {});
    setEditAssignment({
      index,
      clientId: a.clientId || '',
      clientName: a.clientName || '',
      projectId: a.projectId || '',
      projectName: a.projectName || '',
      billingRate: { daily: br.daily || '', hourly: br.hourly || '', monthly: br.monthly || '' },
      clientBillingRate: { daily: cbr.daily || '', hourly: cbr.hourly || '', monthly: cbr.monthly || '' },
      startDate: toDateInputValue(a.startDate),
      endDate: toDateInputValue(a.endDate),
      status: a.status || 'active',
      paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
    });
  }, [employee]);

  // Save assignment changes
  const handleSaveAssignment = useCallback(async () => {
    if (!editAssignment || !currentOrg?.slug || !employee) return;
    setAssignmentSaving(true);
    try {
      const { index, ...data } = editAssignment;
      // Build cleaned assignments array — only send editable fields
      const assignments = (employee.assignments || []).map((a, i) => {
        const base = {
          clientId: a.clientId || '', clientName: a.clientName || '',
          projectId: a.projectId || '', projectName: a.projectName || '',
          billingRate: a.billingRate || {}, clientBillingRate: a.clientBillingRate || {},
          startDate: a.startDate || '', endDate: a.endDate || '',
          status: a.status || 'active', paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
        };
        return i === index ? { ...base, ...data } : base;
      });
      const res = await employeeApi.update(currentOrg.slug, employee._id, { assignments });
      if (!res.success) throw new Error(res.error || 'Update failed');
      // Refresh employee to get server-resolved data
      const refreshed = await employeeApi.get(currentOrg.slug, employee._id);
      if (refreshed.success && refreshed.employee) setEmployee(refreshed.employee);
      setEditAssignment(null);
    } catch (err) {
      alert(err.message || 'Failed to save assignment');
    } finally {
      setAssignmentSaving(false);
    }
  }, [editAssignment, currentOrg?.slug, employee]);

  // Add new assignment
  const handleAddAssignment = useCallback(() => {
    if (!employee) return;
    const newAssignment = {
      clientId: '', clientName: '', projectId: '', projectName: '',
      billingRate: { daily: '', hourly: '', monthly: '' },
      clientBillingRate: { daily: '', hourly: '', monthly: '' },
      paidLeavePerMonth: 0,
      startDate: todayStr(),
      endDate: '',
      status: 'active',
    };
    // Open modal for new assignment — it will be saved on "Save Assignment"
    const idx = (employee.assignments || []).length;
    setEmployee(prev => prev ? { ...prev, assignments: [...(prev.assignments || []), newAssignment] } : prev);
    setEditAssignment({ index: idx, ...newAssignment });
  }, [employee]);

  // Delete assignment
  const handleDeleteAssignment = useCallback(async (idx) => {
    if (!currentOrg?.slug || !employee) return;
    if (!window.confirm('Delete this assignment?')) return;
    setDeletingAssignment(idx);
    try {
      const res = await employeeApi.deleteAssignment(currentOrg.slug, employee._id, idx);
      if (res.success) {
        setEmployee(prev => prev ? { ...prev, assignments: res.employee.assignments } : prev);
        showToast('Assignment deleted', 'success');
      }
    } catch (err) {
      const msg = err.message || '';
      // Check if blocked due to linked timesheets
      const tsMatch = msg.match(/(\d+) linked timesheet/);
      if (tsMatch) {
        const count = tsMatch[1];
        if (window.confirm(`This assignment has ${count} linked timesheet(s). Delete them too?\n\nThis action cannot be undone.`)) {
          try {
            const forceRes = await employeeApi.deleteAssignment(currentOrg.slug, employee._id, idx, true);
            if (forceRes.success) {
              setEmployee(prev => prev ? { ...prev, assignments: forceRes.employee.assignments } : prev);
              showToast(`Assignment deleted with ${forceRes.deletedTimesheets || count} timesheet(s)`, 'success');
            }
          } catch (forceErr) {
            showToast(forceErr.message || 'Failed to delete', 'error');
          }
        }
      } else {
        showToast(msg || 'Failed to delete assignment', 'error');
      }
    } finally {
      setDeletingAssignment(null);
    }
  }, [currentOrg?.slug, employee]);

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

  // Compensation tracking is available for all non-billable employees on payroll
  const isCompensationEligible = employee && (
    employee.employmentType === 'confirmed' ||
    employee.employmentType === 'internal_consultant' ||
    employee.employmentType === 'intern'
  );
  // Flat TDS mode employees (consultants & interns — admin enters both CTC and gross independently)
  const isFlatTdsEmployee = employee && (
    employee.employmentType === 'internal_consultant' ||
    employee.employmentType === 'intern'
  );
  const fetchSalaryHistory = async () => {
    if (!currentOrg?.slug || !employeeId || !isAdmin) return;
    setSalaryHistoryLoading(true);
    try {
      const res = await employeeApi.getSalaryHistory(currentOrg.slug, employeeId);
      if (res.success) setSalaryHistory(res.history || []);
    } catch (err) {}
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

  // ── Rate Revision ──────────────────────────────────────────────────────────
  const openReviseModal = (idx) => {
    const a = employee.assignments[idx];
    setReviseModal({ assignmentIndex: idx, currentRates: a });
    setReviseForm({
      effectiveDate: todayStr(),
      billingRate: { daily: '', hourly: '', monthly: '' },
      clientBillingRate: { daily: '', hourly: '', monthly: '' },
      paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
      reason: '',
    });
  };

  const handleReviseRate = async () => {
    if (!reviseModal || !employeeId || revisingRate) return;
    if (!reviseForm.effectiveDate) return;
    const hasBR = Object.values(reviseForm.billingRate).some(v => v && Number(v) > 0);
    const hasCBR = Object.values(reviseForm.clientBillingRate).some(v => v && Number(v) > 0);
    if (!hasBR && !hasCBR) return;
    setRevisingRate(true);
    try {
      const payload = {
        effectiveDate: reviseForm.effectiveDate,
        paidLeavePerMonth: Number(reviseForm.paidLeavePerMonth) || 0,
        reason: reviseForm.reason || '',
      };
      if (hasBR) payload.billingRate = { daily: Number(reviseForm.billingRate.daily) || 0, hourly: Number(reviseForm.billingRate.hourly) || 0, monthly: Number(reviseForm.billingRate.monthly) || 0 };
      if (hasCBR) payload.clientBillingRate = { daily: Number(reviseForm.clientBillingRate.daily) || 0, hourly: Number(reviseForm.clientBillingRate.hourly) || 0, monthly: Number(reviseForm.clientBillingRate.monthly) || 0 };
      const result = await employeeApi.reviseRate(currentOrg.slug, employeeId, reviseModal.assignmentIndex, payload);
      if (result.success) {
        setReviseModal(null);
        const empRes = await employeeApi.get(currentOrg.slug, employeeId);
        if (empRes.success) setEmployee(empRes.employee);
      } else {
        alert(result.error || 'Failed to revise rate');
      }
    } catch (err) {
      alert(err.message || 'Failed to revise rate');
    } finally {
      setRevisingRate(false);
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
                <div className="flex items-center gap-2">
                  {editingName ? (
                    <input
                      autoFocus
                      type="text"
                      defaultValue={emp.fullName}
                      className="text-2xl font-bold text-white bg-dark-800 border border-dark-600 rounded-lg px-2 py-0.5 focus:outline-none focus:border-rivvra-500"
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== emp.fullName) {
                          try {
                            const res = await employeeApi.update(currentOrg.slug, emp._id, { fullName: newName });
                            if (res.success) {
                              setEmployee(prev => prev ? { ...prev, fullName: newName } : prev);
                              showToast('Name updated', 'success');
                            }
                          } catch (err) { showToast(err.message || 'Failed to update name', 'error'); }
                        }
                        setEditingName(false);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(false); }}
                    />
                  ) : (
                    <h1 className="text-2xl font-bold text-white">{emp.fullName}</h1>
                  )}
                  {isAdmin && !editingName && (
                    <button onClick={() => setEditingName(true)} className="p-1 text-dark-500 hover:text-white transition-colors" title="Edit name">
                      <PenLine size={14} />
                    </button>
                  )}
                </div>
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
          <InlineField label="Employment Type" field="employmentType" value={emp.employmentType} type="select"
            options={Object.entries(empTypeMap).map(([key, cfg]) => ({ value: key, label: cfg.label }))}
            editable={fp('employmentType').editable} onSave={handleFieldSave}
            displayValue={empTypeMap[emp.employmentType]?.label || emp.employmentType} />
          {/* Probation */}
          {emp.probation?.enabled && emp.employmentType === 'confirmed' && (
            <div className="flex items-center justify-between py-2 border-b border-dark-800">
              <span className="text-dark-400 text-sm">Probation</span>
              <div className="flex items-center gap-2">
                {emp.probation.status === 'on_probation' ? (
                  <>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400">
                      On Probation
                    </span>
                    <span className="text-xs text-dark-400">
                      {Math.max(0, Math.ceil((new Date(emp.probation.endDate) - new Date()) / (1000*60*60*24)))} days left
                    </span>
                    <span className="text-[10px] text-dark-500">
                      ({emp.probation.durationDays} days, ends {formatDateUTC(emp.probation.endDate, { day: '2-digit' })})
                    </span>
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400">
                    Completed
                  </span>
                )}
              </div>
            </div>
          )}
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
          <InlineField label="Joining Date" field="joiningDate" value={emp.joiningDate} type="date"
            editable={fp('joiningDate').editable} required={fp('joiningDate').required} onSave={handleFieldSave} />
          <InfoRow label="Salary Disbursement" value={(() => {
            const ruleLabels = {
              'last-working-day': 'Last working day of salary month',
              'next-month-15': 'On/before 15th of next month',
              '30-day-cycle': '30-day cycle from joining date',
              'fixed-date': 'Fixed day of next month',
            };
            const defaultRules = {
              confirmed: { type: 'last-working-day' },
              internal_consultant: { type: 'last-working-day' },
              external_consultant: { type: 'next-month-15' },
              intern: { type: 'last-working-day' },
            };
            const empType = emp.employmentType || 'confirmed';
            const rules = disbursementRules || defaultRules;
            const rule = rules[empType]?.type || defaultRules[empType]?.type || 'last-working-day';
            return ruleLabels[rule] || rule;
          })()} />
        </SectionCard>

        {/* Personal Information */}
        <SectionCard title="Personal Information" icon={User}>
          <InlineField label="Private Email" field="privateEmail" value={emp.privateEmail} type="email"
            editable={fp('privateEmail').editable} onSave={handleFieldSave} />
          <InlineField label="Private Phone" field="privatePhone" value={emp.privatePhone || emp.alternatePhone} type="phone"
            editable={fp('privatePhone').editable} onSave={handleFieldSave} />
          <InlineField label="Date of Birth" field="dateOfBirth" value={emp.dateOfBirth} type="date"
            editable={fp('dateOfBirth').editable} required={fp('dateOfBirth').required} onSave={handleFieldSave} />
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
              {isAdmin && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Reactivate ${emp.fullName}? This will set status to Active and clear the Last Working Date.`)) return;
                    try {
                      const res = await employeeApi.update(currentOrg.slug, emp._id, {
                        status: 'active',
                        lastWorkingDate: null,
                        separationReason: null,
                        separationNotes: null,
                      });
                      if (res.success) {
                        setEmployee(prev => prev ? { ...prev, status: 'active', lastWorkingDate: null, separationReason: null, separationNotes: null } : prev);
                        showToast('Employee reactivated', 'success');
                      }
                    } catch (err) {
                      showToast(err.message || 'Failed to reactivate', 'error');
                    }
                  }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors"
                >
                  <UserPlus size={13} /> Reactivate
                </button>
              )}
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
      {(() => {
        const DOCUMENT_CATEGORIES = [
          { key: 'id_document', label: 'ID Documents', subcategories: ['Aadhaar Card', 'PAN Card', 'Passport', 'Voter ID', 'Driving License'] },
          { key: 'bank_proof', label: 'Bank Proof', subcategories: ['Cancelled Cheque', 'Digital Passbook', 'Bank Statement'] },
          { key: 'education_certificate', label: 'Education Certificates', subcategories: ['10th Marksheet', '12th Marksheet', 'Degree Certificate', 'Diploma', 'Post Graduation'] },
          { key: 'employment', label: 'Employment Documents', subcategories: ['Offer Letter', 'Appointment Letter', 'Relieving Letter', 'Experience Certificate', 'Salary Slip'] },
          { key: 'other', label: 'Other', subcategories: [] },
        ];

        const handleDocUpload = async (category, subcategory) => {
          setDocUploadOpen(null); // close dropdown
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { showToast('File size must be under 5MB', 'error'); return; }
            setDocUploading(category);
            try {
              const uploadRes = await employeeApi.uploadEmployeeDoc(currentOrg.slug, employeeId, file, category, subcategory);
              // Optimistically add the new doc to state from upload response
              if (uploadRes?.document) {
                setEmployeeDocs(prev => [uploadRes.document, ...prev]);
              }
              showToast('Document uploaded');
            } catch (err) { console.error('Doc upload error:', err); showToast('Upload failed', 'error'); }
            finally { setDocUploading(null); }
          };
          input.click();
        };

        const handleDocDelete = async (docId, filename) => {
          if (!confirm(`Delete "${filename}"?`)) return;
          try {
            await employeeApi.deleteEmployeeDoc(currentOrg.slug, employeeId, docId);
            setEmployeeDocs(prev => prev.filter(d => d._id !== docId));
            showToast('Document deleted');
          } catch (err) { showToast('Delete failed', 'error'); }
        };

        const handleDocDownload = async (docId, filename) => {
          try {
            const url = employeeApi.getEmployeeDocUrl(currentOrg.slug, employeeId, docId);
            const token = localStorage.getItem('rivvra_token');
            const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          } catch (_) { showToast('Download failed', 'error'); }
        };

        return (
          <div className="mt-5">
            <SectionCard title={`Documents (${employeeDocs.length})`} icon={FileText}>
              {docsLoading ? (
                <div className="flex items-center gap-2 text-dark-500 text-sm py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading...
                </div>
              ) : (
                <div className="space-y-5">
                  {DOCUMENT_CATEGORIES.map(({ key, label, subcategories }) => {
                    const catDocs = employeeDocs.filter(d => d.category === key);
                    const isUploading = docUploading === key;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium">{label}</p>
                          {/* Upload button with click-based dropdown */}
                          <div className="relative">
                            {isUploading ? (
                              <span className="flex items-center gap-1 text-[10px] text-rivvra-400">
                                <Loader2 size={10} className="animate-spin" /> Uploading...
                              </span>
                            ) : (
                              <button
                                onClick={() => setDocUploadOpen(docUploadOpen === key ? null : key)}
                                className="flex items-center gap-1 text-[10px] text-rivvra-400 hover:text-rivvra-300 transition-colors"
                              >
                                <Upload size={10} /> Upload
                              </button>
                            )}
                            {docUploadOpen === key && (
                              <>
                                {/* Backdrop to close dropdown */}
                                <div className="fixed inset-0 z-10" onClick={() => setDocUploadOpen(null)} />
                                <div className="absolute right-0 top-full mt-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1 z-20 min-w-[200px]">
                                  {subcategories.length > 0 && subcategories.map(sub => (
                                    <button key={sub} onClick={() => handleDocUpload(key, sub)}
                                      className="block w-full text-left px-3 py-2 text-xs text-dark-300 hover:bg-dark-700 hover:text-white transition-colors">
                                      {sub}
                                    </button>
                                  ))}
                                  <button onClick={() => {
                                    setDocUploadOpen(null);
                                    const custom = prompt('Enter document label:');
                                    if (custom?.trim()) handleDocUpload(key, custom.trim());
                                  }}
                                    className={`block w-full text-left px-3 py-2 text-xs text-dark-400 hover:bg-dark-700 hover:text-white transition-colors ${subcategories.length > 0 ? 'border-t border-dark-700' : ''}`}>
                                    + Custom...
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {catDocs.length > 0 ? (
                          <div className="space-y-1.5">
                            {catDocs.map(doc => (
                              <div key={doc._id} className="flex items-center gap-3 bg-dark-900/50 rounded-lg px-4 py-2.5 group/doc">
                                <FileText size={14} className="text-dark-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <button type="button" onClick={() => handleDocDownload(doc._id, doc.filename)}
                                    className="text-sm text-blue-400 hover:underline truncate block text-left w-full">
                                    {doc.filename}
                                  </button>
                                  {doc.subcategory && <span className="text-[10px] text-dark-500">{doc.subcategory}</span>}
                                </div>
                                <span className="text-xs text-dark-500 flex-shrink-0">
                                  {doc.size < 1024 * 1024 ? `${(doc.size / 1024).toFixed(0)}KB` : `${(doc.size / (1024 * 1024)).toFixed(1)}MB`}
                                </span>
                                <span className="text-xs text-dark-600 flex-shrink-0">
                                  {formatDateUTC(doc.uploadedAt)}
                                </span>
                                <button onClick={() => handleDocDownload(doc._id, doc.filename)}
                                  className="text-dark-600 hover:text-blue-400 opacity-0 group-hover/doc:opacity-100 transition-opacity flex-shrink-0" title="Download">
                                  <Download size={13} />
                                </button>
                                <button onClick={() => handleDocDelete(doc._id, doc.filename)}
                                  className="text-dark-600 hover:text-red-400 opacity-0 group-hover/doc:opacity-100 transition-opacity flex-shrink-0" title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-dark-600 italic">No documents uploaded</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        );
      })()}

      {/* ── Activities & Log Notes ─────────────────────────────────────── */}
      <div className="mt-5">
        <ActivityPanel orgSlug={currentOrg?.slug} entityType="employee" entityId={employeeId} />
      </div>

      {/* ── Project Assignments (full-width) ────────────────────────────── */}
      {(Array.isArray(emp.assignments) && emp.assignments.length > 0 || isAdmin) && (
        <div className="card p-5 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-orange-400" />
            <h3 className="text-white font-semibold">Project Assignments</h3>
            <span className="ml-auto text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full font-medium">
              {(emp.assignments || []).filter(a => a.status === 'active').length} active
            </span>
            {isAdmin && (
              <button onClick={handleAddAssignment} className="ml-2 flex items-center gap-1 px-2.5 py-1 bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600 hover:text-white transition-colors text-xs">
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {Array.isArray(emp.assignments) && emp.assignments.length > 0 && (
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
                  {isAdmin && <th className="w-10"></th>}
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
                  return (<>
                    <tr key={i} className="hover:bg-dark-800/30 transition-colors group">
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
                      {isAdmin && (
                        <td className="px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setExpandedDocs(p => ({ ...p, [i]: !p[i] }))}
                              className={`p-1 transition-colors ${expandedDocs[i] ? 'text-blue-400' : 'text-dark-500 hover:text-blue-400'}`}
                              title="Documents"
                            >
                              <Paperclip size={14} />
                            </button>
                            {a.status === 'active' && (
                              <button
                                onClick={() => openReviseModal(i)}
                                className="p-1 text-amber-500/60 hover:text-amber-400 transition-colors"
                                title="Revise Rate"
                              >
                                <TrendingUp size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => openEditAssignment(i)}
                              className="p-1 text-dark-400 hover:text-white transition-colors"
                              title="Edit assignment"
                            >
                              <PenLine size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteAssignment(i)}
                              disabled={deletingAssignment === i}
                              className="p-1 text-dark-500 hover:text-red-400 transition-colors"
                              title="Delete assignment"
                            >
                              {deletingAssignment === i ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Rate History */}
                    {a.rateHistory?.length > 0 && (
                      <tr key={`hist-${i}`}>
                        <td colSpan={isAdmin ? 8 : 7} className="px-3 py-0 bg-dark-900/30">
                          <button
                            type="button"
                            onClick={() => setExpandedHistory(p => ({ ...p, [i]: !p[i] }))}
                            className="flex items-center gap-2 text-xs text-dark-400 hover:text-dark-200 transition-colors py-1.5 w-full"
                          >
                            <Clock size={11} />
                            <span className="font-medium">Rate History ({a.rateHistory.length})</span>
                            {expandedHistory[i] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                          {expandedHistory[i] && (
                            <div className="pb-3 space-y-1.5 pl-4 border-l-2 border-dark-700/50 ml-1">
                              {[...a.rateHistory].reverse().map((entry, hIdx) => {
                                const effDate = formatDateUTC(entry.effectiveDate) || '—';
                                const endDate = formatDateUTC(entry.endDate) || 'Current';
                                const fmtR = (r) => { if (!r) return '—'; if (r.monthly) return `₹${Number(r.monthly).toLocaleString()}/mo`; if (r.hourly) return `$${r.hourly}/hr`; if (r.daily) return `₹${Number(r.daily).toLocaleString()}/day`; return '—'; };
                                return (
                                  <div key={hIdx} className="flex items-start gap-3 text-xs">
                                    <span className="text-dark-500 whitespace-nowrap">{effDate} → {endDate}</span>
                                    <span className="text-dark-300">Candidate: <span className="text-white">{fmtR(entry.billingRate)}</span></span>
                                    <span className="text-dark-300">Client: <span className="text-white">{fmtR(entry.clientBillingRate)}</span></span>
                                    {entry.reason && <span className="text-dark-500 italic">"{entry.reason}"</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {/* Assignment Documents */}
                    {isAdmin && expandedDocs[i] && (
                      <tr key={`docs-${i}`}>
                        <td colSpan={8} className="px-4 py-3 bg-dark-900/20">
                          <AssignmentDocs orgSlug={currentOrg?.slug} employeeId={employee._id} assignmentIdx={i} />
                        </td>
                      </tr>
                    )}
                  </>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
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
                  {emp?.employmentType === 'intern' ? 'No deductions (LOP only)' : 'Deduction: Flat TDS only (no PF / ESI / PT)'}
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

      {/* ── Edit Assignment Modal ──────────────────────────────────────── */}
      {editAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg">Edit Assignment</h3>
              <button onClick={() => setEditAssignment(null)} className="text-dark-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              {/* Client */}
              <div>
                <label className="block text-sm text-dark-400 mb-1">Client</label>
                <ComboSelect
                  value={editAssignment.clientId}
                  displayValue={editAssignment.clientName}
                  options={tsClients}
                  onChange={(id, name) => setEditAssignment(prev => ({ ...prev, clientId: id, clientName: name }))}
                  placeholder="Select or create client"
                />
              </div>

              {/* Project */}
              <div>
                <label className="block text-sm text-dark-400 mb-1">Project</label>
                <ComboSelect
                  value={editAssignment.projectId}
                  displayValue={editAssignment.projectName}
                  options={tsProjects}
                  onChange={(id, name) => setEditAssignment(prev => ({ ...prev, projectId: id, projectName: name }))}
                  placeholder="Select or create project"
                />
              </div>

              {/* Candidate Billing Rate */}
              <div>
                <label className="block text-sm text-dark-400 mb-1.5">Candidate Billing Rate</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Daily (₹)</span>
                    <input type="number" value={editAssignment.billingRate.daily}
                      onChange={e => setEditAssignment(prev => ({ ...prev, billingRate: { daily: e.target.value, hourly: '', monthly: '' } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Hourly ($)</span>
                    <input type="number" value={editAssignment.billingRate.hourly}
                      onChange={e => setEditAssignment(prev => ({ ...prev, billingRate: { daily: '', hourly: e.target.value, monthly: '' } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Monthly (₹)</span>
                    <input type="number" value={editAssignment.billingRate.monthly}
                      onChange={e => setEditAssignment(prev => ({ ...prev, billingRate: { daily: '', hourly: '', monthly: e.target.value } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                </div>
              </div>

              {/* Client Billing Rate */}
              <div>
                <label className="block text-sm text-dark-400 mb-1.5">Client Billing Rate</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Daily (₹)</span>
                    <input type="number" value={editAssignment.clientBillingRate.daily}
                      onChange={e => setEditAssignment(prev => ({ ...prev, clientBillingRate: { daily: e.target.value, hourly: '', monthly: '' } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Hourly ($)</span>
                    <input type="number" value={editAssignment.clientBillingRate.hourly}
                      onChange={e => setEditAssignment(prev => ({ ...prev, clientBillingRate: { daily: '', hourly: e.target.value, monthly: '' } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                  <div>
                    <span className="text-xs text-dark-500 mb-0.5 block">Monthly (₹)</span>
                    <input type="number" value={editAssignment.clientBillingRate.monthly}
                      onChange={e => setEditAssignment(prev => ({ ...prev, clientBillingRate: { daily: '', hourly: '', monthly: e.target.value } }))}
                      className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                      placeholder="0" />
                  </div>
                </div>
              </div>

              {/* Dates + Status row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Start Date</label>
                  <input type="date" value={editAssignment.startDate}
                    onChange={e => setEditAssignment(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-1">End Date</label>
                  <input type="date" value={editAssignment.endDate}
                    onChange={e => setEditAssignment(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Status</label>
                  <select value={editAssignment.status}
                    onChange={e => setEditAssignment(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none">
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
              </div>

              {/* Paid Leave */}
              <div>
                <label className="block text-sm text-dark-400 mb-1">Paid Leave / Month</label>
                <input type="number" min="0" max="3" step="0.5" value={editAssignment.paidLeavePerMonth}
                  onChange={e => setEditAssignment(prev => ({ ...prev, paidLeavePerMonth: Number(e.target.value) }))}
                  className="w-32 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-rivvra-500 focus:outline-none"
                  placeholder="0" />
              </div>
            </div>

            {/* Documents section in modal — only for saved assignments */}
            {editAssignment?.index != null && editAssignment.index < (employee?.assignments?.length || 0) && employee?.assignments?.[editAssignment.index]?.clientId && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <AssignmentDocs orgSlug={currentOrg?.slug} employeeId={employee._id} assignmentIdx={editAssignment.index} />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditAssignment(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSaveAssignment}
                disabled={assignmentSaving}
                className="px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {assignmentSaving && <Loader2 size={14} className="animate-spin" />}
                Save Assignment
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

      {/* ── Revise Rate Modal ────────────────────────────────────────── */}
      {reviseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <TrendingUp size={20} className="text-amber-400" />
                </div>
                <h3 className="text-white font-semibold text-lg">Revise Rate</h3>
              </div>
              <button type="button" onClick={() => setReviseModal(null)} className="text-dark-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            {/* Current rates */}
            <div className="bg-dark-900/50 rounded-lg p-3 mb-4">
              <p className="text-xs text-dark-500 uppercase tracking-wider font-medium mb-1">Current Rates</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-dark-400">Candidate:</span> <span className="text-white">
                  {(() => { const r = reviseModal.currentRates?.billingRate || {}; if (r.monthly) return `₹${Number(r.monthly).toLocaleString()}/mo`; if (r.hourly) return `$${r.hourly}/hr`; if (r.daily) return `₹${Number(r.daily).toLocaleString()}/day`; return '—'; })()}
                </span></div>
                <div><span className="text-dark-400">Client:</span> <span className="text-white">
                  {(() => { const r = reviseModal.currentRates?.clientBillingRate || {}; if (r.hourly) return `$${r.hourly}/hr`; if (r.monthly) return `₹${Number(r.monthly).toLocaleString()}/mo`; if (r.daily) return `₹${Number(r.daily).toLocaleString()}/day`; return '—'; })()}
                </span></div>
              </div>
            </div>

            {/* Effective Date */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1">Effective Date <span className="text-red-400">*</span></label>
              <input type="date" value={reviseForm.effectiveDate} onChange={e => setReviseForm(p => ({ ...p, effectiveDate: e.target.value }))} className="input-field w-full text-sm" />
            </div>

            {/* New Candidate Rate */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-2">New Candidate Rate</label>
              <div className="grid grid-cols-3 gap-2">
                {[['daily', '₹'], ['hourly', '$'], ['monthly', '₹']].map(([key, symbol]) => (
                  <div key={key}>
                    <span className="text-xs text-dark-500 capitalize">{key}</span>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                      <input type="number" value={reviseForm.billingRate[key]} onChange={e => setReviseForm(p => ({ ...p, billingRate: { ...p.billingRate, [key]: e.target.value } }))} className="input-field w-full pl-7 text-sm" placeholder="0" min="0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Client Billing Rate */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-2">New Client Billing Rate</label>
              <div className="grid grid-cols-3 gap-2">
                {[['daily', '₹'], ['hourly', '$'], ['monthly', '₹']].map(([key, symbol]) => (
                  <div key={key}>
                    <span className="text-xs text-dark-500 capitalize">{key}</span>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                      <input type="number" value={reviseForm.clientBillingRate[key]} onChange={e => setReviseForm(p => ({ ...p, clientBillingRate: { ...p.clientBillingRate, [key]: e.target.value } }))} className="input-field w-full pl-7 text-sm" placeholder="0" min="0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Paid Leave */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1">Paid Leave / Month</label>
              <select value={reviseForm.paidLeavePerMonth} onChange={e => setReviseForm(p => ({ ...p, paidLeavePerMonth: e.target.value }))} className="input-field w-full text-sm">
                {[0, 1, 1.5, 2, 3].map(v => <option key={v} value={v}>{v} day{v !== 1 ? 's' : ''}</option>)}
              </select>
            </div>

            {/* Reason */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-300 mb-1">Reason</label>
              <input type="text" value={reviseForm.reason} onChange={e => setReviseForm(p => ({ ...p, reason: e.target.value }))} className="input-field w-full text-sm" placeholder="e.g. Annual rate revision" />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setReviseModal(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
              <button type="button" onClick={handleReviseRate} disabled={revisingRate || !reviseForm.effectiveDate} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                {revisingRate && <Loader2 size={14} className="animate-spin" />}
                Apply Revision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
