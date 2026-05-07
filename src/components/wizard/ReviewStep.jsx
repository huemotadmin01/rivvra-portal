import { ChevronLeft, Mail, Calendar, Clock, Zap, Filter, Loader2, Check } from 'lucide-react';
import { computeEmailDay, getTemplateStats, DAY_LABELS, TRIGGER_CONFIG } from './wizardConstants';

function ReviewStep({ wizardData, isEditMode, saving, error, onActivate, onSaveDraft, onBack, onGoToStep }) {
  const { steps, name, schedule, automationRules, enteringCriteria } = wizardData;
  const stats = getTemplateStats(steps);
  const emailSteps = steps.filter(s => s.type === 'email');

  // Schedule summary
  const activeDays = Object.entries(schedule.days || {})
    .filter(([_, cfg]) => cfg.enabled)
    .map(([day]) => DAY_LABELS[day] || day);

  const timeRange = (() => {
    const enabled = Object.values(schedule.days || {}).filter(d => d.enabled);
    if (enabled.length === 0) return 'No days selected';
    const start = enabled[0]?.start || '08:00';
    const end = enabled[0]?.end || '18:00';
    return `${start} - ${end}`;
  })();

  // Count active automation rules
  const activeRules = TRIGGER_CONFIG.filter(t => {
    const rule = automationRules?.[t.key];
    return rule && (rule.updateStatus || rule.moveToList || (rule.addTags?.length > 0));
  }).length;

  // Count active entering criteria
  const activeCriteria = Object.values(enteringCriteria || {}).filter(c => c?.enabled).length;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onSaveDraft}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-dark-300 border border-dark-600 rounded-xl hover:border-dark-500 hover:text-white disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            onClick={onActivate}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isEditMode ? 'Save Changes' : 'Activate Sequence'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Sequence Name */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Sequence</h3>
            <button onClick={() => onGoToStep('compose')} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
          </div>
          <p className="text-lg font-bold text-white">{name || 'Untitled'}</p>
          <p className="text-sm text-dark-400 mt-1">
            {stats.emails} email{stats.emails !== 1 ? 's' : ''} over {stats.totalDays} day{stats.totalDays !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Emails Summary */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Emails
            </h3>
            <button onClick={() => onGoToStep('compose')} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
          </div>
          <div className="space-y-2">
            {emailSteps.map((step, idx) => {
              const originalIndex = steps.indexOf(step);
              const day = computeEmailDay(steps, originalIndex);
              return (
                <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-dark-800/50 rounded-lg">
                  <span className="text-xs text-dark-500 w-16 flex-shrink-0">Email {idx + 1}</span>
                  <span className="text-xs text-dark-500 w-12 flex-shrink-0">Day {day}</span>
                  <span className="text-sm text-white truncate">{step.subject || 'No subject'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule Summary */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Schedule
            </h3>
            <button onClick={() => onGoToStep('schedule')} className="text-xs text-rivvra-400 hover:text-rivvra-300">Edit</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-dark-500" />
              <span className="text-dark-400">Timezone:</span>
              <span className="text-white">{schedule.timezone?.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-dark-500" />
              <span className="text-dark-400">Days:</span>
              <span className="text-white">{activeDays.length > 0 ? activeDays.join(', ') : 'None selected'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-dark-500" />
              <span className="text-dark-400">Time:</span>
              <span className="text-white">{timeRange}</span>
            </div>
          </div>
        </div>

        {/* Automation & Criteria summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Automation Rules</h4>
            </div>
            <p className="text-sm text-dark-400">{activeRules} rule{activeRules !== 1 ? 's' : ''} configured</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Entering Criteria</h4>
            </div>
            <p className="text-sm text-dark-400">{activeCriteria} filter{activeCriteria !== 1 ? 's' : ''} active</p>
          </div>
        </div>

        {/* Note */}
        <div className="text-center text-xs text-dark-500 py-4">
          {isEditMode
            ? 'Changes will be saved to the existing sequence'
            : 'Contacts can be added from the sequence detail page after creation'
          }
        </div>
      </div>
    </div>
  );
}

export default ReviewStep;
