import { Check } from 'lucide-react';
import { runSteps } from '../utils/payrollRunGuidance';

// Where a payroll run has got to, as a horizontal strip.
//
// The run header offers six controls with no indication of sequence or
// position. This shows both. States come from runSteps() — derived, never
// stored — and exactly one step is ever `current`.
//
// The strip says where the run IS. The next-step banner says what to DO.
// During a re-process those differ, and that is intended: the run is still
// sitting in "Release payslips" while the immediate action is Re-process.
//
// Scrolls horizontally on narrow screens rather than wrapping — a wrapped
// stepper reads as two sequences instead of one.
export default function PayrollRunStepStrip({ run }) {
  const steps = runSteps(run);
  if (!steps.length) return null;

  return (
    <div className="mb-4 overflow-x-auto">
      <ol className="flex items-start gap-0 min-w-max sm:min-w-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const done = step.state === 'done';
          const current = step.state === 'current';
          return (
            <li key={step.key} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center px-2 sm:px-3 shrink-0">
                <div
                  className={[
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border',
                    done ? 'bg-green-500/15 border-green-500/40 text-green-400' : '',
                    current ? 'bg-rivvra-600 border-rivvra-500 text-white' : '',
                    !done && !current ? 'bg-dark-800 border-dark-600 text-dark-500' : '',
                  ].join(' ')}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
                <div className="mt-1.5 text-center whitespace-nowrap">
                  <div className={`text-[11px] leading-tight ${current ? 'text-white font-medium' : done ? 'text-dark-300' : 'text-dark-500'}`}>
                    {step.label}
                  </div>
                  {step.detail && (
                    <div className={`text-[10px] leading-tight mt-0.5 ${current ? 'text-rivvra-400' : 'text-dark-500'}`}>
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
              {!isLast && (
                <div className={`h-px flex-1 mt-3 min-w-[16px] ${done ? 'bg-green-500/30' : 'bg-dark-700'}`} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
