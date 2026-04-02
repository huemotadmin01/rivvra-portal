import { useState, useEffect } from 'react';
import { X, Loader2, Rocket, Clock, Shield, UserCheck, User, Monitor, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';

const RESPONSIBLE_ICONS = {
  hr: Shield,
  manager: UserCheck,
  employee: User,
  it: Monitor,
};

const RESPONSIBLE_LABELS = { hr: 'HR', manager: 'Manager', employee: 'Employee', it: 'IT' };

// Derive the applicableType tag from employee record (mirrors backend logic)
function getEmployeeApplicableType(emp) {
  const et = emp?.employmentType || 'confirmed';
  if (et === 'intern') return 'intern';
  if (et === 'external_consultant') return 'external_consultant';
  const billable = emp?.billable === true;
  if (et === 'internal_consultant') return billable ? 'internal_consultant_billable' : 'internal_consultant_nonbillable';
  return billable ? 'confirmed_billable' : 'confirmed_nonbillable';
}

export default function LaunchPlanModal({ isOpen, onClose, onLaunched, employee, orgSlug }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planType, setPlanType] = useState('onboarding');
  const [step, setStep] = useState(1); // 1 = select template, 2 = review assignments
  const [taskOverrides, setTaskOverrides] = useState([]); // [{index, assignedToId, assignedToName}]
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  useEffect(() => {
    if (!isOpen || !orgSlug) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setSelectedId(null);
    setStep(1);
    setTaskOverrides([]);

    const empType = getEmployeeApplicableType(employee);

    employeeApi.listPlanTemplates(orgSlug, planType, empType)
      .then((res) => {
        if (res.success) {
          setTemplates(res.templates);
          if (res.templates.length === 1) {
            setSelectedId(res.templates[0]._id);
          } else {
            const def = res.templates.find((t) => t.isDefault);
            if (def) setSelectedId(def._id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, orgSlug, planType, employee]);

  // Load active employees when moving to step 2
  useEffect(() => {
    if (step !== 2 || activeEmployees.length > 0 || !orgSlug) return;
    setLoadingEmployees(true);
    employeeApi.list(orgSlug, { status: 'active' })
      .then((res) => {
        if (res.success) {
          const emps = (res.employees || [])
            .map(e => ({ _id: e._id, fullName: e.fullName, linkedUserId: e.linkedUserId?.toString?.() || e.linkedUserId || '' }))
            .filter(e => e.fullName && e.linkedUserId)
            .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
          setActiveEmployees(emps);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, [step, orgSlug]);

  if (!isOpen || !employee) return null;

  const selectedTemplate = templates.find((t) => t._id === selectedId);

  const handleNextStep = () => {
    if (!selectedTemplate) return;
    // Initialize overrides from template defaults
    setTaskOverrides(
      selectedTemplate.tasks.map((t, i) => ({
        index: i,
        assignedToId: t.assignedToUserId || '',
        assignedToName: t.assignedToName || '',
      }))
    );
    setStep(2);
  };

  const handleOverrideChange = (taskIndex, employeeId) => {
    setTaskOverrides(prev => prev.map((o, i) => {
      if (i !== taskIndex) return o;
      if (!employeeId) return { ...o, assignedToId: '', assignedToName: '' };
      const emp = activeEmployees.find(e => e.linkedUserId === employeeId);
      return { ...o, assignedToId: employeeId, assignedToName: emp?.fullName || '' };
    }));
  };

  const handleLaunch = async () => {
    if (!selectedId) return;
    setLaunching(true);
    setError('');
    try {
      // Build overrides: only send tasks where user explicitly assigned someone
      const overrides = taskOverrides
        .filter(o => o.assignedToId)
        .map(o => ({ index: o.index, assignedToUserId: o.assignedToId, assignedToName: o.assignedToName }));

      const res = await employeeApi.launchPlan(orgSlug, employee._id, selectedId, overrides);
      if (res.success) {
        setSuccess('Plan launched successfully!');
        if (onLaunched) onLaunched(res.planInstance);
        setTimeout(() => {
          setSuccess('');
          onClose();
        }, 1200);
      } else {
        setError(res.error || 'Failed to launch plan');
      }
    } catch (err) {
      setError(err.message || 'Failed to launch plan');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-rivvra-500/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-rivvra-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Launch Plan</h2>
              <p className="text-dark-400 text-sm">for {employee.fullName}</p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-rivvra-500' : 'bg-dark-700'}`} />
            <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-rivvra-500' : 'bg-dark-700'}`} />
          </div>
          <p className="text-dark-500 text-xs mt-1.5">{step === 1 ? 'Step 1: Select template' : 'Step 2: Review & assign tasks'}</p>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {success}
            </div>
          )}

          {step === 1 && (
            <>
              {/* Plan Type Toggle */}
              <div className="flex gap-2">
                {[{ value: 'onboarding', label: 'Onboarding' }, { value: 'offboarding', label: 'Offboarding' }].map((pt) => (
                  <button key={pt.value} type="button" onClick={() => setPlanType(pt.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      planType === pt.value
                        ? 'bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-400'
                        : 'bg-dark-800 border border-dark-600 text-dark-400 hover:text-white hover:border-dark-500'
                    }`}>
                    {pt.label}
                  </button>
                ))}
              </div>

              {/* Template Selection */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-dark-400" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-dark-500 text-sm text-center py-6">No {planType} templates available for this employee type.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl._id} type="button"
                      onClick={() => setSelectedId(tpl._id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        selectedId === tpl._id
                          ? 'bg-rivvra-500/5 border-rivvra-500/30'
                          : 'bg-dark-800/50 border-dark-700 hover:border-dark-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${selectedId === tpl._id ? 'text-rivvra-400' : 'text-white'}`}>{tpl.name}</span>
                        <span className="text-dark-500 text-xs">{tpl.tasks?.length} tasks</span>
                      </div>
                      {tpl.description && <p className="text-dark-500 text-xs mt-0.5">{tpl.description}</p>}
                    </button>
                  ))}
                </div>
              )}

              {/* Actions — Step 1 */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-dark-400 hover:text-white">Cancel</button>
                <button
                  type="button" onClick={handleNextStep}
                  disabled={!selectedId}
                  className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  Review Assignments <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {step === 2 && selectedTemplate && (
            <>
              {/* Template name */}
              <div className="px-3 py-2 bg-dark-800/50 rounded-xl border border-dark-700">
                <span className="text-rivvra-400 text-sm font-medium">{selectedTemplate.name}</span>
                <span className="text-dark-500 text-xs ml-2">· {selectedTemplate.tasks.length} tasks</span>
              </div>

              {/* Task assignment list */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Task Assignments</label>
                <p className="text-dark-500 text-xs mb-3">Tasks auto-assign by role (HR/IT/Manager defaults). Override any task below.</p>
                {loadingEmployees ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={20} className="animate-spin text-dark-400" />
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                    {selectedTemplate.tasks.map((task, i) => {
                      const Icon = RESPONSIBLE_ICONS[task.responsibleType] || User;
                      const override = taskOverrides[i];
                      return (
                        <div key={i} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-dark-800/50 text-xs">
                          <span className="text-dark-500 w-4 flex-shrink-0">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-white block truncate">{task.title}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Icon size={10} className="text-dark-500" />
                              <span className="text-dark-500">{RESPONSIBLE_LABELS[task.responsibleType]}</span>
                              <span className="text-dark-600 ml-1">Day {task.relativeDays}</span>
                              {task.isMandatory && <span className="text-red-400 ml-1">*</span>}
                            </div>
                          </div>
                          <select
                            value={override?.assignedToId || ''}
                            onChange={(e) => handleOverrideChange(i, e.target.value)}
                            className="px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-dark-300 text-xs focus:outline-none focus:border-rivvra-500 min-w-[150px] max-w-[180px]"
                          >
                            <option value="">Auto ({RESPONSIBLE_LABELS[task.responsibleType]} default)</option>
                            {activeEmployees.map(emp => (
                              <option key={emp.linkedUserId} value={emp.linkedUserId}>{emp.fullName}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions — Step 2 */}
              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm text-dark-400 hover:text-white flex items-center gap-1">
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  type="button" onClick={handleLaunch}
                  disabled={launching}
                  className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {launching ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  Launch Plan
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
