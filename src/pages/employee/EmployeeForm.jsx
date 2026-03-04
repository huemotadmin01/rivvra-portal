import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { Save, Loader2, AlertTriangle, Plus, Trash2, Briefcase, Upload, FileText, X, Link2, Unlink, Search } from 'lucide-react';
import ComboSelect from '../../components/ComboSelect';

// ── Per-assignment document manager ─────────────────────────────────────────
function AssignmentDocs({ orgSlug, employeeId, assignmentIdx }) {
  const { showToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const fileRef = useRef(null);

  const fetchDocs = () => {
    if (!orgSlug || !employeeId) return;
    employeeApi.listAssignmentDocs(orgSlug, employeeId, assignmentIdx)
      .then(res => { if (res.success) setDocs(res.documents || []); })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => { fetchDocs(); }, [orgSlug, employeeId, assignmentIdx]);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'image/jpg'];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side validation
    if (file.size > MAX_FILE_SIZE) {
      showToast('File too large. Maximum size is 5MB.', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('File type not allowed. Allowed: PDF, DOCX, XLSX, PNG, JPEG.', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      await employeeApi.uploadAssignmentDoc(orgSlug, employeeId, assignmentIdx, file);
      fetchDocs();
    } catch (err) {
      console.error('Upload failed:', err);
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (docId) => {
    try {
      await employeeApi.deleteAssignmentDoc(orgSlug, employeeId, docId);
      setDocs(prev => prev.filter(d => d._id !== docId));
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleDownload = async (doc) => {
    try {
      const url = employeeApi.getAssignmentDocUrl(orgSlug, employeeId, doc._id);
      const token = localStorage.getItem('rivvra_token');
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div>
      <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">Documents</p>
      {loadingDocs ? (
        <div className="flex items-center gap-2 text-dark-500 text-xs py-1">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      ) : (
        <>
          {docs.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {docs.map(doc => (
                <div key={doc._id} className="flex items-center gap-2 bg-dark-900/50 rounded-lg px-3 py-1.5 group">
                  <FileText size={14} className="text-dark-400 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="text-xs text-blue-400 hover:underline truncate flex-1 text-left"
                  >
                    {doc.filename}
                  </button>
                  <span className="text-[10px] text-dark-500">{formatSize(doc.size)}</span>
                  <button type="button" onClick={() => handleDelete(doc._id)} className="p-0.5 text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" onChange={handleUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-dark-400 hover:text-white transition-colors"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Uploading...' : '+ Upload Document'}
          </button>
        </>
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
  manager: '',
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

  const { showToast } = useToast();
  const isEdit = !!employeeId;
  const orgSlug = currentOrg?.slug;

  const [form, setForm] = useState(INITIAL_FORM);
  usePageTitle(isEdit ? (form?.fullName || 'Edit Employee') : 'Add Employee');
  const [departments, setDepartments] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);
  const [tsClients, setTsClients] = useState([]);
  const [tsProjects, setTsProjects] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(null);
  const [savedAssignmentCount, setSavedAssignmentCount] = useState(0);
  const [error, setError] = useState('');
  const [showSensitive, setShowSensitive] = useState(false);
  const [originalStatus, setOriginalStatus] = useState('active'); // track loaded status for separation detection
  const [showSeparationConfirm, setShowSeparationConfirm] = useState(false);

  // ── Related User (Employee ↔ Portal User linking) ──
  const [orgMembers, setOrgMembers] = useState([]);
  const [linkedUser, setLinkedUser] = useState(null); // { _id, name, email, picture }
  const [linkingUser, setLinkingUser] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Fetch departments + timesheet options (clients/projects for assignment dropdowns)
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    employeeApi.listDepartments(orgSlug)
      .then((res) => { if (!cancelled && res.success) setDepartments(res.departments || []); })
      .catch(() => {});
    employeeApi.getTimesheetOptions(orgSlug)
      .then((res) => {
        if (!cancelled && res.success) {
          setTsClients(res.clients || []);
          setTsProjects(res.projects || []);
        }
      })
      .catch(() => {});
    employeeApi.getManagerOptions(orgSlug)
      .then((res) => { if (!cancelled && res.success) setManagerOptions(res.managers || []); })
      .catch(() => {});
    // Fetch org members for Related User dropdown (edit mode)
    if (isEdit) {
      api.getOrgMembers(orgSlug)
        .then((res) => {
          if (!cancelled && res.success) setOrgMembers(res.members || []);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [orgSlug, isEdit]);

  // Fetch employee data in edit mode
  useEffect(() => {
    if (!isEdit || !orgSlug) return;
    let cancelled = false;
    setLoading(true);
    employeeApi.get(orgSlug, employeeId)
      .then((res) => {
        if (cancelled) return;
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
            manager: emp.manager || '',
            assignments: (emp.assignments || []).map(a => {
              // Handle backward compat: old single-number clientBillingRate
              const cbr = typeof a.clientBillingRate === 'number'
                ? { daily: a.clientBillingRate || '', hourly: '', monthly: '' }
                : a.clientBillingRate || {};
              return {
                clientId: a.clientId || '',
                clientName: a.clientName || '',
                projectId: a.projectId || '',
                projectName: a.projectName || '',
                billingRate: {
                  daily: a.billingRate?.daily ?? '',
                  hourly: a.billingRate?.hourly ?? '',
                  monthly: a.billingRate?.monthly ?? '',
                },
                clientBillingRate: {
                  daily: cbr.daily ?? '',
                  hourly: cbr.hourly ?? '',
                  monthly: cbr.monthly ?? '',
                },
                paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
                startDate: a.startDate ? a.startDate.slice(0, 10) : '',
                endDate: a.endDate ? a.endDate.slice(0, 10) : '',
                status: a.status || 'active',
              };
            }),
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
          setSavedAssignmentCount((emp.assignments || []).length);
          setOriginalStatus(emp.status || 'active');
          // Capture linked user info from enriched response
          if (emp.linkedUserId) {
            setLinkedUser({
              _id: emp.linkedUserId,
              name: emp.linkedUserName || '',
              email: emp.linkedUserEmail || '',
              picture: emp.linkedUserPicture || '',
            });
          } else {
            setLinkedUser(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load employee:', err);
          setError('Failed to load employee data.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
        {
          clientId: '', clientName: '', projectId: '', projectName: '',
          billingRate: { daily: '', hourly: '', monthly: '' },
          clientBillingRate: { daily: '', hourly: '', monthly: '' },
          paidLeavePerMonth: 0,
          startDate: new Date().toISOString().slice(0, 10), endDate: '', status: 'active',
        },
      ],
    }));
  };

  const removeAssignment = async (idx) => {
    if (!window.confirm(`Remove Assignment ${idx + 1}? This will save immediately.`)) return;
    const previousAssignments = [...form.assignments];
    const newAssignments = form.assignments.filter((_, i) => i !== idx);
    setForm(prev => ({ ...prev, assignments: newAssignments }));
    // Persist to backend immediately (in edit mode)
    if (isEdit) {
      try {
        const result = await employeeApi.update(orgSlug, employeeId, { ...form, assignments: newAssignments });
        if (result.success) {
          setSavedAssignmentCount(newAssignments.length);
          showToast('Assignment removed', 'success');
        } else {
          // Rollback on failure
          setForm(prev => ({ ...prev, assignments: previousAssignments }));
          showToast(result.message || 'Failed to remove assignment', 'error');
        }
      } catch (err) {
        // Rollback on error
        setForm(prev => ({ ...prev, assignments: previousAssignments }));
        showToast(err.message || 'Failed to remove assignment', 'error');
      }
    }
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

  // Update a nested field inside an assignment (e.g. billingRate.daily)
  // For rate groups (billingRate, clientBillingRate): only one field at a time
  const updateAssignmentNested = (idx, group, field, value) => {
    const isRateGroup = group === 'billingRate' || group === 'clientBillingRate';
    setForm(prev => ({
      ...prev,
      assignments: prev.assignments.map((a, i) => {
        if (i !== idx) return a;
        if (isRateGroup) {
          // Clear other rate fields when one is set
          return { ...a, [group]: { daily: '', hourly: '', monthly: '', [field]: value } };
        }
        return { ...a, [group]: { ...a[group], [field]: value } };
      }),
    }));
  };

  // ── Link / Unlink portal user ────────────────────────────────────────
  const handleLinkUser = async (userId) => {
    if (!userId || linkingUser) return;
    setLinkingUser(true);
    try {
      const res = await employeeApi.linkUser(orgSlug, employeeId, userId);
      if (res.success && res.employee) {
        setLinkedUser({
          _id: userId,
          name: res.employee.linkedUserName || '',
          email: res.employee.linkedUserEmail || '',
          picture: res.employee.linkedUserPicture || '',
        });
        showToast('User linked successfully', 'success');
      } else {
        showToast(res.error || 'Failed to link user', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to link user', 'error');
    } finally {
      setLinkingUser(false);
    }
  };

  const handleUnlinkUser = async () => {
    if (!linkedUser || linkingUser) return;
    if (!window.confirm(`Unlink ${linkedUser.name || linkedUser.email} from this employee?`)) return;
    setLinkingUser(true);
    try {
      const res = await employeeApi.unlinkUser(orgSlug, employeeId);
      if (res.success) {
        setLinkedUser(null);
        showToast('User unlinked', 'success');
      } else {
        showToast(res.error || 'Failed to unlink user', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to unlink user', 'error');
    } finally {
      setLinkingUser(false);
    }
  };

  // Detect if this save is a separation (status changing to resigned/terminated)
  const isSeparating = isEdit &&
    (form.status === 'resigned' || form.status === 'terminated') &&
    originalStatus !== 'resigned' && originalStatus !== 'terminated';

  // Validate form (shared between normal submit and separation confirm)
  const validateForm = () => {
    if (!form.fullName.trim()) {
      setError('Full Name is required.');
      return false;
    }
    if (!form.email.trim()) {
      setError('Email is required.');
      return false;
    }
    if ((form.status === 'resigned' || form.status === 'terminated') && !form.lastWorkingDate) {
      setError('Last Working Date is required when status is Resigned or Terminated.');
      return false;
    }

    // Non-billable: salary is required
    if (!form.billable && !form.monthlyGrossSalary) {
      setError('Monthly Gross Salary is required for non-billable employees.');
      return false;
    }

    // Billable: at least one assignment is required (skip if separating — assignments will be auto-ended)
    if (form.billable && form.assignments.length === 0 && !isSeparating) {
      setError('At least one project assignment is required for billable employees.');
      return false;
    }

    // Validate all assignments: client, project, start date, end date, rates required
    for (let i = 0; i < form.assignments.length; i++) {
      const a = form.assignments[i];
      const missing = [];
      if (!a.clientId && !a.clientName?.trim()) missing.push('Client');
      if (!a.projectId && !a.projectName?.trim()) missing.push('Project');
      if (!a.startDate) missing.push('Start Date');
      if (!a.endDate) missing.push('End Date');
      if (missing.length > 0) {
        setError(`Assignment ${i + 1}: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`);
        return false;
      }
      // At least one candidate rate required
      const br = a.billingRate || {};
      if (!br.daily && !br.hourly && !br.monthly) {
        setError(`Assignment ${i + 1}: At least one Candidate Rate (₹/day, $/hour, or ₹/month) is required.`);
        return false;
      }
      // At least one client billing rate required
      const cbr = a.clientBillingRate || {};
      if (!cbr.daily && !cbr.hourly && !cbr.monthly) {
        setError(`Assignment ${i + 1}: At least one Client Billing Rate (₹/day, $/hour, or ₹/month) is required.`);
        return false;
      }
    }
    return true;
  };

  // Actually perform the save
  const performSave = async () => {
    setSaving(true);
    try {
      const result = isEdit
        ? await employeeApi.update(orgSlug, employeeId, form)
        : await employeeApi.create(orgSlug, form);

      if (result.success && result.employee?._id) {
        if (result.separated) {
          showToast('Employee separated — assignments ended, user unlinked', 'success');
          // Update local state to reflect backend changes
          setLinkedUser(null);
          setOriginalStatus(form.status);
          const emp = result.employee;
          setForm(prev => ({
            ...prev,
            assignments: (emp.assignments || []).map(a => {
              const cbr = typeof a.clientBillingRate === 'number'
                ? { daily: a.clientBillingRate || '', hourly: '', monthly: '' }
                : a.clientBillingRate || {};
              return {
                clientId: a.clientId || '',
                clientName: a.clientName || '',
                projectId: a.projectId || '',
                projectName: a.projectName || '',
                billingRate: {
                  daily: a.billingRate?.daily ?? '',
                  hourly: a.billingRate?.hourly ?? '',
                  monthly: a.billingRate?.monthly ?? '',
                },
                clientBillingRate: {
                  daily: cbr.daily ?? '',
                  hourly: cbr.hourly ?? '',
                  monthly: cbr.monthly ?? '',
                },
                paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
                startDate: a.startDate ? a.startDate.slice(0, 10) : '',
                endDate: a.endDate ? a.endDate.slice(0, 10) : '',
                status: a.status || 'active',
              };
            }),
          }));
          setSavedAssignmentCount((emp.assignments || []).length);
        } else {
          showToast(isEdit ? 'Employee updated' : 'Employee created', 'success');
        }
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

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    // If this is a separation, show confirmation dialog first
    if (isSeparating) {
      setShowSeparationConfirm(true);
      return;
    }

    await performSave();
  };

  // Separation confirmed — proceed with save
  const handleSeparationConfirmed = async () => {
    setShowSeparationConfirm(false);
    await performSave();
  };

  const saveAssignment = async (idx) => {
    // Validate the assignment before saving
    const assignment = form.assignments[idx];
    if (!assignment) return;
    if (!assignment.clientName?.trim() && !assignment.clientId) {
      setError(`Assignment ${idx + 1}: Client is required.`);
      return;
    }
    if (!assignment.projectName?.trim() && !assignment.projectId) {
      setError(`Assignment ${idx + 1}: Project is required.`);
      return;
    }
    if (!assignment.startDate) {
      setError(`Assignment ${idx + 1}: Start Date is required.`);
      return;
    }
    if (!assignment.endDate) {
      setError(`Assignment ${idx + 1}: End Date is required.`);
      return;
    }

    setError('');
    setSavingAssignment(idx);
    try {
      const result = await employeeApi.update(orgSlug, employeeId, form);
      if (result.success && result.employee) {
        // Refresh form state with backend response (assignments now have proper IDs)
        const emp = result.employee;
        setForm(prev => ({
          ...prev,
          assignments: (emp.assignments || []).map(a => {
            const cbr = typeof a.clientBillingRate === 'number'
              ? { daily: a.clientBillingRate || '', hourly: '', monthly: '' }
              : a.clientBillingRate || {};
            return {
              clientId: a.clientId || '',
              clientName: a.clientName || '',
              projectId: a.projectId || '',
              projectName: a.projectName || '',
              billingRate: {
                daily: a.billingRate?.daily ?? '',
                hourly: a.billingRate?.hourly ?? '',
                monthly: a.billingRate?.monthly ?? '',
              },
              clientBillingRate: {
                daily: cbr.daily ?? '',
                hourly: cbr.hourly ?? '',
                monthly: cbr.monthly ?? '',
              },
              paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
              startDate: a.startDate ? a.startDate.slice(0, 10) : '',
              endDate: a.endDate ? a.endDate.slice(0, 10) : '',
              status: a.status || 'active',
            };
          }),
        }));
        setSavedAssignmentCount((emp.assignments || []).length);
        // Also refresh project/client options so newly created ones appear in dropdown
        employeeApi.getTimesheetOptions(orgSlug).then(r => {
          if (r.success) { setTsClients(r.clients || []); setTsProjects(r.projects || []); }
        }).catch(() => {});
        showToast('Assignment saved successfully', 'success');
      } else {
        setError(result.message || 'Failed to save assignment.');
      }
    } catch (err) {
      console.error('Save assignment failed:', err);
      setError(err.message || 'Failed to save assignment.');
    } finally {
      setSavingAssignment(null);
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
                  className={`input-field w-full ${isSeparating ? 'border-red-500/50 text-red-400' : ''}`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            )}
          </div>

          {/* Separation warning banner */}
          {isSeparating && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mt-3">
              <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-red-400 font-medium">Separation will be triggered on save</p>
                <p className="text-dark-400 mt-1">
                  All active assignments will be ended{linkedUser ? ', portal user will be unlinked,' : ''} and timesheet access will be blocked.
                </p>
              </div>
            </div>
          )}
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

            {/* Manager (only licensed portal users) */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Manager</label>
              <select
                value={form.manager}
                onChange={(e) => setField('manager', e.target.value)}
                className="input-field w-full"
              >
                <option value="">No Manager</option>
                {managerOptions
                  .filter(m => m._id !== employeeId) // Exclude self
                  .map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.fullName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Related User (edit mode only) */}
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Related User
                </label>
                {linkedUser ? (
                  <div className="flex items-center gap-3 bg-dark-800/60 rounded-lg px-3 py-2.5 border border-dark-700">
                    {linkedUser.picture ? (
                      <img src={linkedUser.picture} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-rivvra-500/20 flex items-center justify-center text-rivvra-400 text-xs font-bold">
                        {(linkedUser.name || linkedUser.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{linkedUser.name || 'Unnamed'}</p>
                      <p className="text-xs text-dark-400 truncate">{linkedUser.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnlinkUser}
                      disabled={linkingUser}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      {linkingUser ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
                      <input
                        type="text"
                        placeholder="Search portal users by name or email…"
                        value={userDropdownOpen ? userSearchQuery : ''}
                        onChange={(e) => { setUserSearchQuery(e.target.value); setUserDropdownOpen(true); }}
                        onFocus={() => { setUserDropdownOpen(true); setUserSearchQuery(''); }}
                        onBlur={() => setTimeout(() => setUserDropdownOpen(false), 200)}
                        disabled={linkingUser}
                        className="input-field w-full pl-9"
                      />
                      {linkingUser && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-dark-400" />}
                    </div>
                    {userDropdownOpen && (() => {
                      const q = userSearchQuery.toLowerCase();
                      const filtered = orgMembers
                        .filter(m => m.userId)
                        .filter(m => !q || (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q));
                      return (
                        <div className="absolute z-50 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-dark-500">No users found</p>
                          ) : filtered.map(m => (
                            <button key={m.userId} type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { handleLinkUser(m.userId); setUserDropdownOpen(false); setUserSearchQuery(''); }}
                              className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors"
                            >
                              <p className="text-sm text-white">{m.name || 'Unnamed'}</p>
                              <p className="text-xs text-dark-400">{m.email || ''}</p>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
                <p className="text-xs text-dark-500 mt-1">
                  {linkedUser ? 'This employee is linked to a portal user account.' : 'Link this employee to a portal user for timesheet access.'}
                </p>
              </div>
            )}

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

            {/* Monthly Gross Salary — editable only for non-billable */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">
                Monthly Gross Salary {!form.billable && <span className="text-red-400">*</span>}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  value={form.monthlyGrossSalary}
                  onChange={(e) => setField('monthlyGrossSalary', e.target.value)}
                  className={`input-field w-full pl-7 ${form.billable ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="0"
                  min="0"
                  disabled={form.billable}
                />
              </div>
              {form.billable && (
                <p className="text-xs text-dark-500 mt-1">Derived from assignment billing rates for billable employees.</p>
              )}
              {!form.billable && !form.monthlyGrossSalary && (
                <p className="text-xs text-amber-400/80 mt-1">Required for non-billable employees.</p>
              )}
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

        {/* ── Project Assignments ───────────────────────────────── */}
        <div className="card p-5 space-y-4 relative z-10">
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
            <div className={`text-center py-6 border border-dashed rounded-xl ${form.billable ? 'border-amber-500/30 bg-amber-500/5' : 'border-dark-700'}`}>
              <Briefcase size={24} className={`mx-auto mb-2 ${form.billable ? 'text-amber-500/50' : 'text-dark-600'}`} />
              <p className={`text-sm ${form.billable ? 'text-amber-400/80' : 'text-dark-500'}`}>
                No project assignments yet.{form.billable && ' At least one is required for billable employees.'}
              </p>
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
                  {isEdit && (
                    <button
                      type="button"
                      onClick={() => saveAssignment(idx)}
                      disabled={savingAssignment === idx}
                      className="flex items-center gap-1 px-2.5 py-1 bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-lg text-xs font-medium hover:bg-rivvra-500/20 transition-colors disabled:opacity-50"
                    >
                      {savingAssignment === idx ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {savingAssignment === idx ? 'Saving...' : 'Save'}
                    </button>
                  )}
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
                  <label className="block text-xs font-medium text-dark-400 mb-1">Client <span className="text-red-400">*</span></label>
                  <ComboSelect
                    value={assignment.clientId}
                    displayValue={assignment.clientName}
                    options={tsClients}
                    onChange={(id, name) => setAssignmentClient(idx, id, name)}
                    placeholder="Search or create client..."
                  />
                </div>
                {/* Project (ComboSelect — all projects, not filtered by client) */}
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Project <span className="text-red-400">*</span></label>
                  <ComboSelect
                    value={assignment.projectId}
                    displayValue={assignment.projectName}
                    options={tsProjects}
                    onChange={(id, name) => setAssignmentProject(idx, id, name)}
                    placeholder="Search or create project..."
                  />
                </div>
              </div>

              {/* Candidate Rate — fill only one */}
              <div>
                <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2 mt-1">
                  Candidate Rate <span className="text-red-400">*</span>
                  <span className="normal-case tracking-normal text-dark-600 ml-1">(fill any one)</span>
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'daily', label: '\u20B9/day', symbol: '\u20B9' },
                    { key: 'hourly', label: '$/hour', symbol: '$' },
                    { key: 'monthly', label: '\u20B9/month', symbol: '\u20B9' },
                  ].map(({ key, label, symbol }) => {
                    const otherFilled = Object.entries(assignment.billingRate || {}).some(([k, v]) => k !== key && v);
                    return (
                      <div key={key}>
                        <label className="block text-xs font-medium text-dark-400 mb-1">{label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                          <input type="number" value={assignment.billingRate?.[key] ?? ''} onChange={(e) => updateAssignmentNested(idx, 'billingRate', key, e.target.value)} className={`input-field w-full pl-7 text-sm ${otherFilled ? 'opacity-40' : ''}`} placeholder="0" min="0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Client Billing Rate — fill only one */}
              <div>
                <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">
                  Client Billing Rate <span className="text-red-400">*</span>
                  <span className="normal-case tracking-normal text-dark-600 ml-1">(fill any one)</span>
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'daily', label: '\u20B9/day', symbol: '\u20B9' },
                    { key: 'hourly', label: '$/hour', symbol: '$' },
                    { key: 'monthly', label: '\u20B9/month', symbol: '\u20B9' },
                  ].map(({ key, label, symbol }) => {
                    const otherFilled = Object.entries(assignment.clientBillingRate || {}).some(([k, v]) => k !== key && v);
                    return (
                      <div key={key}>
                        <label className="block text-xs font-medium text-dark-400 mb-1">{label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                          <input type="number" value={assignment.clientBillingRate?.[key] ?? ''} onChange={(e) => updateAssignmentNested(idx, 'clientBillingRate', key, e.target.value)} className={`input-field w-full pl-7 text-sm ${otherFilled ? 'opacity-40' : ''}`} placeholder="0" min="0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Paid Leave + Dates */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Paid Leave (days/month)</label>
                  <select
                    value={assignment.paidLeavePerMonth ?? 0}
                    onChange={(e) => updateAssignment(idx, 'paidLeavePerMonth', Number(e.target.value))}
                    className="input-field w-full text-sm"
                  >
                    {[0, 1, 2, 3].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}/month</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Start Date <span className="text-red-400">*</span></label>
                  <input type="date" value={assignment.startDate} onChange={(e) => updateAssignment(idx, 'startDate', e.target.value)} className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">End Date <span className="text-red-400">*</span></label>
                  <input type="date" value={assignment.endDate || ''} onChange={(e) => updateAssignment(idx, 'endDate', e.target.value)} className="input-field w-full text-sm" />
                </div>
              </div>

              {/* Documents — only for assignments already saved to DB */}
              {isEdit && idx < savedAssignmentCount ? (
                <AssignmentDocs orgSlug={orgSlug} employeeId={employeeId} assignmentIdx={idx} />
              ) : (
                <p className="text-xs text-dark-500 italic">
                  {isEdit ? 'Save this assignment first to upload documents.' : 'Save employee first to upload assignment documents.'}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Dates — only for confirmed/intern; consultants only see LWD when separating ── */}
        {(form.employmentType === 'confirmed' || form.employmentType === 'intern') ? (
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
        ) : (form.status === 'resigned' || form.status === 'terminated') ? (
          /* Consultants: only show LWD when being separated */
          <div className="card p-5 space-y-4">
            <h2 className="text-white font-semibold text-lg">Separation</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
            </div>
          </div>
        ) : null}

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold text-lg">Bank Details</h2>
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                <AlertTriangle size={12} />
                Sensitive Data
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSensitive(!showSensitive)}
              className="text-xs text-dark-400 hover:text-white transition-colors"
            >
              {showSensitive ? 'Hide' : 'Show'} values
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Account Number</label>
              <input
                type={showSensitive ? 'text' : 'password'}
                value={form.bankDetails.accountNumber}
                onChange={(e) => setNested('bankDetails', 'accountNumber', e.target.value)}
                className="input-field w-full"
                placeholder="1234567890"
                autoComplete="off"
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
                type={showSensitive ? 'text' : 'password'}
                value={form.bankDetails.pan}
                onChange={(e) => setNested('bankDetails', 'pan', e.target.value)}
                className="input-field w-full"
                placeholder="ABCDE1234F"
                autoComplete="off"
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

      {/* ── Separation Confirmation Dialog ──────────────────────────── */}
      {showSeparationConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Confirm Employee Separation</h3>
            </div>

            <p className="text-dark-300 text-sm mb-4">
              You are marking <strong className="text-white">{form.fullName}</strong> as <strong className="text-red-400 capitalize">{form.status}</strong>.
              This will:
            </p>

            <ul className="text-sm text-dark-300 space-y-2 mb-6">
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>End all active project assignments (end date set to LWD: <strong className="text-white">{form.lastWorkingDate}</strong>)</span>
              </li>
              {linkedUser && (
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span>
                  <span>Unlink portal user <strong className="text-white">{linkedUser.name || linkedUser.email}</strong> — they will lose timesheet access</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>Block future timesheet submissions for this employee</span>
              </li>
            </ul>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowSeparationConfirm(false)}
                className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSeparationConfirmed}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing...</>
                ) : (
                  <>Confirm Separation</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
