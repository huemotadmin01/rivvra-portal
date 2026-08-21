import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { TIMEZONE_OPTIONS, TIME_OPTIONS, DAY_LABELS } from '../wizardConstants';
import { Panel, Button, Callout, Field, Select, Checkbox } from '../../ds';

/**
 * Sending window. Every handler is spliced verbatim — each one rebuilds the
 * nested `schedule.days` immutably, and getting a spread wrong here would let
 * one day's edit clobber another's hours.
 *
 * The per-day start/end selects stay DISABLED rather than hidden when a day is
 * off, exactly as legacy: the configured hours survive toggling the day off and
 * back on, and hiding them would suggest they had been cleared.
 */
function ScheduleStepV2({ schedule, onScheduleChange, onNext, onBack }) {
  function handleDayToggle(day) {
    onScheduleChange({
      ...schedule,
      days: {
        ...schedule.days,
        [day]: { ...schedule.days[day], enabled: !schedule.days[day].enabled }
      }
    });
  }

  function handleTimeChange(day, field, value) {
    onScheduleChange({
      ...schedule,
      days: {
        ...schedule.days,
        [day]: { ...schedule.days[day], [field]: value }
      }
    });
  }

  function handleTimezoneChange(tz) {
    onScheduleChange({ ...schedule, timezone: tz });
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <Button variant="ghost" onClick={onBack} iconLeft={<ChevronLeft size={16} />}>Back</Button>
        <Button onClick={onNext} iconRight={<ChevronRight size={16} />}>Continue</Button>
      </div>

      <div style={{ maxWidth: 672, margin: '0 auto' }}>
        <Panel>
          <div style={{ display: 'grid', gap: 22 }}>
            <Field label="Choose time zone" htmlFor="ss-tz">
              <Select id="ss-tz" value={schedule.timezone} onChange={(e) => handleTimezoneChange(e.target.value)} style={{ maxWidth: 420 }}>
                {TIMEZONE_OPTIONS.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </Select>
            </Field>

            <Callout icon={<Info size={16} />}>
              Schedule lets you specify which days and time slots your contacts will be emailed. Emails will only be sent on selected days.
            </Callout>

            <div style={{ display: 'grid', gap: 10 }}>
              {Object.entries(DAY_LABELS).map(([day, label]) => {
                const dayConfig = schedule.days[day] || { enabled: false, start: '08:00', end: '18:00' };
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span
                      onClick={() => handleDayToggle(day)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: 140, cursor: 'pointer' }}
                    >
                      <Checkbox
                        checked={dayConfig.enabled}
                        onChange={() => handleDayToggle(day)}
                        label={`Send on ${label}`}
                      />
                      <span aria-hidden style={{
                        font: "450 13px/1.4 'Inter', system-ui, sans-serif",
                        color: dayConfig.enabled ? 'var(--fg)' : 'var(--fg-4)',
                      }}>
                        {label}
                      </span>
                    </span>

                    {/* Disabled, not hidden — the hours survive toggling a day off. */}
                    <Select
                      value={dayConfig.start}
                      onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                      disabled={!dayConfig.enabled}
                      aria-label={`${label} start time`}
                      style={{ width: 108, height: 32, fontSize: 12.5 }}
                    >
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>

                    <span aria-hidden style={{ color: 'var(--fg-4)' }}>–</span>

                    <Select
                      value={dayConfig.end}
                      onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                      disabled={!dayConfig.enabled}
                      aria-label={`${label} end time`}
                      style={{ width: 108, height: 32, fontSize: 12.5 }}
                    >
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default ScheduleStepV2;
