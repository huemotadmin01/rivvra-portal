import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { TIMEZONE_OPTIONS, TIME_OPTIONS, DAY_LABELS } from './wizardConstants';

function ScheduleStep({ schedule, onScheduleChange, onNext, onBack }) {
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
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="card p-6 max-w-2xl mx-auto">
        {/* Timezone */}
        <div className="mb-6">
          <label className="block text-xs text-dark-400 mb-2">Choose time zone</label>
          <select
            value={schedule.timezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
            className="w-full max-w-md px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-sm text-white focus:outline-none focus:border-rivvra-500 appearance-none cursor-pointer"
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="flex items-start gap-2 mb-6 p-3 bg-dark-800/50 rounded-xl">
          <Info className="w-4 h-4 text-dark-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-dark-400 leading-relaxed">
            Schedule lets you specify which days and time slots your contacts will be emailed. Emails will only be sent on selected days.
          </p>
        </div>

        {/* Days */}
        <div className="space-y-3">
          {Object.entries(DAY_LABELS).map(([day, label]) => {
            const dayConfig = schedule.days[day] || { enabled: false, start: '08:00', end: '18:00' };
            return (
              <div key={day} className="flex items-center gap-4">
                <label className="flex items-center gap-3 w-32">
                  <input
                    type="checkbox"
                    checked={dayConfig.enabled}
                    onChange={() => handleDayToggle(day)}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className={`text-sm ${dayConfig.enabled ? 'text-white' : 'text-dark-500'}`}>
                    {label}
                  </span>
                </label>

                <select
                  value={dayConfig.start}
                  onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                  disabled={!dayConfig.enabled}
                  className="px-2 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-rivvra-500 disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  {TIME_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                <span className="text-dark-500 text-sm">-</span>

                <select
                  value={dayConfig.end}
                  onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                  disabled={!dayConfig.enabled}
                  className="px-2 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-rivvra-500 disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  {TIME_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ScheduleStep;
