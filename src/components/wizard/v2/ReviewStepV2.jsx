import { ChevronLeft, Mail, Calendar, Clock, Zap, Filter, Loader2 } from 'lucide-react';
import { computeEmailDay, getTemplateStats, DAY_LABELS, TRIGGER_CONFIG } from '../wizardConstants';
import { Panel, Button, Chip, Callout, Stat } from '../../ds';

const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const sectionHead = { display: 'flex', alignItems: 'center', gap: 8, font: "600 12px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)', margin: 0 };

/**
 * Final review before activation.
 *
 * Every derived summary below is spliced verbatim, because each is a claim the
 * user acts on:
 *   • `timeRange` reads the FIRST enabled day's hours and presents them as the
 *     window. That is legacy behaviour and it is a simplification — if Monday
 *     runs 08:00-18:00 and Friday 09:00-17:00, this shows Monday's. Preserved
 *     as-is; changing what the summary claims is a product decision.
 *   • `activeRules` counts a trigger as configured if it updates status, moves
 *     a list, OR adds tags — the same predicate the backend acts on.
 *   • `activeCriteria` counts only `enabled` filters, so a criterion with a
 *     value but switched off is correctly not counted.
 *
 * ⚠️ `onActivate` is the outward-facing action on this whole subsystem — it
 *    starts real email sending. Never triggered during verification.
 */
function ReviewStepV2({ wizardData, isEditMode, saving, error, onActivate, onSaveDraft, onBack, onGoToStep }) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        <Button variant="ghost" onClick={onBack} iconLeft={<ChevronLeft size={16} />}>Back</Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="secondary" onClick={onSaveDraft} disabled={saving}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button onClick={onActivate} disabled={saving}
            iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>
            {isEditMode ? 'Save Changes' : 'Activate Sequence'}
          </Button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Callout tone="danger">{error}</Callout></div>}

      <div style={{ display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>
        {/* Name + totals */}
        <Panel>
          <h2 style={{ font: "700 19px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
            {name || 'Untitled sequence'}
          </h2>
          <p style={{ ...microStyle, marginTop: 5 }}>
            {stats.emails} email{stats.emails !== 1 ? 's' : ''} over {stats.totalDays} day{stats.totalDays !== 1 ? 's' : ''}
          </p>
        </Panel>

        {/* Emails */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={sectionHead}><Mail size={15} /> Emails</h3>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep('compose')}>Edit</Button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {emailSteps.map((step, idx) => {
              const originalIndex = steps.indexOf(step);
              const day = computeEmailDay(steps, originalIndex);
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Chip>Day {day}</Chip>
                  <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {step.subject || <span style={{ ...microStyle, fontStyle: 'italic' }}>No subject</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Schedule */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={sectionHead}><Calendar size={15} /> Schedule</h3>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep('schedule')}>Edit</Button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { icon: <Clock size={15} />, label: 'Timezone:', value: schedule.timezone?.replace(/_/g, ' ') },
              { icon: <Calendar size={15} />, label: 'Days:', value: activeDays.length > 0 ? activeDays.join(', ') : 'None selected' },
              { icon: <Clock size={15} />, label: 'Time:', value: timeRange },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, font: "450 13px/1.4 'Inter', system-ui, sans-serif" }}>
                <span style={{ color: 'var(--fg-4)', display: 'inline-flex' }}>{row.icon}</span>
                <span style={{ color: 'var(--fg-3)' }}>{row.label}</span>
                <span style={{ color: 'var(--fg)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Automation + criteria */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Stat
            label="Automation Rules"
            value={`${activeRules} rule${activeRules !== 1 ? 's' : ''}`}
            note="configured"
            icon={<Zap size={16} />}
            color="var(--acc-amber)"
          />
          <Stat
            label="Entering Criteria"
            value={`${activeCriteria} filter${activeCriteria !== 1 ? 's' : ''}`}
            note="active"
            icon={<Filter size={16} />}
            color="var(--acc-blue)"
          />
        </div>

        <p style={{ ...microStyle, textAlign: 'center', padding: '16px 0', margin: 0 }}>
          {isEditMode
            ? 'Changes will be saved to the existing sequence'
            : 'Contacts can be added from the sequence detail page after creation'}
        </p>
      </div>
    </div>
  );
}

export default ReviewStepV2;
