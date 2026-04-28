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
import { Loader2, Check, ChevronLeft, UserPlus, User, Mail, Briefcase, UserCheck } from 'lucide-react';

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

  usePageTitle('New Employee');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [employmentType, setEmploymentType] = useState('confirmed');
  const [sourcedByEmployeeId, setSourcedByEmployeeId] = useState('');
  const [employmentTypes, setEmploymentTypes] = useState(DEFAULT_EMPLOYMENT_TYPES);
  const [managerOptions, setManagerOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicPlatformSetting('employment_types')
      .then(res => { if (res?.items?.length) setEmploymentTypes(res.items); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.getManagerOptions(orgSlug)
      .then(res => { if (res?.success) setManagerOptions(res.managers || []); })
      .catch(() => {});
  }, [orgSlug]);

  const canSave =
    fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !!sourcedByEmployeeId;

  async function handleSave() {
    if (saving) return;
    setError('');
    if (!fullName.trim()) { setError('Full name is required'); return; }
    const normEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      setError('Please enter a valid email');
      return;
    }
    if (!sourcedByEmployeeId) {
      setError('Sourced By is required — pick the employee who referred this hire.');
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
        sourcedByEmployeeId,
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
              <h1 className="text-2xl font-bold text-white">New Employee</h1>
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

          <Field label="Sourced By" icon={UserCheck} required>
            <select
              value={sourcedByEmployeeId}
              onChange={(e) => setSourcedByEmployeeId(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 focus:border-rivvra-500 rounded px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="">— Select sourcing employee —</option>
              {managerOptions.map(m => (
                <option key={m._id} value={m._id}>{m.fullName}</option>
              ))}
            </select>
            <p className="text-[11px] text-dark-500 mt-1">Employee who referred or sourced this hire.</p>
          </Field>
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
