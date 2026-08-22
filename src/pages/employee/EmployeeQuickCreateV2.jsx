/**
 * EmployeeQuickCreateV2 — Odoo-style minimal create flow, on the design system.
 *
 * Route: /org/:slug/employee/add
 *
 * Mirrors the Contact `new-record` pattern: a tiny form (Full Name / Email /
 * Employment Type / Sourced By / Manager) creates a bare record, then hands
 * the user off to the full inline-editable EmployeeDetail page.
 *
 * Everything from `const navigate = useNavigate()` through `handleKeyDown` is
 * spliced in byte-identically — including `canSave`, the first-hire bootstrap
 * exception (`companyEmployeeCount === 0` waives Sourced By and Manager), and
 * the minimal create payload the backend fills the rest of.
 *
 * The one substitution is the picker: legacy used `EmployeePicker`, which
 * matched across name, employeeId and designation. ds `ComboBox` searches both
 * `label` and `sub`, so the employeeId and designation ride in `sub` and every
 * one of those three remains findable.
 *
 * Not triggered: create.
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
import { Loader2, Check, ChevronLeft, UserPlus, User, Info } from 'lucide-react';
import {
  Panel, Button, Input, Select, ComboBox, Field, Callout,
} from '../../components/ds';

const DEFAULT_EMPLOYMENT_TYPES = [
  { key: 'confirmed', label: 'Confirmed Employee' },
  { key: 'internal_consultant', label: 'Internal Consultant' },
  { key: 'external_consultant', label: 'External Consultant' },
  { key: 'intern', label: 'Intern' },
];

const note = { font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' };

// The picker's second line carries employeeId and designation so ComboBox's
// search — which spans label and sub — matches on all three, as the legacy
// EmployeePicker did.
const toOption = (e) => ({
  value: String(e._id),
  label: e.fullName || '',
  sub: [e.employeeId ? `#${e.employeeId}` : '', e.designation || ''].filter(Boolean).join(' · '),
});

export default function EmployeeQuickCreateV2() {
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

  const empOptions = managerOptions.map(toOption);

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Back link */}
      <Button variant="ghost" size="sm" iconLeft={<ChevronLeft size={14} />}
        onClick={() => navigate(orgPath('/employee/directory'))} style={{ marginBottom: 10 }}>
        Back to Directory
      </Button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
            <UserPlus size={17} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
            Add Employee
            <span style={{ font: "400 14px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>— Without ATS</span>
          </h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
            Create a minimal record now — fill in the rest on the detail page.
            {currentCompany?.name && (
              <> This employee will be added to <span style={{ color: 'var(--fg-2)' }}>{currentCompany.name}</span>.</>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving}
            iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}>
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={saving}>Discard</Button>
        </div>
      </div>

      {/* 2026-05-19: nudge admins toward ATS as the primary hire path. The
          ATS application → Hire → Create Employee flow pre-fills name,
          email, phone, recruiter, joining date, salary, and links the
          employee record back to the application for audit. Manual
          adds skip all of that — useful for founders, contractors, and
          off-ATS hires, but ATS is the path you want for tracked hires. */}
      <Callout tone="warn" icon={<Info size={16} />} style={{ marginBottom: 12 }}>
        <div style={{ font: "550 12.5px/1.4 'Inter', system-ui, sans-serif", marginBottom: 3 }}>
          Most hires should come from the ATS.
        </div>
        <div style={{ font: "400 11.5px/1.6 'Inter', system-ui, sans-serif" }}>
          If this person was hired through a job application in Rivvra, open the application instead and click <strong>Hire → Create Employee</strong>. The ATS flow pre-fills name, email, phone, recruiter, joining date, and offer details, and links the employee record back to the application.
          <br />
          Use this manual form only for off-ATS hires — founders, executive search, or one-off contractors that didn&apos;t go through a job posting.
        </div>
      </Callout>

      {error && (
        <Callout tone="danger" style={{ marginBottom: 12 }}>{error}</Callout>
      )}

      <Panel title="Basics" icon={<User size={15} />}>
        <div style={{ display: 'grid', gap: 14, padding: 4 }} onKeyDown={handleKeyDown}>
          <Field label="Full Name" required htmlFor="qc-name">
            <Input
              id="qc-name"
              autoFocus
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priyanshu Sahu"
            />
          </Field>

          <Field label="Email" required htmlFor="qc-email">
            <Input
              id="qc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="work.email@company.com"
            />
          </Field>

          <Field label="Employment Type" htmlFor="qc-type">
            <Select id="qc-type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              {employmentTypes.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
          </Field>

          {/* Sourced By — waived for the first hire of a company */}
          {isFirstHire ? (
            <Field label="Sourced By">
              <div style={{
                padding: '9px 12px', borderRadius: 'var(--r-2, 12px)',
                background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic',
              }}>
                First hire — no sourcing employee available yet
              </div>
              <p style={note}>
                {currentCompany?.name || 'This company'} has no employees yet, so the
                first hire cannot be attributed to a sourcing employee. Subsequent
                hires will require this field.
              </p>
            </Field>
          ) : (
            <Field label="Sourced By" required htmlFor="qc-sourced">
              <ComboBox
                id="qc-sourced"
                aria-label="Sourced By"
                value={sourcedByEmployeeId}
                options={empOptions}
                onChange={(id) => setSourcedByEmployeeId(id)}
                placeholder="Search by name or ID…"
                emptyLabel="Select employee…"
              />
              <p style={note}>Employee who referred or sourced this hire.</p>
            </Field>
          )}

          {/* Manager — waived for the first hire of a company */}
          {isFirstHire ? (
            <Field label="Manager">
              <div style={{
                padding: '9px 12px', borderRadius: 'var(--r-2, 12px)',
                background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic',
              }}>
                First hire — no manager available yet
              </div>
              <p style={note}>
                {currentCompany?.name || 'This company'} has no employees yet, so the
                first hire cannot have a manager. Subsequent hires will require this field.
              </p>
            </Field>
          ) : (
            <Field label="Manager" required htmlFor="qc-manager">
              <ComboBox
                id="qc-manager"
                aria-label="Manager"
                value={managerEmployeeId}
                options={empOptions}
                onChange={(id) => setManagerEmployeeId(id)}
                placeholder="Search by name or ID…"
                emptyLabel="Select employee…"
              />
              <p style={note}>Employee who manages this hire.</p>
            </Field>
          )}

          <p style={{ ...note, marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
            After saving you&apos;ll land on the employee&apos;s detail page where you can
            inline-edit every other field (phone, department, manager, salary,
            assignments, documents, and more). Employee ID will be auto-generated.
          </p>
        </div>
      </Panel>
    </div>
  );
}
