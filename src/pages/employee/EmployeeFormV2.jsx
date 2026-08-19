import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';
import { formatDateUTC, todayStr } from '../../utils/dateUtils';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import { getAddressLocale, validateZip } from '../../utils/addressLocale';
import { usePageTitle } from '../../hooks/usePageTitle';
import { Save, Loader2, AlertTriangle, Plus, Trash2, Briefcase, X, Link2, Unlink, TrendingUp, ChevronDown, ChevronUp, Clock, GraduationCap, Users, Building2 } from 'lucide-react';
import ComboSelect from '../../components/ComboSelect';
import EmployeePicker from '../../components/employee/EmployeePicker';
import AssignmentDocs from '../../components/employee/AssignmentDocs';
import {
  Panel, Chip, Button, Input, Select, Textarea, Switch, Field,
  Modal, Callout, ConfirmDialog, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// The last legacy page in the employee app, and the one that carries contractor
// money: candidate rates, client billing rates, rate revisions with effective
// dates, and the rate history each revision appends to.
//
// Everything from `const { employeeId } = useParams()` through `handleReviseRate`
// — 739 lines, including `validateForm`, `handleSubmit`, `saveAssignment`, the
// separation flow, the user link/unlink pair, and `updateAssignmentNested`'s
// one-rate-at-a-time rule — is spliced in byte-identically.
//
// No money arithmetic lives in the render: every rate is read and written, never
// computed, and all of the maths is server-side. So nothing in this migration
// can change a number. The rate *labels* are carried over exactly as they are,
// which is deliberate — see the finding below.
//
// Reported, not fixed:
//   • Every rate group is labelled `₹/day`, `$/hour`, `₹/month` — two currencies
//     inside one group, hardcoded, with no conversion and no reference to the
//     assignment's own billing currency. Repeated at four sites (both rate
//     groups on the assignment card, both in the revise-rate modal) and once
//     more in `validateForm`'s error text. Changing a money label is a money
//     change, so it is carried across untouched and raised instead.
//
// `ComboSelect`, `EmployeePicker` and `AssignmentDocs` stay as they are: the
// first two are shared widgets this page does not own, and the third is an
// upload flow.
//
// Not triggered: save, save assignment, revise rate, separate, link/unlink user.
// ─────────────────────────────────────────────────────────────────────────────

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
  // Default matches backend (`employee.js` POST handler defaults `billable`
  // to true when undefined). An earlier `false` default here was the root
  // cause of "Non-billable employees require: Joining Date" firing on every
  // new-record save — see audit H1.
  billable: true,
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
  // Audit H5 — these fields were silently dropped on edit because they
  // were missing from INITIAL_FORM / the loader. Now first-class.
  privateEmail: '',
  privatePhone: '',
  nationality: '',
  maritalStatus: '',
  sourcedByEmployeeId: '',
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

export default function EmployeeFormV2() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { companyCountry } = useCompany();

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
            privateEmail: emp.privateEmail || '',
            privatePhone: emp.privatePhone || '',
            nationality: emp.nationality || '',
            maritalStatus: emp.maritalStatus || '',
            sourcedByEmployeeId: emp.sourcedByEmployeeId || '',
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

  // Update a nested field inside an assignment (e.g. billingRate.daily).
  // For rate groups (billingRate, clientBillingRate) the UI treats "daily
  // OR hourly OR monthly" as mutually exclusive — BUT we only clear the
  // other two on the transition from empty→non-empty, so editing a value
  // the user already entered doesn't silently wipe a paste into a sibling
  // field (audit M3).
  const updateAssignmentNested = (idx, group, field, value) => {
    const isRateGroup = group === 'billingRate' || group === 'clientBillingRate';
    setForm(prev => ({
      ...prev,
      assignments: prev.assignments.map((a, i) => {
        if (i !== idx) return a;
        if (isRateGroup) {
          const existing = a[group] || {};
          const wasEmpty = !existing[field];
          const becomingNonEmpty = value !== '' && value != null;
          // Only wipe siblings on the empty→non-empty transition. Editing an
          // already-filled rate just updates that one field.
          if (wasEmpty && becomingNonEmpty) {
            return { ...a, [group]: { daily: '', hourly: '', monthly: '', [field]: value } };
          }
          return { ...a, [group]: { ...existing, [field]: value } };
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
    // Sourced By is mandatory at creation time so we always know who referred
    // a hire (drives the incentive flow). Existing records can still be saved
    // without it on edit.
    if (!isEdit && !form.sourcedByEmployeeId) {
      setError('Sourced By is required — pick the employee who referred this hire.');
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

    // Joining date is only required for NON-billable employees (match
    // backend behaviour at employee.js:703-708). Billable consultants
    // often don't have a joining date yet at create time.
    if (!form.billable && !form.joiningDate) {
      setError('Joining Date is required for non-billable employees.');
      return false;
    }

    // Manager is optional. A founder / org owner may legitimately have no
    // manager (top of hierarchy) — backend accepts null, so don't block here.

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

  if (loading) return <PageSpinner label="Loading employee…" />;

  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 };
  const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };
  const microHead = { font: "500 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)', margin: '4px 0 8px' };
  const req = <span style={{ color: 'var(--danger)' }}>*</span>;
  const hint = { font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' };
  const cardShell = { padding: 16, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)', display: 'grid', gap: 12 };

  // Rate money: the label/symbol triple below is carried over from the legacy
  // file exactly, mixed currencies and all. It is wrong (see the header note),
  // but a money label is money — it gets reported, not quietly corrected.
  const RATE_KINDS = [
    { key: 'daily', label: '₹/day', symbol: '₹' },
    { key: 'hourly', label: '$/hour', symbol: '$' },
    { key: 'monthly', label: '₹/month', symbol: '₹' },
  ];

  const MoneyInput = ({ id, symbol, value, onChange, dim }) => (
    <div style={{ position: 'relative', opacity: dim ? 0.4 : 1 }}>
      <span style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none',
        font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
      }}>{symbol}</span>
      <Input id={id} type="number" value={value} onChange={onChange} placeholder="0" min="0" style={{ paddingLeft: 28 }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: '0 0 16px' }}>
        {isEdit ? 'Edit Employee' : 'Add Employee'}
      </h1>

      {error && <Callout tone="danger" icon={<AlertTriangle size={16} />} style={{ marginBottom: 14 }}>{error}</Callout>}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        {/* ── Basic Information ──────────────────────────────────────── */}
        <Panel title="Basic Information">
          <div style={{ display: 'grid', gap: 14, padding: 4 }}>
            <div style={grid2}>
              <Field label="Full Name" required htmlFor="ef-name">
                <Input id="ef-name" type="text" required value={form.fullName} placeholder="John Doe"
                  onChange={(e) => setField('fullName', e.target.value)} />
              </Field>
              <Field label="Email" required htmlFor="ef-email">
                <Input id="ef-email" type="email" required value={form.email} placeholder="john@example.com"
                  onChange={(e) => setField('email', e.target.value)} />
              </Field>
              <Field label="Phone" htmlFor="ef-phone">
                <Input id="ef-phone" type="text" value={form.phone} placeholder="+91 98765 43210"
                  onChange={(e) => setField('phone', e.target.value)} />
              </Field>
              <Field label="Employee ID" htmlFor="ef-empid">
                <Input id="ef-empid" type="text" value={form.employeeId}
                  placeholder={isEdit ? 'EMP-001' : 'Auto-generated if left blank'}
                  onChange={(e) => setField('employeeId', e.target.value)} />
                {!isEdit && <p style={hint}>Leave blank to auto-generate from the next available ID</p>}
              </Field>
              <Field label="Employment Type" htmlFor="ef-emptype">
                <Select id="ef-emptype" value={form.employmentType} onChange={(e) => setField('employmentType', e.target.value)}>
                  {employmentTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </Select>
              </Field>
              {isEdit && (
                <Field label="Status" htmlFor="ef-status">
                  <Select id="ef-status" value={form.status} invalid={isSeparating}
                    onChange={(e) => setField('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                  </Select>
                </Field>
              )}
            </div>

            {isSeparating && (
              <Callout tone="danger" icon={<AlertTriangle size={16} />}>
                <div style={{ font: "550 12.5px/1.4 'Inter', system-ui, sans-serif" }}>Separation will be triggered on save</div>
                <div style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", marginTop: 3 }}>
                  All active assignments will be ended{linkedUser ? ', portal user will be unlinked,' : ''} and timesheet access will be blocked.
                </div>
              </Callout>
            )}
          </div>
        </Panel>

        {/* ── Personal Details ─────────────────────────────────────── */}
        <Panel title="Personal Details">
          <div style={{ ...grid2, padding: 4 }}>
            <Field label="Gender" htmlFor="ef-gender">
              <Select id="ef-gender" value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Blood Group" htmlFor="ef-blood">
              <Select id="ef-blood" value={form.bloodGroup} onChange={(e) => setField('bloodGroup', e.target.value)}>
                <option value="">Select Blood Group</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
              </Select>
            </Field>
            <Field label="Father's Name" htmlFor="ef-father">
              <Input id="ef-father" type="text" value={form.fatherName} placeholder="Father's full name"
                onChange={(e) => setField('fatherName', e.target.value)} />
            </Field>
            <Field label="Spouse Name" htmlFor="ef-spouse">
              <Input id="ef-spouse" type="text" value={form.spouseName} placeholder="Spouse's full name"
                onChange={(e) => setField('spouseName', e.target.value)} />
            </Field>
            <Field label="Religion" htmlFor="ef-religion">
              <Input id="ef-religion" type="text" value={form.religion} placeholder="e.g., Hindu, Muslim, Christian"
                onChange={(e) => setField('religion', e.target.value)} />
            </Field>
            <Field label="Alternate Phone" htmlFor="ef-altphone">
              <Input id="ef-altphone" type="text" value={form.alternatePhone} placeholder="+91 98765 43210"
                onChange={(e) => setField('alternatePhone', e.target.value)} />
            </Field>
            <Field label="Private Email" htmlFor="ef-pemail">
              <Input id="ef-pemail" type="email" value={form.privateEmail} placeholder="personal@example.com"
                onChange={(e) => setField('privateEmail', e.target.value)} />
              <p style={hint}>Personal email, visible only to the employee and admins.</p>
            </Field>
            <Field label="Private Phone" htmlFor="ef-pphone">
              <Input id="ef-pphone" type="text" value={form.privatePhone} placeholder="+91 98765 43210"
                onChange={(e) => setField('privatePhone', e.target.value)} />
            </Field>
            <Field label="Nationality" htmlFor="ef-nat">
              <Input id="ef-nat" type="text" value={form.nationality} placeholder="e.g., Indian"
                onChange={(e) => setField('nationality', e.target.value)} />
            </Field>
            <Field label="Marital Status" htmlFor="ef-marital">
              <Select id="ef-marital" value={form.maritalStatus} onChange={(e) => setField('maritalStatus', e.target.value)}>
                <option value="">Select Status</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </Select>
            </Field>
            <Field label={`Sourced By${!isEdit ? ' *' : ''}`}>
              <EmployeePicker
                value={form.sourcedByEmployeeId}
                employees={managerOptions}
                onChange={(id) => setField('sourcedByEmployeeId', id)}
                excludeIds={employeeId ? [employeeId] : []}
                placeholder="Search by name or ID…"
              />
              <p style={hint}>Employee who referred or sourced this hire.</p>
            </Field>
          </div>
        </Panel>

        {/* ── Organization ──────────────────────────────────────────── */}
        <Panel title="Organization">
          <div style={{ ...grid2, padding: 4 }}>
            <Field label="Department" htmlFor="ef-dept">
              <Select id="ef-dept" value={form.department} onChange={(e) => setField('department', e.target.value)}>
                <option value="">Select Department</option>
                {departments.map((dept) => <option key={dept._id} value={dept._id}>{dept.name}</option>)}
              </Select>
            </Field>

            <Field label={`Manager${!form.billable ? ' *' : ''}`}>
              <EmployeePicker
                value={form.manager}
                employees={managerOptions}
                onChange={(id) => setField('manager', id)}
                excludeIds={employeeId ? [employeeId] : []}
                placeholder="Search by name or ID…"
              />
            </Field>

            {isEdit && (
              <Field label="Related User">
                {linkedUser ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                  }}>
                    {linkedUser.picture ? (
                      <img src={linkedUser.picture} alt="" style={{ width: 28, height: 28, borderRadius: 99 }} />
                    ) : (
                      <span style={{
                        width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--brand-soft)', color: 'var(--fg)',
                        font: "700 11px/1 'Inter', system-ui, sans-serif",
                      }}>
                        {(linkedUser.name || linkedUser.email || '?')[0].toUpperCase()}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedUser.name || 'Unnamed'}</p>
                      <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedUser.email}</p>
                    </div>
                    <Button variant="ghost" size="sm" type="button" onClick={handleUnlinkUser} disabled={linkingUser}
                      style={{ color: 'var(--danger)' }}
                      iconLeft={linkingUser ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}>
                      Unlink
                    </Button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Input
                      id="ef-userlink"
                      type="text"
                      placeholder="Search portal users by name or email…"
                      value={userDropdownOpen ? userSearchQuery : ''}
                      onChange={(e) => { setUserSearchQuery(e.target.value); setUserDropdownOpen(true); }}
                      onFocus={() => { setUserDropdownOpen(true); setUserSearchQuery(''); }}
                      onBlur={() => setTimeout(() => setUserDropdownOpen(false), 200)}
                      disabled={linkingUser}
                    />
                    {userDropdownOpen && (() => {
                      const q = userSearchQuery.toLowerCase();
                      const filtered = orgMembers
                        .filter(m => m.userId)
                        .filter(m => !q || (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q));
                      return (
                        <div style={{
                          position: 'absolute', zIndex: 50, top: '100%', marginTop: 4, width: '100%',
                          maxHeight: 192, overflowY: 'auto', borderRadius: 9,
                          background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line-2), 0 12px 28px rgba(0,0,0,.28)',
                        }}>
                          {filtered.length === 0 ? (
                            <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, padding: '8px 10px' }}>No users found</p>
                          ) : filtered.map(m => (
                            <button key={m.userId} type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { handleLinkUser(m.userId); setUserDropdownOpen(false); setUserSearchQuery(''); }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '7px 10px', background: 'none', border: 0 }}
                            >
                              <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{m.name || 'Unnamed'}</p>
                              <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>{m.email || ''}</p>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
                <p style={hint}>
                  {linkedUser ? 'This employee is linked to a portal user account.' : 'Link this employee to a portal user for timesheet access.'}
                </p>
              </Field>
            )}

            <Field label="Designation / Job Title" htmlFor="ef-desig">
              <Input id="ef-desig" type="text" value={form.designation} placeholder="Software Engineer"
                onChange={(e) => setField('designation', e.target.value)} />
            </Field>

            <Field label="Billable">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 38 }}>
                <Switch checked={form.billable} label="Billable" onChange={(next) => setField('billable', next)} />
                <span style={{ font: "450 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Billable</span>
              </span>
            </Field>
          </div>
        </Panel>

        {/* ── Project Assignments ───────────────────────────────── */}
        <Panel
          title="Project Assignments"
          icon={<Briefcase size={15} />}
          actions={<Button variant="secondary" size="sm" type="button" onClick={addAssignment} iconLeft={<Plus size={14} />}>Add Assignment</Button>}
        >
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
              Assign this employee to client projects. Each assignment has its own billing rate. Syncs to ESS automatically.
            </p>

            {form.assignments.length === 0 && (
              <div style={{
                padding: '24px 16px', borderRadius: 'var(--r-2, 12px)', textAlign: 'center',
                border: `1px dashed ${form.billable ? 'var(--warn-ink)' : 'var(--line-2)'}`,
                background: form.billable ? 'var(--warn-soft)' : 'transparent',
              }}>
                <Briefcase size={22} style={{ color: 'var(--fg-4)' }} />
                <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '8px 0 0' }}>
                  No project assignments yet.{form.billable && ' At least one is required for billable employees.'}
                </p>
                <p style={{ ...hint, marginTop: 3 }}>Click &quot;Add Assignment&quot; to assign this employee to a client project.</p>
              </div>
            )}

            {form.assignments.map((assignment, idx) => (
              <div key={idx} style={cardShell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Assignment {idx + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <Select
                      value={assignment.status}
                      aria-label={`Assignment ${idx + 1} status`}
                      onChange={(e) => updateAssignment(idx, 'status', e.target.value)}
                      style={{ width: 'auto', height: 30 }}
                    >
                      <option value="active">Active</option>
                      <option value="ended">Ended</option>
                    </Select>
                    {isEdit && (
                      <>
                        <Button variant="secondary" size="sm" type="button"
                          onClick={() => saveAssignment(idx)} disabled={savingAssignment === idx}
                          iconLeft={savingAssignment === idx ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}>
                          {savingAssignment === idx ? 'Saving...' : 'Save'}
                        </Button>
                        {idx < savedAssignmentCount && assignment.status === 'active' && (
                          <Button variant="secondary" size="sm" type="button"
                            onClick={() => openReviseModal(idx)}
                            style={{ color: 'var(--warn-ink)' }} iconLeft={<TrendingUp size={12} />}>
                            Revise Rate
                          </Button>
                        )}
                      </>
                    )}
                    <Button variant="ghost" size="sm" type="button" aria-label={`Remove assignment ${idx + 1}`}
                      onClick={() => removeAssignment(idx)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                  </div>
                </div>

                <div style={grid2}>
                  <Field label="Client" required>
                    <ComboSelect
                      value={assignment.clientId}
                      displayValue={assignment.clientName}
                      options={tsClients}
                      onChange={(id, name) => setAssignmentClient(idx, id, name)}
                      placeholder="Search or create client..."
                    />
                  </Field>
                  <Field label="Project" required>
                    <ComboSelect
                      value={assignment.projectId}
                      displayValue={assignment.projectName}
                      options={tsProjects}
                      onChange={(id, name) => setAssignmentProject(idx, id, name)}
                      placeholder="Search or create project..."
                    />
                  </Field>
                </div>

                {/* Candidate Rate — fill only one */}
                <div>
                  <p style={microHead}>
                    Candidate Rate {req}
                    <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 5 }}>(fill any one)</span>
                  </p>
                  <div style={grid3}>
                    {RATE_KINDS.map(({ key, label, symbol }) => {
                      const otherFilled = Object.entries(assignment.billingRate || {}).some(([k, v]) => k !== key && v);
                      return (
                        <Field key={key} label={label} htmlFor={`ef-br-${idx}-${key}`}>
                          <MoneyInput id={`ef-br-${idx}-${key}`} symbol={symbol} dim={otherFilled}
                            value={assignment.billingRate?.[key] ?? ''}
                            onChange={(e) => updateAssignmentNested(idx, 'billingRate', key, e.target.value)} />
                        </Field>
                      );
                    })}
                  </div>
                </div>

                {/* Client Billing Rate — fill only one */}
                <div>
                  <p style={microHead}>
                    Client Billing Rate {req}
                    <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 5 }}>(fill any one)</span>
                  </p>
                  <div style={grid3}>
                    {RATE_KINDS.map(({ key, label, symbol }) => {
                      const otherFilled = Object.entries(assignment.clientBillingRate || {}).some(([k, v]) => k !== key && v);
                      return (
                        <Field key={key} label={label} htmlFor={`ef-cbr-${idx}-${key}`}>
                          <MoneyInput id={`ef-cbr-${idx}-${key}`} symbol={symbol} dim={otherFilled}
                            value={assignment.clientBillingRate?.[key] ?? ''}
                            onChange={(e) => updateAssignmentNested(idx, 'clientBillingRate', key, e.target.value)} />
                        </Field>
                      );
                    })}
                  </div>
                </div>

                <div style={grid3}>
                  <Field label="Paid Leave (days/month)" htmlFor={`ef-pl-${idx}`}>
                    <Select id={`ef-pl-${idx}`} value={assignment.paidLeavePerMonth ?? 0}
                      onChange={(e) => updateAssignment(idx, 'paidLeavePerMonth', Number(e.target.value))}>
                      {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}/month</option>)}
                    </Select>
                  </Field>
                  <Field label="Start Date" required htmlFor={`ef-sd-${idx}`}>
                    <Input id={`ef-sd-${idx}`} type="date" value={assignment.startDate}
                      onChange={(e) => updateAssignment(idx, 'startDate', e.target.value)} />
                  </Field>
                  <Field label="End Date" required htmlFor={`ef-ed-${idx}`}>
                    <Input id={`ef-ed-${idx}`} type="date" value={assignment.endDate || ''}
                      onChange={(e) => updateAssignment(idx, 'endDate', e.target.value)} />
                  </Field>
                </div>

                {/* Rate history */}
                {assignment.rateHistory?.length > 0 && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
                    <Button variant="ghost" size="sm" type="button"
                      aria-expanded={!!expandedHistory[idx]}
                      onClick={() => setExpandedHistory(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      iconLeft={<Clock size={12} />}
                      iconRight={expandedHistory[idx] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}>
                      Rate History ({assignment.rateHistory.length} {assignment.rateHistory.length === 1 ? 'entry' : 'entries'})
                    </Button>
                    {expandedHistory[idx] && (
                      <div style={{ display: 'grid', gap: 8, marginTop: 8, marginLeft: 6, paddingLeft: 10, borderLeft: '2px solid var(--line-2)' }}>
                        {[...assignment.rateHistory].reverse().map((entry, hIdx) => {
                          const effDate = formatDateUTC(entry.effectiveDate) || '—';
                          const endDate = formatDateUTC(entry.endDate) || 'Current';
                          return (
                            <div key={hIdx} style={{ padding: '5px 0' }}>
                              <span style={{
                                font: "500 11px/1.4 'Inter', system-ui, sans-serif",
                                color: !entry.endDate ? 'var(--brand-ink)' : 'var(--fg-2)',
                              }}>
                                {effDate} → {endDate}
                              </span>
                              <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>
                                Candidate: {formatRate(entry.billingRate)} | Client: {formatRate(entry.clientBillingRate)}
                              </div>
                              {entry.reason && (
                                <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic', marginTop: 2 }}>
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
                  <p style={{ ...hint, fontStyle: 'italic', margin: 0 }}>
                    {isEdit ? 'Save this assignment first to upload documents.' : 'Save employee first to upload assignment documents.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Dates ── */}
        <Panel title="Dates">
          <div style={{ ...grid2, padding: 4 }}>
            <Field label="Joining Date" required htmlFor="ef-doj">
              <Input id="ef-doj" type="date" value={form.joiningDate} onChange={(e) => setField('joiningDate', e.target.value)} />
            </Field>

            {(form.status === 'resigned' || form.status === 'terminated') && (
              <Field label="Last Working Date" required htmlFor="ef-lwd"
                error={!form.lastWorkingDate ? 'Required for resigned/terminated employees' : undefined}>
                <Input id="ef-lwd" type="date" required value={form.lastWorkingDate}
                  invalid={!form.lastWorkingDate}
                  onChange={(e) => setField('lastWorkingDate', e.target.value)} />
              </Field>
            )}

            {(form.status === 'resigned' || form.status === 'terminated') && (
              <Field label={`Separation Reason${isSeparating ? ' *' : ''}`} htmlFor="ef-sepreason">
                <Select id="ef-sepreason" value={form.separationReason} onChange={(e) => setField('separationReason', e.target.value)}>
                  <option value="">Select reason...</option>
                  {separationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            )}

            {(form.status === 'resigned' || form.status === 'terminated') && (
              <Field label="Separation Notes" htmlFor="ef-sepnotes" style={{ gridColumn: '1 / -1' }}>
                <Textarea id="ef-sepnotes" rows={2} value={form.separationNotes} placeholder="Optional remarks..."
                  onChange={(e) => setField('separationNotes', e.target.value)} />
              </Field>
            )}

            <Field label="Date of Birth" htmlFor="ef-dob">
              <Input id="ef-dob" type="date" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} />
            </Field>
          </div>
        </Panel>

        {/* ── Address ───────────────────────────────────────────────── */}
        {/* Labels + placeholders + zip hint come from the record's own
            country via utils/addressLocale — NOT the company switcher.
            See addressLocale.js header for rationale. Country is
            rendered first so the subsequent labels re-localise before
            the user types into them. */}
        {(() => {
          const addrLocale = getAddressLocale(form.address.country);
          const addrZipWarn = validateZip(form.address.zip, form.address.country);
          return (
            <Panel title="Address">
              <div style={{ ...grid2, padding: 4 }}>
                <Field label="Country" htmlFor="ef-a-country">
                  <Input id="ef-a-country" type="text" value={form.address.country} placeholder="India"
                    onChange={(e) => setNested('address', 'country', e.target.value)} />
                </Field>
                <Field label={addrLocale.street1Label} htmlFor="ef-a-street">
                  <Input id="ef-a-street" type="text" value={form.address.street}
                    placeholder={addrLocale.street1Placeholder || '123 Main Street'}
                    onChange={(e) => setNested('address', 'street', e.target.value)} />
                </Field>
                <Field label={addrLocale.street2Label} htmlFor="ef-a-street2">
                  <Input id="ef-a-street2" type="text" value={form.address.street2}
                    placeholder={addrLocale.street2Placeholder || 'Apt, Suite, Floor'}
                    onChange={(e) => setNested('address', 'street2', e.target.value)} />
                </Field>
                <Field label={addrLocale.cityLabel} htmlFor="ef-a-city">
                  <Input id="ef-a-city" type="text" value={form.address.city}
                    placeholder={addrLocale.cityPlaceholder || 'City'}
                    onChange={(e) => setNested('address', 'city', e.target.value)} />
                </Field>
                <Field label={addrLocale.stateLabel} htmlFor="ef-a-state">
                  <Input id="ef-a-state" type="text" value={form.address.state}
                    placeholder={addrLocale.statePlaceholder || 'State'}
                    onChange={(e) => setNested('address', 'state', e.target.value)} />
                </Field>
                <Field label={addrLocale.zipLabel} htmlFor="ef-a-zip">
                  <Input id="ef-a-zip" type="text" value={form.address.zip}
                    placeholder={addrLocale.zipPlaceholder || ''}
                    onChange={(e) => setNested('address', 'zip', e.target.value)} />
                  {addrZipWarn && (
                    <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)', margin: '5px 0 0' }}>{addrZipWarn}</p>
                  )}
                </Field>
              </div>
            </Panel>
          );
        })()}

        {/* ── Permanent Address ────────────────────────────────────── */}
        {(() => {
          const permLocale = getAddressLocale(form.permanentAddress.country);
          const permZipWarn = validateZip(form.permanentAddress.zip, form.permanentAddress.country);
          return (
            <Panel
              title="Permanent Address"
              actions={<Button variant="ghost" size="sm" type="button" onClick={copyAddressToPermanent}>Same as Current Address</Button>}
            >
              <div style={{ ...grid2, padding: 4 }}>
                <Field label="Country" htmlFor="ef-p-country">
                  <Input id="ef-p-country" type="text" value={form.permanentAddress.country} placeholder="India"
                    onChange={(e) => setNested('permanentAddress', 'country', e.target.value)} />
                </Field>
                <Field label={permLocale.street1Label} htmlFor="ef-p-street">
                  <Input id="ef-p-street" type="text" value={form.permanentAddress.street}
                    placeholder={permLocale.street1Placeholder || '123 Main Street'}
                    onChange={(e) => setNested('permanentAddress', 'street', e.target.value)} />
                </Field>
                <Field label={permLocale.street2Label} htmlFor="ef-p-street2">
                  <Input id="ef-p-street2" type="text" value={form.permanentAddress.street2}
                    placeholder={permLocale.street2Placeholder || 'Apt, Suite, Floor'}
                    onChange={(e) => setNested('permanentAddress', 'street2', e.target.value)} />
                </Field>
                <Field label={permLocale.cityLabel} htmlFor="ef-p-city">
                  <Input id="ef-p-city" type="text" value={form.permanentAddress.city}
                    placeholder={permLocale.cityPlaceholder || 'City'}
                    onChange={(e) => setNested('permanentAddress', 'city', e.target.value)} />
                </Field>
                <Field label={permLocale.stateLabel} htmlFor="ef-p-state">
                  <Input id="ef-p-state" type="text" value={form.permanentAddress.state}
                    placeholder={permLocale.statePlaceholder || 'State'}
                    onChange={(e) => setNested('permanentAddress', 'state', e.target.value)} />
                </Field>
                <Field label={permLocale.zipLabel} htmlFor="ef-p-zip">
                  <Input id="ef-p-zip" type="text" value={form.permanentAddress.zip}
                    placeholder={permLocale.zipPlaceholder || ''}
                    onChange={(e) => setNested('permanentAddress', 'zip', e.target.value)} />
                  {permZipWarn && (
                    <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)', margin: '5px 0 0' }}>{permZipWarn}</p>
                  )}
                </Field>
              </div>
            </Panel>
          );
        })()}

        {/* ── Emergency Contact ─────────────────────────────────────── */}
        <Panel title="Emergency Contact">
          <div style={{ ...grid2, padding: 4 }}>
            <Field label="Contact Name" htmlFor="ef-ec-name">
              <Input id="ef-ec-name" type="text" value={form.emergencyContact.name} placeholder="Jane Doe"
                onChange={(e) => setNested('emergencyContact', 'name', e.target.value)} />
            </Field>
            <Field label="Contact Phone" htmlFor="ef-ec-phone">
              <Input id="ef-ec-phone" type="text" value={form.emergencyContact.phone} placeholder="+91 98765 43210"
                onChange={(e) => setNested('emergencyContact', 'phone', e.target.value)} />
            </Field>
            <Field label="Relation" htmlFor="ef-ec-rel">
              <Input id="ef-ec-rel" type="text" value={form.emergencyContact.relation} placeholder="Spouse"
                onChange={(e) => setNested('emergencyContact', 'relation', e.target.value)} />
            </Field>
          </div>
        </Panel>

        {/* ── Bank Details ──────────────────────────────────────────── */}
        <Panel
          title="Bank Details"
          actions={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Chip tone="warn"><AlertTriangle size={11} /> Sensitive Data</Chip>
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowSensitive(!showSensitive)}>
                {showSensitive ? 'Hide' : 'Show'} values
              </Button>
            </span>
          )}
        >
          <div style={{ display: 'grid', gap: 14, padding: 4 }}>
            <div style={grid2}>
              <Field label="Account Number" htmlFor="ef-bank-acct">
                <Input id="ef-bank-acct" type={showSensitive ? 'text' : 'password'} autoComplete="off"
                  value={form.bankDetails.accountNumber} placeholder="1234567890"
                  onChange={(e) => setNested('bankDetails', 'accountNumber', e.target.value)} />
              </Field>
              <Field label="IFSC Code" htmlFor="ef-bank-ifsc">
                <Input id="ef-bank-ifsc" type="text" value={form.bankDetails.ifsc} placeholder="SBIN0001234"
                  onChange={(e) => setNested('bankDetails', 'ifsc', e.target.value)} />
              </Field>
              <Field label="PAN" htmlFor="ef-bank-pan">
                <Input id="ef-bank-pan" type={showSensitive ? 'text' : 'password'} autoComplete="off"
                  value={form.bankDetails.pan} placeholder="ABCDE1234F"
                  onChange={(e) => setNested('bankDetails', 'pan', e.target.value)} />
              </Field>
              <Field label="Bank Name" htmlFor="ef-bank-name">
                <Input id="ef-bank-name" type="text" value={form.bankDetails.bankName} placeholder="State Bank of India"
                  onChange={(e) => setNested('bankDetails', 'bankName', e.target.value)} />
              </Field>
            </div>

            {/* Statutory Details sub-section — India only (Aadhaar/UAN/PF/ESIC) */}
            {companyCountry === 'IN' && (
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
                <h3 style={{ font: "550 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 10px' }}>Statutory Details</h3>
                <div style={grid2}>
                  <Field label="Aadhaar Number" htmlFor="ef-st-aadhaar">
                    <Input id="ef-st-aadhaar" type={showSensitive ? 'text' : 'password'} autoComplete="off"
                      value={form.statutory.aadhaar} placeholder="1234 5678 9012"
                      onChange={(e) => setNested('statutory', 'aadhaar', e.target.value)} />
                  </Field>
                  <Field label="UAN" htmlFor="ef-st-uan">
                    <Input id="ef-st-uan" type="text" value={form.statutory.uan} placeholder="100123456789"
                      onChange={(e) => setNested('statutory', 'uan', e.target.value)} />
                  </Field>
                  <Field label="PF Number" htmlFor="ef-st-pf">
                    <Input id="ef-st-pf" type="text" value={form.statutory.pfNumber} placeholder="MH/BAN/12345/123"
                      onChange={(e) => setNested('statutory', 'pfNumber', e.target.value)} />
                  </Field>
                  <Field label="ESIC Number" htmlFor="ef-st-esic">
                    <Input id="ef-st-esic" type="text" value={form.statutory.esicNumber} placeholder="31-00-123456-000-0001"
                      onChange={(e) => setNested('statutory', 'esicNumber', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* ── Family Members ──────────────────────────────────────────── */}
        <Panel
          title="Family Members"
          icon={<Users size={15} />}
          actions={<Button variant="secondary" size="sm" type="button" onClick={addFamilyMember} iconLeft={<Plus size={14} />}>Add Member</Button>}
        >
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            {form.familyMembers.length === 0 && (
              <EmptyState compact icon={<Users size={20} />} title="No family members added yet." />
            )}
            {form.familyMembers.map((fm, idx) => (
              <div key={idx} style={cardShell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Family Member {idx + 1}</span>
                  <Button variant="ghost" size="sm" type="button" aria-label={`Remove family member ${idx + 1}`}
                    onClick={() => removeFamilyMember(idx)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                </div>
                <div style={grid3}>
                  <Field label="Name" htmlFor={`ef-fm-name-${idx}`}>
                    <Input id={`ef-fm-name-${idx}`} type="text" value={fm.name} placeholder="Full name"
                      onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)} />
                  </Field>
                  <Field label="Relation" htmlFor={`ef-fm-rel-${idx}`}>
                    <Select id={`ef-fm-rel-${idx}`} value={fm.relation} onChange={(e) => updateFamilyMember(idx, 'relation', e.target.value)}>
                      <option value="">Select</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="spouse">Spouse</option>
                      <option value="son">Son</option>
                      <option value="daughter">Daughter</option>
                      <option value="brother">Brother</option>
                      <option value="sister">Sister</option>
                      <option value="other">Other</option>
                    </Select>
                  </Field>
                  <Field label="Date of Birth" htmlFor={`ef-fm-dob-${idx}`}>
                    <Input id={`ef-fm-dob-${idx}`} type="date" value={fm.dateOfBirth}
                      onChange={(e) => updateFamilyMember(idx, 'dateOfBirth', e.target.value)} />
                  </Field>
                  <Field label="Phone" htmlFor={`ef-fm-phone-${idx}`}>
                    <Input id={`ef-fm-phone-${idx}`} type="text" value={fm.phone} placeholder="+91 98765 43210"
                      onChange={(e) => updateFamilyMember(idx, 'phone', e.target.value)} />
                  </Field>
                  <Field label="Dependent">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 38 }}>
                      <Switch checked={fm.isDependent} label={`Family member ${idx + 1} is a dependent`}
                        onChange={(next) => updateFamilyMember(idx, 'isDependent', next)} />
                      <span style={{ font: "450 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Dependent</span>
                    </span>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Education ───────────────────────────────────────────────── */}
        <Panel
          title="Education"
          icon={<GraduationCap size={15} />}
          actions={<Button variant="secondary" size="sm" type="button" onClick={addEducation} iconLeft={<Plus size={14} />}>Add Education</Button>}
        >
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            {form.education.length === 0 && (
              <EmptyState compact icon={<GraduationCap size={20} />} title="No education records added yet." />
            )}
            {form.education.map((ed, idx) => (
              <div key={idx} style={cardShell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Education {idx + 1}</span>
                  <Button variant="ghost" size="sm" type="button" aria-label={`Remove education ${idx + 1}`}
                    onClick={() => removeEducation(idx)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                </div>
                <div style={grid3}>
                  <Field label="Degree / Qualification" htmlFor={`ef-ed-deg-${idx}`}>
                    <Input id={`ef-ed-deg-${idx}`} type="text" value={ed.degree} placeholder="e.g., B.Tech, MBA"
                      onChange={(e) => updateEducation(idx, 'degree', e.target.value)} />
                  </Field>
                  <Field label="Institution" htmlFor={`ef-ed-inst-${idx}`}>
                    <Input id={`ef-ed-inst-${idx}`} type="text" value={ed.institution} placeholder="University name"
                      onChange={(e) => updateEducation(idx, 'institution', e.target.value)} />
                  </Field>
                  <Field label="Specialization" htmlFor={`ef-ed-spec-${idx}`}>
                    <Input id={`ef-ed-spec-${idx}`} type="text" value={ed.specialization} placeholder="e.g., Computer Science"
                      onChange={(e) => updateEducation(idx, 'specialization', e.target.value)} />
                  </Field>
                  <Field label="Year of Passing" htmlFor={`ef-ed-yr-${idx}`}>
                    <Input id={`ef-ed-yr-${idx}`} type="text" value={ed.yearOfPassing} placeholder="2020"
                      onChange={(e) => updateEducation(idx, 'yearOfPassing', e.target.value)} />
                  </Field>
                  <Field label="Percentage / CGPA" htmlFor={`ef-ed-pct-${idx}`}>
                    <Input id={`ef-ed-pct-${idx}`} type="text" value={ed.percentage} placeholder="e.g., 85% or 8.5 CGPA"
                      onChange={(e) => updateEducation(idx, 'percentage', e.target.value)} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Previous Employment ─────────────────────────────────────── */}
        <Panel
          title="Previous Employment"
          icon={<Building2 size={15} />}
          actions={<Button variant="secondary" size="sm" type="button" onClick={addPreviousEmployment} iconLeft={<Plus size={14} />}>Add Employment</Button>}
        >
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            {form.previousEmployment.length === 0 && (
              <EmptyState compact icon={<Building2 size={20} />} title="No previous employment records added yet." />
            )}
            {form.previousEmployment.map((pe, idx) => (
              <div key={idx} style={cardShell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Employment {idx + 1}</span>
                  <Button variant="ghost" size="sm" type="button" aria-label={`Remove employment ${idx + 1}`}
                    onClick={() => removePreviousEmployment(idx)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                </div>
                <div style={grid3}>
                  <Field label="Company" htmlFor={`ef-pe-co-${idx}`}>
                    <Input id={`ef-pe-co-${idx}`} type="text" value={pe.company} placeholder="Company name"
                      onChange={(e) => updatePreviousEmployment(idx, 'company', e.target.value)} />
                  </Field>
                  <Field label="Designation" htmlFor={`ef-pe-desig-${idx}`}>
                    <Input id={`ef-pe-desig-${idx}`} type="text" value={pe.designation} placeholder="Job title"
                      onChange={(e) => updatePreviousEmployment(idx, 'designation', e.target.value)} />
                  </Field>
                  <Field label="Last CTC (Annual)" htmlFor={`ef-pe-ctc-${idx}`}>
                    <MoneyInput id={`ef-pe-ctc-${idx}`} symbol={'₹'} value={pe.lastCTC}
                      onChange={(e) => updatePreviousEmployment(idx, 'lastCTC', e.target.value)} />
                  </Field>
                  <Field label="From Date" htmlFor={`ef-pe-from-${idx}`}>
                    <Input id={`ef-pe-from-${idx}`} type="date" value={pe.fromDate}
                      onChange={(e) => updatePreviousEmployment(idx, 'fromDate', e.target.value)} />
                  </Field>
                  <Field label="To Date" htmlFor={`ef-pe-to-${idx}`}>
                    <Input id={`ef-pe-to-${idx}`} type="date" value={pe.toDate}
                      onChange={(e) => updatePreviousEmployment(idx, 'toDate', e.target.value)} />
                  </Field>
                  <Field label="Reason for Leaving" htmlFor={`ef-pe-reason-${idx}`}>
                    <Input id={`ef-pe-reason-${idx}`} type="text" value={pe.reasonForLeaving} placeholder="e.g., Better opportunity"
                      onChange={(e) => updatePreviousEmployment(idx, 'reasonForLeaving', e.target.value)} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <Button type="submit" disabled={saving}
            iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}>
            {saving ? 'Saving...' : (isEdit ? 'Update Employee' : 'Add Employee')}
          </Button>
          <Button variant="secondary" type="button" onClick={() => navigate(orgPath('/employee/directory'))}>Cancel</Button>
        </div>
      </form>

      {/* ── Revise Rate Modal ────────────────────────────────────────── */}
      <Modal
        open={!!reviseModal}
        onClose={() => setReviseModal(null)}
        size="md"
        title="Revise Rate"
        icon={<TrendingUp size={16} />}
        footer={(
          <>
            <Button variant="secondary" size="sm" type="button" onClick={() => setReviseModal(null)}>Cancel</Button>
            <Button size="sm" type="button" block onClick={handleReviseRate} disabled={revisingRate}
              iconLeft={revisingRate ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}>
              {revisingRate ? 'Applying...' : 'Apply Revision'}
            </Button>
          </>
        )}
      >
        {reviseModal && (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Current rates — read-only, formatted by the spliced formatRate */}
            <div style={{ padding: 12, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)' }}>
              <p style={{ ...microHead, margin: '0 0 6px' }}>Current Rates</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, font: "400 12.5px/1.5 'Inter', system-ui, sans-serif" }}>
                <div><span style={{ color: 'var(--fg-4)' }}>Candidate:</span> <span style={{ color: 'var(--fg)' }}>{formatRate(reviseModal.currentRates?.billingRate)}</span></div>
                <div><span style={{ color: 'var(--fg-4)' }}>Client:</span> <span style={{ color: 'var(--fg)' }}>{formatRate(reviseModal.currentRates?.clientBillingRate)}</span></div>
              </div>
            </div>

            <Field label="Effective Date" required htmlFor="ef-rev-date">
              <Input id="ef-rev-date" type="date" value={reviseForm.effectiveDate}
                onChange={(e) => setReviseForm(prev => ({ ...prev, effectiveDate: e.target.value }))} />
            </Field>

            <div>
              <p style={microHead}>New Candidate Rate <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 5 }}>(fill any one)</span></p>
              <div style={grid3}>
                {RATE_KINDS.map(({ key, label, symbol }) => (
                  <Field key={key} label={label} htmlFor={`ef-rev-br-${key}`}>
                    <MoneyInput id={`ef-rev-br-${key}`} symbol={symbol} value={reviseForm.billingRate[key]}
                      onChange={(e) => setReviseForm(prev => ({ ...prev, billingRate: { ...prev.billingRate, [key]: e.target.value } }))} />
                  </Field>
                ))}
              </div>
            </div>

            <div>
              <p style={microHead}>New Client Billing Rate <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 5 }}>(fill any one)</span></p>
              <div style={grid3}>
                {RATE_KINDS.map(({ key, label, symbol }) => (
                  <Field key={key} label={label} htmlFor={`ef-rev-cbr-${key}`}>
                    <MoneyInput id={`ef-rev-cbr-${key}`} symbol={symbol} value={reviseForm.clientBillingRate[key]}
                      onChange={(e) => setReviseForm(prev => ({ ...prev, clientBillingRate: { ...prev.clientBillingRate, [key]: e.target.value } }))} />
                  </Field>
                ))}
              </div>
            </div>

            <Field label="Paid Leave (days/month)" htmlFor="ef-rev-pl">
              <Select id="ef-rev-pl" value={reviseForm.paidLeavePerMonth}
                onChange={(e) => setReviseForm(prev => ({ ...prev, paidLeavePerMonth: Number(e.target.value) }))}>
                {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}/month</option>)}
              </Select>
            </Field>

            <Field label="Reason (optional)" htmlFor="ef-rev-reason">
              <Input id="ef-rev-reason" type="text" value={reviseForm.reason} placeholder="e.g., Annual increment"
                onChange={(e) => setReviseForm(prev => ({ ...prev, reason: e.target.value }))} />
            </Field>
          </div>
        )}
      </Modal>

      {/* ── Separation Confirmation Dialog ──────────────────────────── */}
      <ConfirmDialog
        open={showSeparationConfirm}
        onCancel={() => setShowSeparationConfirm(false)}
        onConfirm={handleSeparationConfirmed}
        danger
        busy={saving}
        title="Confirm Employee Separation"
        confirmLabel={saving ? 'Processing...' : 'Confirm Separation'}
        message={(<>
        <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '0 0 12px' }}>
          You are marking <strong style={{ color: 'var(--fg)' }}>{form.fullName}</strong> as{' '}
          <strong style={{ color: 'var(--danger)', textTransform: 'capitalize' }}>{form.status}</strong>. This will:
        </p>

        <div style={{ padding: 12, marginBottom: 12, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)' }}>
          <div style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif" }}>
            <span style={{ color: 'var(--fg-4)' }}>Reason:</span>{' '}
            <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{form.separationReason || '—'}</span>
          </div>
          {form.separationNotes && (
            <div style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", marginTop: 3 }}>
              <span style={{ color: 'var(--fg-4)' }}>Notes:</span>{' '}
              <span style={{ color: 'var(--fg-2)' }}>{form.separationNotes}</span>
            </div>
          )}
        </div>

        <ul style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 18, font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
          <li>End all active project assignments (end date set to LWD: <strong style={{ color: 'var(--fg)' }}>{form.lastWorkingDate}</strong>)</li>
          {linkedUser && (
            <li>Unlink portal user <strong style={{ color: 'var(--fg)' }}>{linkedUser.name || linkedUser.email}</strong> — they will lose timesheet access</li>
          )}
          <li>Block future timesheet submissions for this employee</li>
        </ul>
        </>)}
      />
    </div>
  );
}
