import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, Briefcase, FileText } from 'lucide-react';

/**
 * AtsJobNew — routed create flow for INTERNAL job positions.
 * Client roles keep flowing exclusively through the CRM Won-opportunity
 * conversion (the sales funnel); this page exists so internal roles no
 * longer require fabricating a placeholder opportunity. isClientRole is
 * forced false and client/billing fields are not surfaced.
 * Lands the job at draft (approvalStatus: null) so the Submit-for-Approval
 * gate fires from the detail page, same as CRM-converted jobs.
 */
export default function AtsJobNew() {
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
  });
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employmentTypeOptions, setEmploymentTypeOptions] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);

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
    employeeApi.list(orgSlug, { status: 'active', limit: 500 })
      .then(res => {
        if (res?.success) {
          const list = res.employees || res.data || [];
          // Employees store their display name in fullName (name/email are
          // fallbacks) — mirror CrmOpportunityNew's normalization or the
          // options render blank.
          setEmployeeOptions(
            list
              .map((e) => ({ _id: String(e._id), name: e.fullName || e.name || e.email || '' }))
              .filter((e) => e.name)
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {});
  }, [orgSlug]);

  // Job creation is admin-only — mirrors the server's atsAdmin gate on
  // POST /ats/jobs so a non-admin can't reach the form by typing the URL.
  if (!isAdmin) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <div className="card p-8 text-center">
          <Briefcase size={36} className="mx-auto text-dark-500 mb-3" />
          <h1 className="text-lg font-semibold text-white mb-1">Admin access required</h1>
          <p className="text-sm text-dark-400 mb-4">
            Only ATS admins can create job positions. Ask an admin to open the role, then it'll be available for you to manage.
          </p>
          <button
            onClick={() => navigate(orgPath('/ats/jobs'))}
            className="text-sm text-rivvra-400 hover:text-rivvra-300"
          >
            ← Back to Job Positions
          </button>
        </div>
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

  const inputCls = 'bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none';

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">New Internal Job</h1>
        <p className="text-dark-400 text-sm mt-1">
          For in-house roles only — client roles are created by converting a Won CRM opportunity.
          Fill what you have; the rest can be completed on the job page before submitting for approval.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <SectionCard title="Role" icon={Briefcase}>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">
              Job Title <span className="text-red-400">*</span>
            </span>
            <input
              type="text"
              autoFocus
              required
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Business Development Executive"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Department</span>
            <select
              value={form.department}
              onChange={(e) => handleChange('department', e.target.value)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Employment Type</span>
            <select
              value={form.employmentType}
              onChange={(e) => handleChange('employmentType', e.target.value)}
              className={inputCls}
            >
              <option value="">
                {employmentTypeOptions.length ? '— Select —' : 'No types — add in ATS Configuration'}
              </option>
              {employmentTypeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Required Exp.</span>
            <input
              type="text"
              value={form.requiredExperience}
              onChange={(e) => handleChange('requiredExperience', e.target.value)}
              placeholder="e.g. 0-2 Years"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Expected Hires</span>
            <input
              type="number"
              min="1"
              value={form.expectedHires}
              onChange={(e) => handleChange('expectedHires', e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Work Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="e.g. Indore (Hybrid)"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Approver</span>
            <select
              value={form.approverId}
              onChange={(e) => handleChange('approverId', e.target.value)}
              className={inputCls}
            >
              <option value="">— Assign later —</option>
              {employeeOptions.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </SectionCard>

        <div className="mt-4">
          <SectionCard title="Job Description" icon={FileText}>
            <textarea
              rows={8}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Role overview, responsibilities, requirements… The public-facing JD is seeded from this and can be edited on the job page."
              className={`${inputCls} w-full my-2`}
            />
          </SectionCard>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="px-4 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Job
          </button>
        </div>
      </form>
    </div>
  );
}
