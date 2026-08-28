// ============================================================================
// AtsJobNewV2.jsx — routed INTERNAL job create flow, on ds
// ============================================================================
//
// Route: /org/:slug/ats/jobs/new, behind PageSwitch.
//
// Internal roles only. Client roles keep flowing exclusively through the CRM
// Won-opportunity conversion (the sales funnel); this page exists so an
// internal role no longer needs a fabricated placeholder opportunity.
//
// ── Two payload fields carry the whole design ───────────────────────────────
//   • `isClientRole: false` — forced, and no client/billing field is
//     surfaced. This is what keeps the two funnels apart.
//   • `approvalStatus: null` — lands the job at DRAFT so the
//     Submit-for-Approval gate fires from the detail page. Legacy's own
//     comment says why it is explicit: the endpoint otherwise defaults to
//     'pending', which strands jobs in pending-with-no-approver limbo.
//
// Both are spliced verbatim inside `handleSubmit`.
//
// ── The hook ordering is load-bearing (same as AtsCandidateNew) ─────────────
// All `useState`/`useEffect` are declared BEFORE the non-admin early return,
// because putting the gate first changes the hook COUNT when the role flips —
// the "Rendered fewer hooks than expected" crash hit in production in May. The
// slices are drawn so the gate sits BETWEEN two spliced blocks and re-theming
// it cannot move it relative to the hooks.
//
// ── Also carried across unchanged ───────────────────────────────────────────
//   • Both option loaders, each with its own `.catch(() => {})`. The form must
//     still open when either lookup fails — a dead departments call cannot
//     block creating a job.
//   • The departments filter `d.isActive !== false` (so a department with the
//     field absent still shows) and the employment-type fallback across
//     `res.items || res.employmentTypes`.
//   • `expectedHires: parseInt(…, 10) || 1` — a blank or unparseable value
//     becomes 1, never NaN.
//   • The error toast preferring `res?.fieldErrors?.employmentType` over the
//     generic message, which is how the server tells you the type is invalid.
//
// `shared/EmployeeLookup` stays for the Approver picker, consistent with every
// other migrated ATS page (see phase 33).
//
// Not triggered: job creation.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import PersonLookup from '../../components/shared/PersonLookup';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, Briefcase, FileText } from 'lucide-react';
import { Panel, Button, Field, Input, Select, Textarea, EmptyState } from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

// The Approver picker is an inline EntityLookup, which renders bare text (read)
// or a bare search input (edit) and draws no box of its own. These are ds
// `Input`'s own box tokens — height, radius, surface and hairline — so the
// field lines up with the Inputs and Selects stacked above it instead of
// floating as loose text. Vertical padding stays 0 and the content is centred,
// so the taller edit-mode input sits inside the same 38px without the box
// jumping when you click into it.
const approverBoxStyle = {
  minHeight: 38, display: 'flex', alignItems: 'center', padding: '0 6px', width: '100%',
  borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2, #141b24)',
  boxShadow: '0 0 0 1px var(--line, rgba(255,255,255,.07))',
};

