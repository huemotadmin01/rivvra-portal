/**
 * EmployeeQuickCreate — Odoo-style minimal create flow.
 *
 * Route: /org/:slug/employee/add
 *
 * Mirrors the Contact `new-record` pattern: a tiny 3-field form
 * (Full Name / Email / Employment Type) creates a bare record, then
 * hands the user off to the full inline-editable EmployeeDetail page
 * where they fill in the remaining fields on blur.
 *
 * This replaces the previous ad-hoc 2200-line EmployeeForm for CREATE.
 * EmployeeForm is still wired to /employee/edit/:id for now (until the
 * EmployeeDetail page absorbs all of its edit affordances) — but new
 * records no longer route through it.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import employeeApi from '../../utils/employeeApi';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import SectionCard from '../../components/platform/detail/SectionCard';
import EmployeePicker from '../../components/employee/EmployeePicker';
import { Loader2, Check, ChevronLeft, UserPlus, User, Mail, Briefcase, UserCheck, Users, Info } from 'lucide-react';

const DEFAULT_EMPLOYMENT_TYPES = [
  { key: 'confirmed', label: 'Confirmed Employee' },
  { key: 'internal_consultant', label: 'Internal Consultant' },
  { key: 'external_consultant', label: 'External Consultant' },
  { key: 'intern', label: 'Intern' },
];

export default function EmployeeQuickCreate() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const orgSlug = currentOrg?.slug;

  usePageTitle('Add Employee — Without ATS');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [employmentType, setEmploymentType] = useState('confirmed');
  const [sourcedByEmployeeId, setSourcedByEmployeeId] = useState('');
  const [managerEmployeeId, setManagerEmployeeId] = useState('');
  const [employmentTypes, setEmploymentTypes] = useState(DEFAULT_EMPLOYMENT_TYPES);
  const [managerOptions, setManagerOptions] = useState([]);
  const [companyEmployeeCount, setCompanyEmployeeCount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isFirstHire = companyEmployeeCount === 0;

  useEffect(() => {
    getPublicPlatformSetting('employment_types')
      .then(res => { if (res?.items?.length) setEmploymentTypes(res.items); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orgSlug) return;
    // companyEmployeeCount tells us whether the bootstrap exception applies —
    // if this is the first hire of the company, Sourced By is not required.
    employeeApi.getManagerOptions(orgSlug)
      .then(res => {
        if (res?.success) {
          setManagerOptions(res.managers || []);
          if (typeof res.companyEmployeeCount === 'number') {
            setCompanyEmployeeCount(res.companyEmployeeCount);
          }
        }
      })
      .catch(() => {});
  }, [orgSlug, currentCompany?._id]);

  const canSave =
    fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    (isFirstHire || !!sourcedByEmployeeId) &&
    (isFirstHire || !!managerEmployeeId);

  async function handleSave() {
    if (saving) return;
    setError('');
    if (!fullName.trim()) { setError('Full name is required'); return; }
    const normEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      setError('Please enter a valid email');
      return;
    }
    if (!isFirstHire && !sourcedByEmployeeId) {
      setError('Sourced By is required — pick the employee who referred this hire.');
      return;
    }
    if (!isFirstHire && !managerEmployeeId) {
      setError('Manager is required — pick the employee who manages this hire.');
      return;
    }

    setSaving(true);
    try {
      // Minimal payload — backend defaults the rest (billable=true so no
      // joiningDate is required, employeeId auto-generated, etc.).
      const res = await employeeApi.create(orgSlug, {
        fullName: fullName.trim(),
        email: normEmail,
        employmentType,
        ...(sourcedByEmployeeId ? { sourcedByEmployeeId } : {}),
        ...(managerEmployeeId ? { manager: managerEmployeeId } : {}),
      });
      if (res?.success && res.employee?._id) {
        showToast('Employee created', 'success');
        // Hand off to the full inline-editable detail page
        navigate(orgPath(`/employee/${res.employee._id}`), { replace: true });
      } else {
        setError(res?.error || 'Failed to create employee');
      }
    } catch (err) {
      setError(err?.message || 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    navigate(orgPath('/employee/directory'));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && canSave && !saving) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header: back link + title + action buttons (mirrors ContactDetail create mode) */}
      <div className="mb-5">
        <button
          onClick={() => navigate(orgPath('/employee/directory'))}
          className="inline-flex items-center gap-1 text-xs text-dark-400 hover:text-white mb-3 transition-colors"
        >
          <ChevronLeft size={14} />
          Back to Directory
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-1">
              <UserPlus size={18} className="text-dark-400" />
              <h1 className="text-2xl font-bold text-white">Add Employee <span className="text-dark-500 font-normal text-lg">— Without ATS</span></h1>
            </div>
            <p className="text-xs text-dark-500">
              Create a minimal record now — fill in the rest on the detail page.
              {currentCompany?.name && (
                <> This employee will be added to <span className="text-dark-300">{currentCompany.name}</span>.</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white text-sm transition-colors disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      </div>

      {/* 2026-05-19: nudge admins toward ATS as the primary hire path. The
          ATS application → Hire → Create Employee flow pre-fills name,
          email, phone, recruiter, joining date, salary, and links the
          employee record back to the application for audit. Manual
          adds skip all of that — useful for founders, contractors, and
          off-ATS hires, but ATS is the path you want for tracked hires. */}
      <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm flex items-start gap-2">
        <Info size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-amber-100/90">
          <div className="font-medium text-amber-200 mb-0.5">Most hires should come from the ATS.</div>
          <div className="text-xs text-amber-100/70 leading-relaxed">
            If this person was hired through a job application in Rivvra, open the application instead and click <strong className="text-amber-200">Hire → Create Employee</strong>. The ATS flow pre-fills name, email, phone, recruiter, joining date, and offer details, and links the employee record back to the application.
            <br />
            Use this manual form only for off-ATS hires — founders, executive search, or one-off contractors that didn't go through a job posting.
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
          {error}
        </div>
      )}

      <SectionCard title="Basics" icon={User}>
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          <Field label="Full Name" icon={User} required>
            <input
              autoFocus
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priyanshu Sahu"
              className="w-full bg-dark-800 border border-dark-600 focus:border-rivvra-500 rounded px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none"
            />
          </Field>

          <Field label="Email" icon={Mail} required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="work.email@company.com"
              className="w-full bg-dark-800 border border-dark-600 focus:border-rivvra-500 rounded px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none"
            />
          </Field>

          <Field label="Employment Type" icon={Briefcase}>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 focus:border-rivvra-500 rounded px-3 py-2 text-sm text-white focus:outline-none"
            >
              {employmentTypes.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>

          {isFirstHire ? (
            <Field label="Sourced By" icon={UserCheck}>
              <div className="w-full bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-dark-400 italic">
                First hire — no sourcing employee available yet
              </div>
              <p className="text-[11px] text-dark-500 mt-1">
                {currentCompany?.name || 'This company'} has no employees yet, so the
                first hire cannot be attributed to a sourcing employee. Subsequent
                hires will require this field.
              </p>
            </Field>
          ) : (
            <Field label="Sourced By" icon={UserCheck} required>
              <EmployeePicker
                value={sourcedByEmployeeId}
                employees={managerOptions}
                onChange={(id) => setSourcedByEmployeeId(id)}
                placeholder="Search by name or ID…"
              />
              <p className="text-[11px] text-dark-500 mt-1">Employee who referred or sourced this hire.</p>
            </Field>
          )}

          {isFirstHire ? (
            <Field label="Manager" icon={Users}>
              <div className="w-full bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-dark-400 italic">
                First hire — no manager available yet
              </div>
              <p className="text-[11px] text-dark-500 mt-1">
                {currentCompany?.name || 'This company'} has no employees yet, so the
                first hire cannot have a manager. Subsequent hires will require this field.
              </p>
            </Field>
          ) : (
            <Field label="Manager" icon={Users} required>
              <EmployeePicker
                value={managerEmployeeId}
                employees={managerOptions}
                onChange={(id) => setManagerEmployeeId(id)}
                placeholder="Search by name or ID…"
              />
              <p className="text-[11px] text-dark-500 mt-1">Employee who manages this hire.</p>
            </Field>
          )}
        </div>

        <p className="text-[11px] text-dark-500 mt-5 pt-4 border-t border-dark-800">
          After saving you'll land on the employee's detail page where you can
          inline-edit every other field (phone, department, manager, salary,
          assignments, documents, and more). Employee ID will be auto-generated.
        </p>
      </SectionCard>
    </div>
  );
}

function Field({ label, icon: Icon, required, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-dark-300 mb-1.5">
        {Icon && <Icon size={12} className="text-dark-500" />}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
