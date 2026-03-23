import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';
import { formatDateUTC, todayStr } from '../../utils/dateUtils';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import { Save, Loader2, AlertTriangle, Plus, Trash2, Briefcase, Upload, FileText, X, Link2, Unlink, Search, TrendingUp, ChevronDown, ChevronUp, Clock, GraduationCap, Users, Building2 } from 'lucide-react';
import ComboSelect from '../../components/ComboSelect';
import AssignmentDocs from '../../components/employee/AssignmentDocs';

const DEFAULT_SEPARATION_REASONS = [
  'Better opportunity', 'Personal reasons', 'Performance',
  'Redundancy/Layoff', 'Contract end', 'Absconding', 'Mutual agreement', 'Other',
];

const DEFAULT_EMPLOYMENT_TYPES = [
  { key: 'confirmed', label: 'Confirmed Employee' },
  { key: 'internal_consultant', label: 'Internal Consultant' },
  { key: 'external_consultant', label: 'External Consultant' },
  { key: 'intern', label: 'Intern' },
];

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  employeeId: '',
  employmentType: 'confirmed',
  status: 'active',
  separationReason: '',
  separationNotes: '',
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
  // ── New onboarding fields ──
  gender: '',
  bloodGroup: '',
  fatherName: '',
  spouseName: '',
  religion: '',
  alternatePhone: '',
  permanentAddress: {
    street: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'India',
  },
  familyMembers: [],
  statutory: {
    aadhaar: '',
    uan: '',
    pfNumber: '',
    esicNumber: '',
  },
  education: [],
  previousEmployment: [],
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

  // ── Dynamic config (fetched from platform settings) ──
  const [employmentTypes, setEmploymentTypes] = useState(DEFAULT_EMPLOYMENT_TYPES);
  const [separationReasons, setSeparationReasons] = useState(DEFAULT_SEPARATION_REASONS);

  useEffect(() => {
    getPublicPlatformSetting('employment_types')
      .then(res => { if (res?.items?.length) setEmploymentTypes(res.items); })
      .catch(() => {});
    getPublicPlatformSetting('separation_reasons')
      .then(res => { if (res?.items?.length) setSeparationReasons(res.items.map(r => r.label || r)); })
      .catch(() => {});
  }, []);

  // ── Rate Revision ──
  const [reviseModal, setReviseModal] = useState(null); // { assignmentIndex, currentRates }
  const [reviseForm, setReviseForm] = useState({ effectiveDate: '', billingRate: { daily: '', hourly: '', monthly: '' }, clientBillingRate: { daily: '', hourly: '', monthly: '' }, paidLeavePerMonth: '', reason: '' });
  const [revisingRate, setRevisingRate] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState({}); // { [idx]: true/false }

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
                rateHistory: a.rateHistory || [],
              };
            }),
            joiningDate: emp.joiningDate ? emp.joiningDate.slice(0, 10) : '',
            lastWorkingDate: emp.lastWorkingDate ? emp.lastWorkingDate.slice(0, 10) : '',
            separationReason: emp.separationReason || '',
            separationNotes: emp.separationNotes || '',
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
            // ── New onboarding fields ──
            gender: emp.gender || '',
            bloodGroup: emp.bloodGroup || '',
            fatherName: emp.fatherName || '',
            spouseName: emp.spouseName || '',
            religion: emp.religion || '',
            alternatePhone: emp.alternatePhone || '',
            permanentAddress: {
              street: emp.permanentAddress?.street || '',
              street2: emp.permanentAddress?.street2 || '',
              city: emp.permanentAddress?.city || '',
              state: emp.permanentAddress?.state || '',
              zip: emp.permanentAddress?.zip || '',
              country: emp.permanentAddress?.country || 'India',
            },
            familyMembers: (emp.familyMembers || []).map(fm => ({
              name: fm.name || '',
              relation: fm.relation || '',
              dateOfBirth: fm.dateOfBirth ? fm.dateOfBirth.slice(0, 10) : '',
              isDependent: fm.isDependent || false,
              phone: fm.phone || '',
            })),
            statutory: {
              aadhaar: emp.statutory?.aadhaar || '',
              uan: emp.statutory?.uan || '',
              pfNumber: emp.statutory?.pfNumber || '',
              esicNumber: emp.statutory?.esicNumber || '',
            },
            education: (emp.education || []).map(ed => ({
              degree: ed.degree || '',
              institution: ed.institution || '',
              yearOfPassing: ed.yearOfPassing || '',
              percentage: ed.percentage || '',
              specialization: ed.specialization || '',
            })),
            previousEmployment: (emp.previousEmployment || []).map(pe => ({
              company: pe.company || '',
              designation: pe.designation || '',
              fromDate: pe.fromDate ? pe.fromDate.slice(0, 10) : '',
              toDate: pe.toDate ? pe.toDate.slice(0, 10) : '',
              reasonForLeaving: pe.reasonForLeaving || '',
              lastCTC: pe.lastCTC || '',
            })),
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

  // ── Dynamic array helpers (family, education, prev employment) ─────
  const addFamilyMember = () => {
    setForm(prev => ({ ...prev, familyMembers: [...prev.familyMembers, { name: '', relation: '', dateOfBirth: '', isDependent: false, phone: '' }] }));
  };
  const removeFamilyMember = (idx) => {
    setForm(prev => ({ ...prev, familyMembers: prev.familyMembers.filter((_, i) => i !== idx) }));
  };
  const updateFamilyMember = (idx, field, value) => {
    setForm(prev => ({ ...prev, familyMembers: prev.familyMembers.map((fm, i) => i === idx ? { ...fm, [field]: value } : fm) }));
  };

  const addEducation = () => {
    setForm(prev => ({ ...prev, education: [...prev.education, { degree: '', institution: '', yearOfPassing: '', percentage: '', specialization: '' }] }));
  };
  const removeEducation = (idx) => {
    setForm(prev => ({ ...prev, education: prev.education.filter((_, i) => i !== idx) }));
  };
  const updateEducation = (idx, field, value) => {
    setForm(prev => ({ ...prev, education: prev.education.map((ed, i) => i === idx ? { ...ed, [field]: value } : ed) }));
  };

  const addPreviousEmployment = () => {
    setForm(prev => ({ ...prev, previousEmployment: [...prev.previousEmployment, { company: '', designation: '', fromDate: '', toDate: '', reasonForLeaving: '', lastCTC: '' }] }));
  };
  const removePreviousEmployment = (idx) => {
    setForm(prev => ({ ...prev, previousEmployment: prev.previousEmployment.filter((_, i) => i !== idx) }));
  };
  const updatePreviousEmployment = (idx, field, value) => {
    setForm(prev => ({ ...prev, previousEmployment: prev.previousEmployment.map((pe, i) => i === idx ? { ...pe, [field]: value } : pe) }));
  };

  // Copy current address to permanent address
  const copyAddressToPermanent = () => {
    setForm(prev => ({ ...prev, permanentAddress: { ...prev.address } }));
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
          startDate: todayStr(), endDate: '', status: 'active',
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
    if (isSeparating && !form.separationReason) {
      setError('Separation reason is required when changing status to Resigned or Terminated.');
      return false;
    }

    // Joining date is required for all employees
    if (!form.joiningDate) {
      setError('Joining Date is required.');
      return false;
    }

    // Non-billable: manager is required
    if (!form.billable) {
      if (!form.manager) {
        setError('Manager is required for non-billable employees.');
        return false;
      }
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
                rateHistory: a.rateHistory || [],
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
              rateHistory: a.rateHistory || [],
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

  // ── Rate Revision Handlers ──
  const openReviseModal = (idx) => {
    const assignment = form.assignments[idx];
    setReviseModal({ assignmentIndex: idx, currentRates: assignment });
    setReviseForm({
      effectiveDate: todayStr(),
      billingRate: { daily: '', hourly: '', monthly: '' },
      clientBillingRate: { daily: '', hourly: '', monthly: '' },
      paidLeavePerMonth: assignment.paidLeavePerMonth ?? 0,
      reason: '',
    });
  };

  const handleReviseRate = async () => {
    if (!reviseModal || !employeeId) return;
    if (!reviseForm.effectiveDate) {
      showToast('Effective date is required', 'error');
      return;
    }
    const hasBR = Object.values(reviseForm.billingRate).some(v => v && Number(v) > 0);
    const hasCBR = Object.values(reviseForm.clientBillingRate).some(v => v && Number(v) > 0);
    if (!hasBR && !hasCBR) {
      showToast('Please enter at least one new rate', 'error');
      return;
    }

    setRevisingRate(true);
    try {
      const payload = {
        effectiveDate: reviseForm.effectiveDate,
        reason: reviseForm.reason,
        paidLeavePerMonth: Number(reviseForm.paidLeavePerMonth) || 0,
      };
      if (hasBR) {
        payload.billingRate = {
          daily: Number(reviseForm.billingRate.daily) || 0,
          hourly: Number(reviseForm.billingRate.hourly) || 0,
          monthly: Number(reviseForm.billingRate.monthly) || 0,
        };
      }
      if (hasCBR) {
        payload.clientBillingRate = {
          daily: Number(reviseForm.clientBillingRate.daily) || 0,
          hourly: Number(reviseForm.clientBillingRate.hourly) || 0,
          monthly: Number(reviseForm.clientBillingRate.monthly) || 0,
        };
      }

      const result = await employeeApi.reviseRate(orgSlug, employeeId, reviseModal.assignmentIndex, payload);
      if (result.success && result.employee) {
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
              billingRate: { daily: a.billingRate?.daily ?? '', hourly: a.billingRate?.hourly ?? '', monthly: a.billingRate?.monthly ?? '' },
              clientBillingRate: { daily: cbr.daily ?? '', hourly: cbr.hourly ?? '', monthly: cbr.monthly ?? '' },
              paidLeavePerMonth: a.paidLeavePerMonth ?? 0,
              startDate: a.startDate ? a.startDate.slice(0, 10) : '',
              endDate: a.endDate ? a.endDate.slice(0, 10) : '',
              status: a.status || 'active',
              rateHistory: a.rateHistory || [],
            };
          }),
        }));
        setSavedAssignmentCount((emp.assignments || []).length);
        setReviseModal(null);
        showToast('Rate revised successfully', 'success');
      } else {
        showToast(result.error || 'Failed to revise rate', 'error');
      }
    } catch (err) {
      console.error('Revise rate error:', err);
      showToast(err.message || 'Failed to revise rate', 'error');
    } finally {
      setRevisingRate(false);
    }
  };

  const formatRate = (rate) => {
    if (!rate) return '\u2014';
    if (rate.monthly) return `\u20B9${Number(rate.monthly).toLocaleString('en-IN')}/month`;
    if (rate.daily) return `\u20B9${Number(rate.daily).toLocaleString('en-IN')}/day`;
    if (rate.hourly) return `$${Number(rate.hourly).toLocaleString()}/hour`;
    return '\u2014';
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
                {employmentTypes.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
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

        {/* ── Personal Details ─────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Personal Details</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setField('gender', e.target.value)}
                className="input-field w-full"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Blood Group</label>
              <select
                value={form.bloodGroup}
                onChange={(e) => setField('bloodGroup', e.target.value)}
                className="input-field w-full"
              >
                <option value="">Select Blood Group</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>

            {/* Father's Name */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Father's Name</label>
              <input
                type="text"
                value={form.fatherName}
                onChange={(e) => setField('fatherName', e.target.value)}
                className="input-field w-full"
                placeholder="Father's full name"
              />
            </div>

            {/* Spouse Name */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Spouse Name</label>
              <input
                type="text"
                value={form.spouseName}
                onChange={(e) => setField('spouseName', e.target.value)}
                className="input-field w-full"
                placeholder="Spouse's full name"
              />
            </div>

            {/* Religion */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Religion</label>
              <input
                type="text"
                value={form.religion}
                onChange={(e) => setField('religion', e.target.value)}
                className="input-field w-full"
                placeholder="e.g., Hindu, Muslim, Christian"
              />
            </div>

            {/* Alternate Phone */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Alternate Phone</label>
              <input
                type="text"
                value={form.alternatePhone}
                onChange={(e) => setField('alternatePhone', e.target.value)}
                className="input-field w-full"
                placeholder="+91 98765 43210"
              />
            </div>
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

            {/* Manager (only licensed portal users) */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Manager{!form.billable && <span className="text-red-400"> *</span>}</label>
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
              <p className="text-sm text-dark-400 mt-0.5">Assign this employee to client projects. Each assignment has its own billing rate. Syncs to ESS automatically.</p>
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
                    <>
                      <button
                        type="button"
                        onClick={() => saveAssignment(idx)}
                        disabled={savingAssignment === idx}
                        className="flex items-center gap-1 px-2.5 py-1 bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-lg text-xs font-medium hover:bg-rivvra-500/20 transition-colors disabled:opacity-50"
                      >
                        {savingAssignment === idx ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {savingAssignment === idx ? 'Saving...' : 'Save'}
                      </button>
                      {idx < savedAssignmentCount && assignment.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => openReviseModal(idx)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-colors"
                        >
                          <TrendingUp size={12} />
                          Revise Rate
                        </button>
                      )}
                    </>
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

              {/* Rate History Timeline */}
              {assignment.rateHistory?.length > 0 && (
                <div className="border-t border-dark-700/50 pt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedHistory(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="flex items-center gap-2 text-xs text-dark-400 hover:text-dark-200 transition-colors w-full"
                  >
                    <Clock size={12} />
                    <span className="font-medium">Rate History ({assignment.rateHistory.length} {assignment.rateHistory.length === 1 ? 'entry' : 'entries'})</span>
                    {expandedHistory[idx] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {expandedHistory[idx] && (
                    <div className="mt-2 space-y-2 pl-2 border-l-2 border-dark-700/50 ml-1.5">
                      {[...assignment.rateHistory].reverse().map((entry, hIdx) => {
                        const effDate = formatDateUTC(entry.effectiveDate) || '—';
                        const endDate = formatDateUTC(entry.endDate) || 'Current';
                        return (
                          <div key={hIdx} className="py-1.5 pl-3">
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`font-medium ${!entry.endDate ? 'text-emerald-400' : 'text-dark-300'}`}>
                                {effDate} → {endDate}
                              </span>
                            </div>
                            <div className="text-xs text-dark-400 mt-0.5">
                              Candidate: {formatRate(entry.billingRate)} | Client: {formatRate(entry.clientBillingRate)}
                            </div>
                            {entry.reason && (
                              <div className="text-xs text-dark-500 mt-0.5 italic">
                                {entry.reason} — by {entry.changedByName || 'System'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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

        {/* ── Dates ── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-white font-semibold text-lg">Dates</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Joining Date — required for all */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Joining Date <span className="text-red-400">*</span></label>
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

              {/* Separation Reason */}
              {(form.status === 'resigned' || form.status === 'terminated') && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1">
                    Separation Reason {isSeparating && <span className="text-red-400">*</span>}
                  </label>
                  <select
                    value={form.separationReason}
                    onChange={(e) => setField('separationReason', e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Select reason...</option>
                    {separationReasons.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Separation Notes */}
              {(form.status === 'resigned' || form.status === 'terminated') && (
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-dark-300 mb-1">Separation Notes</label>
                  <textarea
                    value={form.separationNotes}
                    onChange={(e) => setField('separationNotes', e.target.value)}
                    className="input-field w-full"
                    rows={2}
                    placeholder="Optional remarks..."
                  />
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

        {/* ── Permanent Address ────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">Permanent Address</h2>
            <button
              type="button"
              onClick={copyAddressToPermanent}
              className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors"
            >
              Same as Current Address
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Street</label>
              <input
                type="text"
                value={form.permanentAddress.street}
                onChange={(e) => setNested('permanentAddress', 'street', e.target.value)}
                className="input-field w-full"
                placeholder="123 Main Street"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Street 2</label>
              <input
                type="text"
                value={form.permanentAddress.street2}
                onChange={(e) => setNested('permanentAddress', 'street2', e.target.value)}
                className="input-field w-full"
                placeholder="Apt, Suite, Floor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">City</label>
              <input
                type="text"
                value={form.permanentAddress.city}
                onChange={(e) => setNested('permanentAddress', 'city', e.target.value)}
                className="input-field w-full"
                placeholder="Mumbai"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">State</label>
              <input
                type="text"
                value={form.permanentAddress.state}
                onChange={(e) => setNested('permanentAddress', 'state', e.target.value)}
                className="input-field w-full"
                placeholder="Maharashtra"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">ZIP / Pincode</label>
              <input
                type="text"
                value={form.permanentAddress.zip}
                onChange={(e) => setNested('permanentAddress', 'zip', e.target.value)}
                className="input-field w-full"
                placeholder="400001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Country</label>
              <input
                type="text"
                value={form.permanentAddress.country}
                onChange={(e) => setNested('permanentAddress', 'country', e.target.value)}
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

          {/* Statutory Details sub-section */}
          <div className="border-t border-dark-700 pt-4 mt-4">
            <h3 className="text-white font-medium text-sm mb-3">Statutory Details</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Aadhaar Number</label>
                <input
                  type={showSensitive ? 'text' : 'password'}
                  value={form.statutory.aadhaar}
                  onChange={(e) => setNested('statutory', 'aadhaar', e.target.value)}
                  className="input-field w-full"
                  placeholder="1234 5678 9012"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">UAN</label>
                <input
                  type="text"
                  value={form.statutory.uan}
                  onChange={(e) => setNested('statutory', 'uan', e.target.value)}
                  className="input-field w-full"
                  placeholder="100123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">PF Number</label>
                <input
                  type="text"
                  value={form.statutory.pfNumber}
                  onChange={(e) => setNested('statutory', 'pfNumber', e.target.value)}
                  className="input-field w-full"
                  placeholder="MH/BAN/12345/123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">ESIC Number</label>
                <input
                  type="text"
                  value={form.statutory.esicNumber}
                  onChange={(e) => setNested('statutory', 'esicNumber', e.target.value)}
                  className="input-field w-full"
                  placeholder="31-00-123456-000-0001"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Family Members ──────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg flex items-center gap-2">
              <Users size={18} className="text-blue-400" />
              Family Members
            </h2>
            <button
              type="button"
              onClick={addFamilyMember}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors"
            >
              <Plus size={14} />
              Add Member
            </button>
          </div>

          {form.familyMembers.length === 0 && (
            <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
              <Users size={24} className="mx-auto mb-2 text-dark-600" />
              <p className="text-sm text-dark-500">No family members added yet.</p>
            </div>
          )}

          {form.familyMembers.map((fm, idx) => (
            <div key={idx} className="border border-dark-700 rounded-xl p-4 space-y-3 bg-dark-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-400">Family Member {idx + 1}</span>
                <button type="button" onClick={() => removeFamilyMember(idx)} className="p-1 text-dark-500 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Name</label>
                  <input type="text" value={fm.name} onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)} className="input-field w-full text-sm" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Relation</label>
                  <select value={fm.relation} onChange={(e) => updateFamilyMember(idx, 'relation', e.target.value)} className="input-field w-full text-sm">
                    <option value="">Select</option>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="spouse">Spouse</option>
                    <option value="son">Son</option>
                    <option value="daughter">Daughter</option>
                    <option value="brother">Brother</option>
                    <option value="sister">Sister</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Date of Birth</label>
                  <input type="date" value={fm.dateOfBirth} onChange={(e) => updateFamilyMember(idx, 'dateOfBirth', e.target.value)} className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Phone</label>
                  <input type="text" value={fm.phone} onChange={(e) => updateFamilyMember(idx, 'phone', e.target.value)} className="input-field w-full text-sm" placeholder="+91 98765 43210" />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={fm.isDependent} onChange={(e) => updateFamilyMember(idx, 'isDependent', e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-dark-600 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                  <span className="text-sm text-dark-300">Dependent</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Education ───────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg flex items-center gap-2">
              <GraduationCap size={18} className="text-purple-400" />
              Education
            </h2>
            <button
              type="button"
              onClick={addEducation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg text-sm font-medium hover:bg-purple-500/20 transition-colors"
            >
              <Plus size={14} />
              Add Education
            </button>
          </div>

          {form.education.length === 0 && (
            <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
              <GraduationCap size={24} className="mx-auto mb-2 text-dark-600" />
              <p className="text-sm text-dark-500">No education records added yet.</p>
            </div>
          )}

          {form.education.map((ed, idx) => (
            <div key={idx} className="border border-dark-700 rounded-xl p-4 space-y-3 bg-dark-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-400">Education {idx + 1}</span>
                <button type="button" onClick={() => removeEducation(idx)} className="p-1 text-dark-500 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Degree / Qualification</label>
                  <input type="text" value={ed.degree} onChange={(e) => updateEducation(idx, 'degree', e.target.value)} className="input-field w-full text-sm" placeholder="e.g., B.Tech, MBA" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Institution</label>
                  <input type="text" value={ed.institution} onChange={(e) => updateEducation(idx, 'institution', e.target.value)} className="input-field w-full text-sm" placeholder="University name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Specialization</label>
                  <input type="text" value={ed.specialization} onChange={(e) => updateEducation(idx, 'specialization', e.target.value)} className="input-field w-full text-sm" placeholder="e.g., Computer Science" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Year of Passing</label>
                  <input type="text" value={ed.yearOfPassing} onChange={(e) => updateEducation(idx, 'yearOfPassing', e.target.value)} className="input-field w-full text-sm" placeholder="2020" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Percentage / CGPA</label>
                  <input type="text" value={ed.percentage} onChange={(e) => updateEducation(idx, 'percentage', e.target.value)} className="input-field w-full text-sm" placeholder="e.g., 85% or 8.5 CGPA" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Previous Employment ─────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg flex items-center gap-2">
              <Building2 size={18} className="text-cyan-400" />
              Previous Employment
            </h2>
            <button
              type="button"
              onClick={addPreviousEmployment}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <Plus size={14} />
              Add Employment
            </button>
          </div>

          {form.previousEmployment.length === 0 && (
            <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
              <Building2 size={24} className="mx-auto mb-2 text-dark-600" />
              <p className="text-sm text-dark-500">No previous employment records added yet.</p>
            </div>
          )}

          {form.previousEmployment.map((pe, idx) => (
            <div key={idx} className="border border-dark-700 rounded-xl p-4 space-y-3 bg-dark-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-400">Employment {idx + 1}</span>
                <button type="button" onClick={() => removePreviousEmployment(idx)} className="p-1 text-dark-500 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Company</label>
                  <input type="text" value={pe.company} onChange={(e) => updatePreviousEmployment(idx, 'company', e.target.value)} className="input-field w-full text-sm" placeholder="Company name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Designation</label>
                  <input type="text" value={pe.designation} onChange={(e) => updatePreviousEmployment(idx, 'designation', e.target.value)} className="input-field w-full text-sm" placeholder="Job title" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Last CTC (Annual)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">₹</span>
                    <input type="number" value={pe.lastCTC} onChange={(e) => updatePreviousEmployment(idx, 'lastCTC', e.target.value)} className="input-field w-full pl-7 text-sm" placeholder="0" min="0" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">From Date</label>
                  <input type="date" value={pe.fromDate} onChange={(e) => updatePreviousEmployment(idx, 'fromDate', e.target.value)} className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">To Date</label>
                  <input type="date" value={pe.toDate} onChange={(e) => updatePreviousEmployment(idx, 'toDate', e.target.value)} className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Reason for Leaving</label>
                  <input type="text" value={pe.reasonForLeaving} onChange={(e) => updatePreviousEmployment(idx, 'reasonForLeaving', e.target.value)} className="input-field w-full text-sm" placeholder="e.g., Better opportunity" />
                </div>
              </div>
            </div>
          ))}
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
              <button type="button" onClick={() => setReviseModal(null)} className="text-dark-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Current Rates (read-only) */}
            <div className="bg-dark-900/50 rounded-lg p-3 mb-4">
              <p className="text-xs text-dark-500 uppercase tracking-wider font-medium mb-1">Current Rates</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-dark-400">Candidate:</span> <span className="text-white">{formatRate(reviseModal.currentRates?.billingRate)}</span></div>
                <div><span className="text-dark-400">Client:</span> <span className="text-white">{formatRate(reviseModal.currentRates?.clientBillingRate)}</span></div>
              </div>
            </div>

            {/* Effective Date */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-dark-400 mb-1">Effective Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={reviseForm.effectiveDate}
                onChange={(e) => setReviseForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                className="input-field w-full text-sm"
              />
            </div>

            {/* New Candidate Rate */}
            <div className="mb-4">
              <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">New Candidate Rate <span className="normal-case tracking-normal text-dark-600 ml-1">(fill any one)</span></p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'daily', label: '₹/day', symbol: '₹' },
                  { key: 'hourly', label: '$/hour', symbol: '$' },
                  { key: 'monthly', label: '₹/month', symbol: '₹' },
                ].map(({ key, label, symbol }) => (
                  <div key={key}>
                    <label className="block text-xs text-dark-400 mb-1">{label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                      <input
                        type="number"
                        value={reviseForm.billingRate[key]}
                        onChange={(e) => setReviseForm(prev => ({ ...prev, billingRate: { ...prev.billingRate, [key]: e.target.value } }))}
                        className="input-field w-full pl-7 text-sm"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Client Billing Rate */}
            <div className="mb-4">
              <p className="text-[11px] text-dark-500 uppercase tracking-wider font-medium mb-2">New Client Billing Rate <span className="normal-case tracking-normal text-dark-600 ml-1">(fill any one)</span></p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'daily', label: '₹/day', symbol: '₹' },
                  { key: 'hourly', label: '$/hour', symbol: '$' },
                  { key: 'monthly', label: '₹/month', symbol: '₹' },
                ].map(({ key, label, symbol }) => (
                  <div key={key}>
                    <label className="block text-xs text-dark-400 mb-1">{label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-xs">{symbol}</span>
                      <input
                        type="number"
                        value={reviseForm.clientBillingRate[key]}
                        onChange={(e) => setReviseForm(prev => ({ ...prev, clientBillingRate: { ...prev.clientBillingRate, [key]: e.target.value } }))}
                        className="input-field w-full pl-7 text-sm"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Paid Leave */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-dark-400 mb-1">Paid Leave (days/month)</label>
              <select
                value={reviseForm.paidLeavePerMonth}
                onChange={(e) => setReviseForm(prev => ({ ...prev, paidLeavePerMonth: Number(e.target.value) }))}
                className="input-field w-full text-sm"
              >
                {[0, 1, 2, 3].map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}/month</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-dark-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={reviseForm.reason}
                onChange={(e) => setReviseForm(prev => ({ ...prev, reason: e.target.value }))}
                className="input-field w-full text-sm"
                placeholder="e.g., Annual increment"
              />
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setReviseModal(null)}
                className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReviseRate}
                disabled={revisingRate}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {revisingRate ? (
                  <><Loader2 size={14} className="animate-spin" /> Applying...</>
                ) : (
                  <><TrendingUp size={14} /> Apply Revision</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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

            {/* Separation Reason & Notes summary */}
            <div className="bg-dark-700/50 border border-dark-600 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="text-dark-400">Reason:</span>
                <span className="text-white font-medium">{form.separationReason || '—'}</span>
              </div>
              {form.separationNotes && (
                <div className="text-sm mt-1">
                  <span className="text-dark-400">Notes:</span>
                  <span className="text-dark-200 ml-2">{form.separationNotes}</span>
                </div>
              )}
            </div>

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