// ── Main Page ──────────────────────────────────────────────────────────────
function AtsJobNewV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Internal Job');

  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  // Hooks must be declared before any conditional return to keep hook
  // ordering stable across renders. The non-admin gate below otherwise
  // changes the hook count when the role flips, producing the
  // "Rendered fewer hooks than expected" prod crash we hit in May.
  const [form, setForm] = useState({
    name: '',
    department: '',
    employmentType: '',
    requiredExperience: '',
    expectedHires: '1',
    location: '',
    description: '',
    approverId: '',
    approverName: '',
  });
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employmentTypeOptions, setEmploymentTypeOptions] = useState([]);

  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.listDepartments(orgSlug)
      .then(res => {
        if (res?.success && Array.isArray(res.departments)) {
          setDepartmentOptions(res.departments.filter(d => d.isActive !== false).map(d => d.name));
        }
      })
      .catch(() => {});
    atsApi.listConfig(orgSlug, 'employment-types')
      .then(res => {
        if (res?.success) {
          const items = res.items || res.employmentTypes || [];
          setEmploymentTypeOptions(items.map(i => i.name || i.value).filter(Boolean));
        }
      })
      .catch(() => {});
  }, [orgSlug]);

  // Job creation is admin-only — mirrors the server's atsAdmin gate on
  // POST /ats/jobs so a non-admin can't reach the form by typing the URL.
  // Sits AFTER the hooks above; see the header note on hook ordering.
  if (!isAdmin) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 640, margin: '0 auto' }}>
        <Panel>
          <EmptyState
            icon={<Briefcase size={28} />}
            tone="warn"
            title="Admin access required"
            actions={(
              <Button variant="ghost" size="sm" onClick={() => navigate(orgPath('/ats/jobs'))}
                iconLeft={<ChevronLeft size={15} />}>
                Back to Job Positions
              </Button>
            )}
          >
            Only ATS admins can create job positions. Ask an admin to open the role,
            then it&apos;ll be available for you to manage.
          </EmptyState>
        </Panel>
      </div>
    );
  }
  const canSubmit = form.name.trim();

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        department: form.department || undefined,
        employmentType: form.employmentType || undefined,
        requiredExperience: form.requiredExperience.trim() || undefined,
        expectedHires: parseInt(form.expectedHires, 10) || 1,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
        approverId: form.approverId || undefined,
        // Internal-only flow: client roles come from CRM Won conversion.
        isClientRole: false,
        source: 'Direct',
        // Land at draft — the Submit-for-Approval gate must fire from the
        // detail page (the endpoint otherwise defaults to 'pending', which
        // strands jobs in pending-with-no-approver limbo).
        approvalStatus: null,
      };
      const res = await atsApi.createJob(orgSlug, payload);
      if (res?.success) {
        showToast('Job position created');
        const id = res.job?._id;
        if (id) navigate(orgPath(`/ats/jobs/${id}`), { replace: true });
        else navigate(orgPath('/ats/jobs'), { replace: true });
      } else {
        showToast(res?.fieldErrors?.employmentType || res?.error || 'Failed to create job position', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create job position', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 640, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} iconLeft={<ChevronLeft size={16} />}>
          Back
        </Button>
      </div>

      <div>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          New Internal Job
        </h1>
        <p style={{ ...microStyle, marginTop: 4 }}>
          For in-house roles only — client roles are created by converting a Won CRM opportunity.
          Fill what you have; the rest can be completed on the job page before submitting for approval.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
        <Panel title="Role" icon={<Briefcase size={16} />} style={{ overflow: 'visible' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Job Title" htmlFor="jn-name" required>
              <Input id="jn-name" type="text" autoFocus required
                value={form.name} onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. Business Development Executive" />
            </Field>

            <Field label="Department" htmlFor="jn-dept">
              <Select id="jn-dept" value={form.department} onChange={(e) => handleChange('department', e.target.value)}>
                <option value="">— Select —</option>
                {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>

            <Field label="Employment Type" htmlFor="jn-emptype">
              <Select id="jn-emptype" value={form.employmentType} onChange={(e) => handleChange('employmentType', e.target.value)}>
                {/* The empty option doubles as the "nothing configured" hint,
                    exactly as legacy — it is the only place an admin is told
                    the list comes from ATS Configuration. */}
                <option value="">
                  {employmentTypeOptions.length ? '— Select —' : 'No types — add in ATS Configuration'}
                </option>
                {employmentTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>

            <Field label="Required Exp." htmlFor="jn-exp">
              <Input id="jn-exp" type="text"
                value={form.requiredExperience} onChange={(e) => handleChange('requiredExperience', e.target.value)}
                placeholder="e.g. 0-2 Years" />
            </Field>

            <Field label="Expected Hires" htmlFor="jn-hires">
              <Input id="jn-hires" type="number" min="1"
                value={form.expectedHires} onChange={(e) => handleChange('expectedHires', e.target.value)} />
            </Field>

            <Field label="Work Location" htmlFor="jn-loc">
              <Input id="jn-loc" type="text"
                value={form.location} onChange={(e) => handleChange('location', e.target.value)}
                placeholder="e.g. Indore (Hybrid)" />
            </Field>

            {/* `variant="inline"` inside our own Field, NOT the default `row`.
                The row variant draws its own 140px label gutter and renders the
                value as bare text, so on this form Approver was the one control
                with its label beside it instead of above and no input box at
                all — it read as a read-only summary line and gave no hint it
                was clickable. Inline drops the gutter and lets Field supply the
                label, matching every other control here. Same pattern as
                AtsApplicationNewV2's Recruiter and QuickAddClientModalV2's
                Salesperson.

                `allowClear` matters here because Approver is optional: having
                picked someone you must be able to go back to none. */}
            <Field label="Approver">
              <div style={approverBoxStyle}>
                <PersonLookup
                  orgSlug={orgSlug}
                  variant="inline"
                  label=""
                  editable
                  allowClear
                  confirmsSave={false}
                  currentValue={form.approverId}
                  currentName={form.approverName}
                  placeholder="Search employees… (leave empty to assign later)"
                  onSelect={(id, name) => setForm((p) => ({ ...p, approverId: id || '', approverName: name || '' }))}
                />
              </div>
            </Field>
          </div>
        </Panel>

        <Panel title="Job Description" icon={<FileText size={16} />}>
          <Textarea
            rows={8}
            aria-label="Job description"
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Role overview, responsibilities, requirements… The public-facing JD is seeded from this and can be edited on the job page."
          />
        </Panel>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={saving || !canSubmit}
            iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>
            Create Job
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AtsJobNewV2;
