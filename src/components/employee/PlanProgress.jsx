import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import employeeApi from '../../utils/employeeApi';
import {
  Loader2, CheckCircle, Circle, Clock, Shield, UserCheck,
  User, Monitor, ChevronDown, ChevronUp, SkipForward,
} from 'lucide-react';

const RESPONSIBLE_LABELS = { hr: 'HR', manager: 'Manager', employee: 'Employee', it: 'IT' };
const RESPONSIBLE_ICONS = { hr: Shield, manager: UserCheck, employee: User, it: Monitor };

function Badge({ children, className }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

export default function PlanProgress({ employeeId, isAdmin }) {
  const { currentOrg } = useOrg();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [updatingTask, setUpdatingTask] = useState(null);

  const loadPlans = async () => {
    if (!currentOrg?.slug || !employeeId) return;
    try {
      const res = await employeeApi.listEmployeePlans(currentOrg.slug, employeeId);
      if (res.success) {
        setPlans(res.plans);
        // Auto-expand first active plan
        const active = res.plans.find((p) => p.status === 'active');
        if (active && !expandedPlan) setExpandedPlan(active._id);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPlans(); }, [currentOrg?.slug, employeeId]);

  const handleTaskAction = async (plan, task, newStatus) => {
    setUpdatingTask(task._id);
    try {
      await employeeApi.updatePlanTask(currentOrg.slug, plan._id, task._id, { status: newStatus });
      await loadPlans();
    } catch (e) { console.error(e); }
    finally { setUpdatingTask(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-dark-400" />
      </div>
    );
  }

  if (plans.length === 0) return null;

  return (
    <div className="space-y-4">
      {plans.map((plan) => {
        const isExpanded = expandedPlan === plan._id;
        const progressPct = plan.progress?.percentage || 0;
        const isActive = plan.status === 'active';
        const isCompleted = plan.status === 'completed';

        return (
          <div key={plan._id} className="card overflow-hidden">
            {/* Plan Header */}
            <div
              className="p-4 cursor-pointer hover:bg-dark-800/30 transition-colors"
              onClick={() => setExpandedPlan(isExpanded ? null : plan._id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isCompleted ? 'bg-green-500/10' : 'bg-rivvra-500/10'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle size={16} className="text-green-400" />
                    ) : (
                      <Clock size={16} className="text-rivvra-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{plan.templateName}</span>
                      <Badge className={plan.planType === 'onboarding' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}>
                        {plan.planType}
                      </Badge>
                      {isCompleted && <Badge className="bg-green-500/10 text-green-400">Completed</Badge>}
                    </div>
                    <p className="text-dark-500 text-xs mt-0.5">
                      Launched {new Date(plan.launchedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {plan.launchedByName && ` by ${plan.launchedByName}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-500' : 'bg-rivvra-500'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-dark-400 text-xs">{progressPct}%</span>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-dark-500" /> : <ChevronDown size={16} className="text-dark-500" />}
                </div>
              </div>
            </div>

            {/* Tasks */}
            {isExpanded && (
              <div className="border-t border-dark-800 px-4 pb-4">
                <div className="mt-3 space-y-1">
                  {plan.tasks.map((task) => {
                    const Icon = RESPONSIBLE_ICONS[task.responsibleType] || User;
                    const isDone = task.status === 'completed';
                    const isSkipped = task.status === 'skipped';
                    const isPending = task.status === 'pending';
                    const isOverdue = isPending && new Date(task.dueDate) < new Date();

                    return (
                      <div
                        key={task._id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
                          isDone ? 'bg-green-500/5' : isSkipped ? 'bg-dark-800/30' : isOverdue ? 'bg-red-500/5' : 'bg-dark-800/50'
                        }`}
                      >
                        {/* Status icon / action */}
                        {isDone ? (
                          <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                        ) : isSkipped ? (
                          <SkipForward size={16} className="text-dark-500 flex-shrink-0" />
                        ) : isAdmin && isActive ? (
                          <button
                            type="button"
                            onClick={() => handleTaskAction(plan, task, 'completed')}
                            disabled={updatingTask === task._id}
                            className="flex-shrink-0"
                          >
                            {updatingTask === task._id ? (
                              <Loader2 size={16} className="animate-spin text-dark-400" />
                            ) : (
                              <Circle size={16} className="text-dark-500 hover:text-rivvra-400 transition-colors cursor-pointer" />
                            )}
                          </button>
                        ) : (
                          <Circle size={16} className="text-dark-600 flex-shrink-0" />
                        )}

                        {/* Title */}
                        <span className={`text-sm flex-1 ${isDone ? 'text-dark-400 line-through' : isSkipped ? 'text-dark-500 line-through' : 'text-white'}`}>
                          {task.title}
                          {task.isMandatory && <span className="text-red-400 ml-1 text-xs">*</span>}
                        </span>

                        {/* Assignee */}
                        <div className="flex items-center gap-1 text-xs text-dark-500">
                          <Icon size={12} />
                          {task.responsibleUserName || RESPONSIBLE_LABELS[task.responsibleType]}
                        </div>

                        {/* Due date */}
                        <span className={`text-xs ${isOverdue && isPending ? 'text-red-400' : 'text-dark-600'}`}>
                          {new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>

                        {/* Skip button (admin only, pending non-mandatory tasks) */}
                        {isAdmin && isActive && isPending && !task.isMandatory && (
                          <button
                            type="button"
                            onClick={() => handleTaskAction(plan, task, 'skipped')}
                            className="text-dark-600 hover:text-amber-400 transition-colors text-xs"
                            title="Skip task"
                          >
                            <SkipForward size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
